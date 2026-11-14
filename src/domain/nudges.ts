import { config } from "../config.ts";
import type { Db } from "../db.ts";
import { renderNudgeEmail, type NudgeEmailTask } from "../email.ts";
import type { Mailer } from "../mail.ts";
import { findGaps, gapAt, isFreeBetween, type Gap, type GapOptions } from "../nudge/gaps.ts";
import { leadMinutes, pickConfirmReminder, pickGapNudge, pickPrepTime } from "../nudge/timing.ts";
import { fmtTime, fmtWhen, localParts, zonedTimeToUtc } from "../time.ts";
import { loadCalendar, normEmail, type LoadedCalendar } from "./calendar.ts";
import { sendConfirmationRequests } from "./notify.ts";
import { logEvent, type TaskStatus } from "./tasks.ts";
import { createActionToken, type NudgeAction } from "./tokens.ts";

/**
 * Lập lịch và gửi nudge. Bảng `nudges` vừa là nhật ký vừa là hàng đợi:
 *  - `replan…` tính lại thời điểm nhắc mỗi khi task hoặc lịch thay đổi, cập nhật
 *    hoặc hủy các dòng `scheduled`;
 *  - `sendDueNudges` (việc định kỳ) kiểm tra lại rồi gửi các dòng đã đến giờ.
 * Thuật toán chọn giờ nằm ở src/nudge/ (thuần); file này chỉ nối nó với database.
 */

export type NudgeKind = "confirm_reminder" | "prep" | "gap" | "deadline";
export type NudgeStatus = "scheduled" | "sent" | "cancelled" | "skipped";
export type NudgeResponse = "done" | "started" | "snoozed" | "due_changed";

const KINDS: readonly NudgeKind[] = ["confirm_reminder", "prep", "gap", "deadline"];
const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export type NudgeRow = {
  id: string;
  task_id: string;
  kind: NudgeKind;
  scheduled_for: Date;
  status: NudgeStatus;
  reason: Record<string, unknown>;
  response: string | null;
  sent_at: Date | null;
};

/** Task cùng dữ liệu cần để chọn giờ nhắc. */
export type PlanTask = {
  id: string;
  meeting_id: string;
  meeting_title: string;
  next_occurrence_at: Date | null;
  title: string;
  status: TaskStatus;
  due_at: Date | null;
  effort_minutes: number;
  related_meeting_title: string | null;
  related_meeting_at: Date | null;
  sent_at: Date | null;
  reminder_sent_at: Date | null;
  committed_at: Date | null;
  nudge_snooze_count: number;
  nudge_snoozed_until: Date | null;
  owner_id: string;
  owner_name: string;
  owner_email: string;
};

const PLAN_TASK_SQL = `
  SELECT t.id, t.meeting_id, m.title AS meeting_title, m.next_occurrence_at, t.title, t.status, t.due_at,
         t.effort_minutes, t.related_meeting_title, t.related_meeting_at, t.sent_at, t.reminder_sent_at,
         t.committed_at, t.nudge_snooze_count, t.nudge_snoozed_until,
         p.id AS owner_id, p.display_name AS owner_name, p.email AS owner_email
    FROM tasks t
    JOIN participants p ON p.id = t.owner_participant_id
    JOIN meetings m ON m.id = t.meeting_id
   WHERE lower(p.email) = $1 AND t.status IN ('proposed', 'committed', 'in_progress')
   ORDER BY t.due_at NULLS LAST, t.id`;

const gapOpts = (): GapOptions => ({ minMinutes: config.nudge.minGapMinutes, bufferMinutes: config.nudge.bufferAfterMeetingMinutes });
const gapJson = (g: Gap) => ({ start: g.start.toISOString(), end: g.end.toISOString(), minutes: g.minutes });

/** Mốc mà lời nhắc hướng tới: cuộc họp liên quan hoặc hạn của task, lấy mốc đến trước. */
export type Anchor = { at: Date; kind: "meeting" | "due"; title: string | null };

/**
 * Cuộc họp liên quan lấy theo thứ tự: cuộc họp gắn riêng cho task → buổi kế tiếp của
 * chuỗi họp sinh ra task → không có thì chỉ dùng hạn. Mốc đã qua thì bỏ.
 */
export function anchorOf(task: PlanTask, now: Date): Anchor | null {
  const candidates: Anchor[] = [];
  if (task.related_meeting_at) {
    candidates.push({ at: task.related_meeting_at, kind: "meeting", title: task.related_meeting_title });
  } else if (task.next_occurrence_at) {
    candidates.push({ at: task.next_occurrence_at, kind: "meeting", title: task.meeting_title });
  }
  if (task.due_at) candidates.push({ at: task.due_at, kind: "due", title: null });
  return candidates.filter((c) => c.at.getTime() > now.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime())[0] ?? null;
}

// ---------- Giới hạn chống làm phiền ----------

type RateState = {
  /** Không gửi lời nhắc nào cho người này trước mốc này. null = gửi được ngay. */
  notBefore: Date | null;
};

/** Tối đa 3 lần nhắc mỗi người mỗi ngày (theo ngày địa phương của họ), cách nhau ít nhất 90 phút. */
async function rateState(db: Db, email: string, tz: string, now: Date): Promise<RateState> {
  const rows = await db.query<{ sent_at: Date }>(
    `SELECT n.sent_at FROM notifications n JOIN participants p ON p.id = n.recipient_participant_id
      WHERE lower(p.email) = $1 AND n.kind IN ('nudge', 'confirm_reminder') AND n.error IS NULL AND n.sent_at > $2
      ORDER BY n.sent_at`,
    [email, new Date(now.getTime() - 36 * HOUR)],
  );
  const lp = localParts(now, tz);
  const dayStart = zonedTimeToUtc(lp.year, lp.month, lp.day, 0, 0, tz).getTime();
  const nextDay = zonedTimeToUtc(lp.year, lp.month, lp.day + 1, 0, 0, tz).getTime();
  const sentToday = rows.filter((r) => r.sent_at.getTime() >= dayStart && r.sent_at.getTime() <= now.getTime()).length;
  const last = rows[rows.length - 1]?.sent_at ?? null;
  let notBefore = last ? last.getTime() + config.nudge.minSpacingMinutes * MINUTE : 0;
  if (sentToday >= config.nudge.maxPerDay) notBefore = Math.max(notBefore, nextDay);
  return { notBefore: notBefore > now.getTime() ? new Date(notBefore) : null };
}

// ---------- Tính lịch nhắc cho một task ----------

type Slot = { at: Date; reason: Record<string, unknown> };
type Plan = { eligible: false } | { eligible: true; anchorIso: string | null; slot: Slot | null };

const later = (...dates: (Date | null | undefined)[]): Date =>
  new Date(Math.max(...dates.filter((d): d is Date => !!d).map((d) => d.getTime())));

/**
 * Lời nhắc mà một task nên có, theo từng loại. `eligible: false` = loại này không áp
 * dụng (hủy dòng đang chờ nếu có); `slot: null` = áp dụng nhưng không tìm được thời điểm.
 */
export function planTask(task: PlanTask, loaded: LoadedCalendar, history: readonly NudgeRow[], rate: RateState, now: Date): Record<NudgeKind, Plan> {
  const off: Plan = { eligible: false };
  const plans: Record<NudgeKind, Plan> = { confirm_reminder: off, prep: off, gap: off, deadline: off };
  const { connected, cal } = loaded;
  const opts = gapOpts();
  const n = config.nudge;
  const floor = later(now, rate.notBefore);

  if (task.status === "proposed") {
    // Nhắc xác nhận theo lịch chỉ dành cho người có dữ liệu lịch; người chưa có vẫn do sweeper nhắc sau 4 giờ.
    if (connected && task.sent_at && !task.reminder_sent_at) {
      const pick = pickConfirmReminder(
        cal,
        {
          sentAt: task.sent_at,
          earliest: floor,
          expiresAt: new Date(task.sent_at.getTime() + config.expireAfterHours * HOUR),
          afterHours: config.reminderAfterHours,
        },
        opts,
      );
      plans.confirm_reminder = {
        eligible: true,
        anchorIso: null,
        slot: pick ? { at: pick.at, reason: { sent_at: task.sent_at.toISOString(), gap: gapJson(pick.gap) } } : null,
      };
    }
    return plans;
  }

  const anchor = anchorOf(task, now);
  if (!anchor) return plans;
  const anchorIso = anchor.at.toISOString();
  const base = { anchor_at: anchorIso, anchor_kind: anchor.kind, anchor_title: anchor.title, effort_minutes: task.effort_minutes };
  // Vừa xác nhận xong thì chưa nhắc ngay.
  const earliest = later(now, task.committed_at ? new Date(task.committed_at.getTime() + n.quietAfterCommitMinutes * MINUTE) : null);
  const closed = (kind: NudgeKind) => (row: NudgeRow) =>
    row.kind === kind && (row.status === "sent" || row.status === "skipped") && row.reason.anchor_at === anchorIso;

  // Nhắc chuẩn bị (có lịch) hoặc nhắc theo hạn (không có lịch): mỗi mốc chỉ một lần.
  const timed: NudgeKind = connected ? "prep" : "deadline";
  let timedAt: Date | null = history.find((row) => row.kind === timed && row.status === "scheduled")?.scheduled_for ?? null;
  if (!history.some(closed(timed))) {
    const pick = pickPrepTime(cal, { earliest, anchorAt: anchor.at, effortMinutes: task.effort_minutes, leadBaseMinutes: n.leadMinutes }, opts);
    plans[timed] = {
      eligible: true,
      anchorIso,
      slot: pick
        ? {
            at: pick.at,
            reason: {
              ...base,
              lead_minutes: leadMinutes(task.effort_minutes, n.leadMinutes),
              ideal_at: pick.idealAt.toISOString(),
              shifted: pick.shifted,
              gap: gapJson(pick.gap),
            },
          }
        : null,
    };
    if (pick) timedAt = pick.at;
  }

  // Nhắc khoảng trống: task chưa bắt đầu, chưa hoãn hai lần, và lần nhắc trước (nếu có) đã được phản hồi.
  if (connected && task.status === "committed" && task.nudge_snooze_count < 2) {
    const waiting = history.some((row) => closed("gap")(row) && row.response === null);
    if (!waiting) {
      const spacing = n.minSpacingMinutes * MINUTE;
      const pick = (from: Date) =>
        pickGapNudge(
          cal,
          { earliest: from, deadlineAt: anchor.at, effortMinutes: task.effort_minutes, after: task.nudge_snoozed_until, windowHours: n.gapWindowHours },
          opts,
        );
      const start = later(earliest, floor);
      let chosen = pick(start);
      // Không đặt sát lời nhắc chuẩn bị của cùng task: dời ra sau đó ít nhất 90 phút.
      if (chosen && timedAt && Math.abs(chosen.at.getTime() - timedAt.getTime()) < spacing) {
        chosen = pick(later(start, new Date(timedAt.getTime() + spacing)));
      }
      plans.gap = {
        eligible: true,
        anchorIso,
        slot: chosen
          ? {
              at: chosen.at,
              reason: {
                ...base,
                gap: gapJson(chosen.gap),
                score: chosen.score,
                fits: chosen.fits,
                after_snooze: task.nudge_snoozed_until?.toISOString() ?? null,
              },
            }
          : null,
      };
    }
  }
  return plans;
}

// ---------- Lập lịch lại ----------

async function closeNudge(db: Db, id: string, status: "cancelled" | "skipped", why: string, now: Date): Promise<void> {
  await db.query(`UPDATE nudges SET status = $2, updated_at = $3, reason = reason || $4::jsonb WHERE id = $1 AND status = 'scheduled'`, [
    id,
    status,
    now,
    JSON.stringify({ closed: why }),
  ]);
}

/** Hủy lời nhắc đang chờ của các task đã đóng (xong, hủy, bị từ chối, hết hạn chờ) hoặc không còn người làm. */
async function cancelOrphans(db: Db, now: Date): Promise<void> {
  await db.query(
    `UPDATE nudges SET status = 'cancelled', updated_at = $1, reason = reason || '{"closed":"task_closed"}'::jsonb
      WHERE status = 'scheduled'
        AND task_id IN (SELECT id FROM tasks WHERE status NOT IN ('proposed', 'committed', 'in_progress') OR owner_participant_id IS NULL)`,
    [now],
  );
}

async function nudgesFor(db: Db, taskIds: string[]): Promise<NudgeRow[]> {
  if (taskIds.length === 0) return [];
  return db.query<NudgeRow>(
    `SELECT id, task_id, kind, scheduled_for, status, reason, response, sent_at FROM nudges
      WHERE task_id IN (${taskIds.map((_, i) => `$${i + 1}`).join(", ")}) ORDER BY created_at, id`,
    taskIds,
  );
}

/**
 * Tính lại mọi lời nhắc của một người. Gọi khi task của họ đổi hạn, đổi trạng thái,
 * đổi người làm, khi lịch của họ thay đổi, và định kỳ để dự phòng. Chạy lại bao
 * nhiêu lần cũng cho cùng kết quả.
 */
export async function replanPerson(db: Db, rawEmail: string, now: Date): Promise<void> {
  const email = normEmail(rawEmail);
  await db.tx(async (tx) => {
    await cancelOrphans(tx, now);
    const tasks = await tx.query<PlanTask>(PLAN_TASK_SQL, [email]);
    if (tasks.length === 0) return;
    const loaded = await loadCalendar(tx, email, new Date(now.getTime() - DAY));
    const rate = await rateState(tx, email, loaded.cal.hours.timezone, now);
    const history = await nudgesFor(tx, tasks.map((t) => t.id));

    for (const task of tasks) {
      const rows = history.filter((row) => row.task_id === task.id);
      const plans = planTask(task, loaded, rows, rate, now);
      for (const kind of KINDS) {
        const plan = plans[kind];
        const current = rows.find((row) => row.kind === kind && row.status === "scheduled");
        if (!plan.eligible) {
          if (current) await closeNudge(tx, current.id, "cancelled", "not_eligible", now);
          continue;
        }
        const sameAnchor = !current || (current.reason.anchor_at ?? null) === plan.anchorIso;
        // Đã đến giờ gửi: để bước gửi kiểm tra lại và quyết định, không dời đi dưới tay nó.
        if (current && sameAnchor && current.scheduled_for.getTime() <= now.getTime()) continue;
        if (!plan.slot) {
          if (current) await closeNudge(tx, current.id, "cancelled", "no_slot", now);
          continue;
        }
        if (!current) {
          await tx.query(
            `INSERT INTO nudges (id, task_id, kind, scheduled_for, status, reason, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 'scheduled', $5, $6, $6)`,
            [crypto.randomUUID(), task.id, kind, plan.slot.at, JSON.stringify(plan.slot.reason), now],
          );
        } else if (!sameAnchor || current.scheduled_for.getTime() !== plan.slot.at.getTime()) {
          await tx.query(`UPDATE nudges SET scheduled_for = $2, reason = $3, updated_at = $4 WHERE id = $1`, [
            current.id,
            plan.slot.at,
            JSON.stringify(plan.slot.reason),
            now,
          ]);
        }
      }
    }
  });
}

/** Tính lại lời nhắc sau khi một task thay đổi. */
export async function replanTask(db: Db, taskId: string, now: Date): Promise<void> {
  const owner = await db.one<{ email: string }>(
    `SELECT p.email FROM tasks t JOIN participants p ON p.id = t.owner_participant_id WHERE t.id = $1`,
    [taskId],
  );
  if (owner) await replanPerson(db, owner.email, now);
  else await cancelOrphans(db, now);
}

/** Tính lại lời nhắc cho mọi người có task trong một cuộc họp. */
export async function replanMeeting(db: Db, meetingId: string, now: Date): Promise<void> {
  const owners = await db.query<{ email: string }>(
    `SELECT DISTINCT lower(p.email) AS email FROM tasks t JOIN participants p ON p.id = t.owner_participant_id WHERE t.meeting_id = $1`,
    [meetingId],
  );
  await cancelOrphans(db, now);
  for (const { email } of owners) await replanPerson(db, email, now);
}

/** Tính lại toàn bộ. Việc định kỳ gọi hàm này để dự phòng khi một lần lập lịch lại bị sót. */
export async function replanAll(db: Db, now: Date): Promise<void> {
  await cancelOrphans(db, now);
  const owners = await db.query<{ email: string }>(
    `SELECT DISTINCT lower(p.email) AS email FROM tasks t JOIN participants p ON p.id = t.owner_participant_id
      WHERE t.status IN ('proposed', 'committed', 'in_progress')`,
  );
  for (const { email } of owners) await replanPerson(db, email, now);
}

/** Ghi phản hồi của người làm vào các lời nhắc đã gửi mà chưa có phản hồi. */
export async function recordNudgeResponse(db: Db, taskId: string, response: NudgeResponse, now: Date): Promise<void> {
  await db.query(
    `UPDATE nudges SET response = $2, updated_at = $3 WHERE task_id = $1 AND status IN ('sent', 'skipped') AND response IS NULL`,
    [taskId, response, now],
  );
}

/** Lúc khoảng trống hiện tại của một người kết thúc; `now` nếu họ đang không ở trong khoảng trống nào. */
export async function currentGapEnd(db: Db, email: string, now: Date): Promise<Date> {
  const { cal } = await loadCalendar(db, email, new Date(now.getTime() - DAY));
  const gaps = findGaps(cal, now, new Date(now.getTime() + DAY), { minMinutes: 0, bufferMinutes: 0 });
  return gapAt(gaps, now)?.end ?? now;
}

/** Lời nhắc đang chờ của một task, sớm nhất trước. */
export function scheduledNudges(db: Db, taskId: string): Promise<NudgeRow[]> {
  return db.query<NudgeRow>(
    `SELECT id, task_id, kind, scheduled_for, status, reason, response, sent_at FROM nudges
      WHERE task_id = $1 AND status = 'scheduled' ORDER BY scheduled_for`,
    [taskId],
  );
}

// ---------- Gửi ----------

const fmtEffort = (minutes: number): string =>
  minutes < 60 ? `${minutes} phút` : `${Math.floor(minutes / 60)} giờ${minutes % 60 ? ` ${minutes % 60} phút` : ""}`;

/** Các câu giải thích trong email: vì sao nhắc lúc này. Tính từ lịch ngay lúc gửi. */
export function nudgeLines(kind: NudgeKind, task: PlanTask, loaded: LoadedCalendar, now: Date): string[] {
  const { connected, cal } = loaded;
  const tz = cal.hours.timezone;
  const anchor = anchorOf(task, now);
  if (!anchor) return [];
  const effort = fmtEffort(task.effort_minutes);
  const anchorLine =
    anchor.kind === "meeting"
      ? `${anchor.title || "Cuộc họp liên quan"} bắt đầu lúc ${fmtWhen(anchor.at, now, tz)}. Bạn đã nhận việc này trước buổi đó.`
      : `Hạn của việc này là ${fmtWhen(anchor.at, now, tz)}.`;
  if (!connected) return [anchorLine, `Việc này ước tính ${effort}.`];

  const gaps = findGaps(cal, now, anchor.at, gapOpts());
  const current = gapAt(gaps, now);
  if (kind === "gap") {
    if (!current) return [anchorLine, `Việc này ước tính ${effort}.`];
    const fits = current.minutes >= task.effort_minutes + 5;
    return [
      `Bạn trống đến ${fmtTime(current.end, tz)} (${current.minutes} phút). Việc này ước tính ${effort}, ${fits ? "đủ để làm xong ngay" : "đủ để bắt đầu"}.`,
      anchorLine,
    ];
  }
  const sameDay = (d: Date) => fmtWhen(d, now, tz).endsWith("hôm nay");
  const parts = [
    ...(current ? [`${current.minutes} phút bây giờ`] : []),
    ...gaps
      .filter((g) => g.start.getTime() > now.getTime())
      .slice(0, 2)
      .map((g) => `${g.minutes} phút lúc ${sameDay(g.start) ? fmtTime(g.start, tz) : fmtWhen(g.start, now, tz)}`),
  ];
  return [
    anchorLine,
    parts.length > 0 ? `Bạn có ${parts.join(" và ")} để làm việc này (ước tính ${effort}).` : `Việc này ước tính ${effort}.`,
  ];
}

export type SendResult = { emails: number; nudges: number; skipped: number; failed: number };

/**
 * Gửi các lời nhắc đã đến giờ. Với mỗi người:
 *  1. tính lại lịch nhắc (task còn mở không, hạn có đổi không);
 *  2. kiểm tra lần cuối: họ có rảnh suốt từ giờ hẹn đến bây giờ không. Không thì lời
 *     nhắc bị hủy và được lập lịch lại (hoặc bỏ, nếu là loại không được dời muộn);
 *  3. áp giới hạn 3 lần mỗi ngày, cách nhau 90 phút;
 *  4. gom mọi task đến giờ nhắc vào MỘT email.
 */
export async function sendDueNudges(db: Db, mailer: Mailer, now: Date): Promise<SendResult> {
  const result: SendResult = { emails: 0, nudges: 0, skipped: 0, failed: 0 };
  const people = await db.query<{ email: string }>(
    `SELECT DISTINCT lower(p.email) AS email
       FROM nudges n JOIN tasks t ON t.id = n.task_id JOIN participants p ON p.id = t.owner_participant_id
      WHERE n.status = 'scheduled' AND n.scheduled_for <= $1`,
    [now],
  );

  for (const { email } of people) {
    await replanPerson(db, email, now);
    const tasks = new Map((await db.query<PlanTask>(PLAN_TASK_SQL, [email])).map((t) => [t.id, t]));
    const due = (await nudgesFor(db, [...tasks.keys()])).filter(
      (row) => row.status === "scheduled" && row.scheduled_for.getTime() <= now.getTime(),
    );
    if (due.length === 0) continue;

    const loaded = await loadCalendar(db, email, new Date(now.getTime() - DAY));
    const valid: NudgeRow[] = [];
    for (const row of due) {
      if (isFreeBetween(loaded.cal, row.scheduled_for, now)) valid.push(row);
      else {
        await closeNudge(db, row.id, "cancelled", "missed", now);
        result.skipped += 1;
      }
    }

    const rate = await rateState(db, email, loaded.cal.hours.timezone, now);
    if (valid.length > 0 && rate.notBefore) {
      for (const row of valid) {
        // Nhắc chuẩn bị và nhắc theo hạn không được dời muộn: bỏ hẳn. Loại còn lại sẽ được lập lịch lại.
        const drop = row.kind === "prep" || row.kind === "deadline";
        await closeNudge(db, row.id, drop ? "skipped" : "cancelled", "rate_limited", now);
        result.skipped += 1;
      }
    } else if (valid.length > 0) {
      const taskNudges = valid.filter((row) => row.kind !== "confirm_reminder");
      if (taskNudges.length > 0) await sendTaskNudges(db, mailer, taskNudges, tasks, loaded, now, result);
      else await sendConfirmReminders(db, mailer, valid, tasks, now, result);
    }
    await replanPerson(db, email, now);
  }
  return result;
}

async function markSent(db: Db, ids: string[], now: Date): Promise<void> {
  for (const id of ids) {
    await db.query(`UPDATE nudges SET status = 'sent', sent_at = $2, updated_at = $2 WHERE id = $1 AND status = 'scheduled'`, [id, now]);
  }
}

async function sendTaskNudges(
  db: Db,
  mailer: Mailer,
  rows: NudgeRow[],
  tasks: Map<string, PlanTask>,
  loaded: LoadedCalendar,
  now: Date,
  result: SendResult,
): Promise<void> {
  // Mỗi task một thẻ. Nhắc chuẩn bị và nhắc khoảng trống của cùng một task đến cùng lúc thì gộp vào nhắc chuẩn bị.
  const byTask = new Map<string, { main: NudgeRow; merged: NudgeRow[] }>();
  for (const row of [...rows].sort((a, b) => Number(a.kind === "gap") - Number(b.kind === "gap"))) {
    const entry = byTask.get(row.task_id);
    if (entry) entry.merged.push(row);
    else byTask.set(row.task_id, { main: row, merged: [] });
  }
  // Việc gần mốc nhất lên đầu; cùng mốc thì theo tên để thứ tự ổn định.
  const entries = [...byTask.values()].sort((a, b) => {
    const [ta, tb] = [tasks.get(a.main.task_id)!, tasks.get(b.main.task_id)!];
    const due = (task: PlanTask) => anchorOf(task, now)?.at.getTime() ?? Infinity;
    return due(ta) - due(tb) || ta.title.localeCompare(tb.title, "vi");
  });

  const link = (raw: string) => `${config.baseUrl}/a/${raw}`;
  const emailTasks: NudgeEmailTask[] = [];
  for (const { main } of entries) {
    const task = tasks.get(main.task_id)!;
    const token = async (action: NudgeAction) =>
      link(await createActionToken(db, { meetingId: task.meeting_id, participantId: task.owner_id, taskId: task.id, action, now }));
    emailTasks.push({
      title: task.title,
      meetingTitle: task.meeting_title,
      dueAt: task.due_at,
      lines: nudgeLines(main.kind, task, loaded, now),
      links: {
        done: await token("done"),
        start: task.status === "committed" ? await token("start") : null,
        snooze: loaded.connected && task.status === "committed" ? await token("snooze") : null,
        reschedule: await token("reschedule"),
      },
    });
  }

  const first = tasks.get(entries[0]!.main.task_id)!;
  const mail = renderNudgeEmail({
    recipientName: first.owner_name,
    tasks: emailTasks,
    usesCalendar: loaded.connected,
    timezone: loaded.cal.hours.timezone,
  });
  let error: string | null = null;
  try {
    await mailer.send({ to: first.owner_email, toName: first.owner_name, ...mail });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  await db.query(
    `INSERT INTO notifications (id, meeting_id, recipient_participant_id, channel, kind, subject, body_html, body_text, error, sent_at)
     VALUES ($1, $2, $3, 'email', 'nudge', $4, $5, $6, $7, $8)`,
    [
      crypto.randomUUID(),
      first.meeting_id,
      first.owner_id,
      mail.subject,
      mailer.outboxOnly ? mail.html : null,
      mailer.outboxOnly ? mail.text : null,
      error,
      now,
    ],
  );
  if (error) {
    // Lời nhắc vẫn ở trạng thái chờ: lượt sau thử lại, miễn là người nhận còn rảnh.
    result.failed += 1;
    return;
  }

  result.emails += 1;
  for (const { main, merged } of entries) {
    await markSent(db, [main.id], now);
    for (const extra of merged) await closeNudge(db, extra.id, "skipped", "merged", now);
    await logEvent(db, main.task_id, "nudged", { participantId: null, channel: "system" }, { kind: main.kind, nudge_id: main.id }, now);
    result.nudges += 1;
  }
}

async function sendConfirmReminders(
  db: Db,
  mailer: Mailer,
  rows: NudgeRow[],
  tasks: Map<string, PlanTask>,
  now: Date,
  result: SendResult,
): Promise<void> {
  // Email xác nhận gom theo từng cuộc họp. Mỗi lượt chỉ nhắc một cuộc họp; các cuộc họp
  // khác được lập lịch lại sau đó ít nhất 90 phút.
  const meetingId = tasks.get(rows[0]!.task_id)!.meeting_id;
  const batch = rows.filter((row) => tasks.get(row.task_id)!.meeting_id === meetingId);
  const sent = await sendConfirmationRequests(db, mailer, meetingId, { now, kind: "confirm_reminder", taskIds: batch.map((row) => row.task_id) });
  if (sent.emails === 0) {
    result.failed += sent.failed;
    return;
  }
  await markSent(db, batch.map((row) => row.id), now);
  result.emails += sent.emails;
  result.nudges += batch.length;
}
