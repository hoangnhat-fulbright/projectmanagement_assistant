import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono, type Context } from "hono";
import { basicAuth } from "hono/basic-auth";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { sampleDayBlocks } from "./calendar/source.ts";
import { config } from "./config.ts";
import {
  addBusyBlock,
  defaultHours,
  deleteBusyBlock,
  disconnectCalendar,
  ensurePerson,
  getPerson,
  hoursOf,
  isValidTimezone,
  listBlocks,
  normEmail,
  replaceBusyBlocks,
  saveHours,
} from "./domain/calendar.ts";
import { sendConfirmationRequests } from "./domain/notify.ts";
import {
  currentGapEnd,
  recordNudgeResponse,
  replanAll,
  replanMeeting,
  replanPerson,
  replanTask,
  scheduledNudges,
  sendDueNudges,
} from "./domain/nudges.ts";
import {
  assignTask,
  changeDue,
  confirmTask,
  declineTask,
  getTask,
  moveTask,
  setNudgeContext,
  snoozeTask,
  type Outcome,
} from "./domain/tasks.ts";
import { createActionToken, isNudgeAction, lookupToken, markTokenUsed, type TokenRow } from "./domain/tokens.ts";
import type { BusyKind } from "./nudge/gaps.ts";
import { processMeeting, type Deps } from "./pipeline.ts";
import { SAMPLE } from "./sample.ts";
import { CSS } from "./style.ts";
import { clockToMinute, fmtDateTime, fromLocalInput, toLocalInput, zonedTimeToUtc } from "./time.ts";
import { parseTranscript } from "./transcript.ts";
import {
  actionPage,
  calendarListPage,
  calendarPersonPage,
  homePage,
  meetingPage,
  messagePage,
  newMeetingPage,
  outboxPage,
  reschedulePage,
  type ActionContext,
  type CalendarListItem,
  type CalendarNudgeItem,
  type MeetingListItem,
  type MeetingView,
  type NewMeetingValues,
  type OutboxItem,
  type ParticipantView,
  type TaskView,
} from "./views.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/;
const MAX_TRANSCRIPT_CHARS = 600_000;

const TASK_VIEW_SQL = `
  SELECT t.*, p.display_name AS owner_name, s.speaker, s.at_seconds,
         d.note AS decline_note, d.declined_by,
         (SELECT count(*)::int FROM nudges n WHERE n.task_id = t.id AND n.status = 'scheduled') AS nudges_scheduled,
         (SELECT count(*)::int FROM nudges n WHERE n.task_id = t.id AND n.status = 'sent') AS nudges_sent
    FROM tasks t
    LEFT JOIN participants p ON p.id = t.owner_participant_id
    LEFT JOIN transcript_segments s ON s.id = t.source_segment_id
    LEFT JOIN LATERAL (
      SELECT e.payload->>'note' AS note, dp.display_name AS declined_by
        FROM task_events e
        LEFT JOIN participants dp ON dp.id = e.actor_participant_id
       WHERE e.task_id = t.id AND e.type = 'declined'
       ORDER BY e.id DESC LIMIT 1
    ) d ON true`;

/** "Tên <email>", "Tên, email" hoặc "Tên email" trên mỗi dòng. */
export function parseParticipants(raw: string): { list: { name: string; email: string }[]; error: string | null } {
  const list: { name: string; email: string }[] = [];
  const seen = new Set<string>();
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = /^(.*?)[\s,;<(]+([^\s<>(),;]+@[^\s<>(),;]+)[>)]?$/.exec(line);
    const name = m?.[1]?.trim().replace(/[,;]+$/, "") ?? "";
    const email = m?.[2]?.toLowerCase() ?? "";
    if (!name || !EMAIL.test(email)) {
      return { list, error: `Không đọc được dòng "${line}". Mỗi dòng cần có dạng: Tên <email>` };
    }
    if (seen.has(email)) return { list, error: `Email ${email} xuất hiện hai lần.` };
    seen.add(email);
    list.push({ name: name.slice(0, 120), email });
  }
  if (list.length === 0) return { list, error: "Cần ít nhất một người tham gia." };
  return { list, error: null };
}

/** Giới hạn tốc độ đơn giản trong bộ nhớ cho các trang công khai /a/…, chống dò token. */
function rateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string, nowMs: number): boolean => {
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= nowMs) {
      if (hits.size > 10_000) hits.clear();
      hits.set(key, { count: 1, resetAt: nowMs + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}

export type AppOptions = {
  /** Chờ trích xuất xong rồi mới trả lời POST /meetings. Dùng trong test. */
  awaitProcessing?: boolean;
};

export function createApp(deps: Deps, options: AppOptions = {}): Hono {
  const { db, mailer } = deps;
  const app = new Hono();
  const outbox = mailer.outboxOnly;
  const demo = deps.extractor.name === "demo";
  const allow = rateLimiter(60, 60_000);

  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const clientIp = (c: Context): string => {
    try {
      return getConnInfo(c).remote.address ?? "unknown";
    } catch {
      return "unknown";
    }
  };

  app.use(
    csrf({
      origin: (origin, c) => origin === new URL(c.req.url).origin || origin === new URL(config.baseUrl).origin,
    }),
  );

  // Trang của người chủ trì nằm sau mật khẩu (nếu đặt). Trang xác nhận /a/… luôn công khai.
  if (config.appPassword) {
    const auth = basicAuth({ username: "admin", password: config.appPassword });
    app.use("*", (c, next) => (c.req.path.startsWith("/a/") || c.req.path === "/style.css" ? next() : auth(c, next)));
  }

  app.get("/style.css", (c) => c.body(CSS, 200, { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=300" }));

  // ---------- Người chủ trì ----------

  app.get("/", async (c) => {
    const meetings = await db.query<MeetingListItem>(
      `SELECT m.id, m.title, m.started_at, m.status, m.error, m.extractor,
              count(t.id) FILTER (WHERE t.status <> 'cancelled')::int AS total,
              count(t.id) FILTER (WHERE t.status IN ('committed', 'in_progress', 'done'))::int AS confirmed,
              count(t.id) FILTER (WHERE t.status = 'proposed')::int AS pending
         FROM meetings m LEFT JOIN tasks t ON t.meeting_id = m.id
        GROUP BY m.id ORDER BY m.started_at DESC, m.created_at DESC LIMIT 100`,
    );
    return c.html(homePage(meetings, outbox));
  });

  app.get("/meetings/new", (c) => {
    const sample = c.req.query("sample") === "1";
    const values: NewMeetingValues = {
      title: sample ? SAMPLE.title : "",
      started_at: toLocalInput(deps.now()),
      next_occurrence_at: "",
      participants: sample ? SAMPLE.participants : "",
      transcript: sample ? SAMPLE.transcript : "",
      auto_send: true,
    };
    return c.html(newMeetingPage(values, null, { outbox, demo }));
  });

  app.post("/meetings", async (c) => {
    const body = await c.req.parseBody();
    const values: NewMeetingValues = {
      title: str(body.title).trim(),
      started_at: str(body.started_at),
      next_occurrence_at: str(body.next_occurrence_at),
      participants: str(body.participants),
      transcript: str(body.transcript),
      auto_send: str(body.auto_send) === "on",
    };
    const fail = (message: string) => c.html(newMeetingPage(values, message, { outbox, demo }), 400);

    if (!values.title) return fail("Cần có tên cuộc họp.");
    const startedAt = fromLocalInput(values.started_at);
    if (!startedAt) return fail("Thời điểm họp không hợp lệ.");
    const nextAt = values.next_occurrence_at ? fromLocalInput(values.next_occurrence_at) : null;
    if (values.next_occurrence_at && !nextAt) return fail("Thời điểm buổi họp kế tiếp không hợp lệ.");
    if (nextAt && nextAt.getTime() <= startedAt.getTime()) return fail("Buổi họp kế tiếp phải sau buổi họp này.");
    const people = parseParticipants(values.participants);
    if (people.error) return fail(people.error);
    if (values.transcript.length > MAX_TRANSCRIPT_CHARS) {
      return fail("Phiên âm quá dài để xử lý trong một lần. Hãy chia thành nhiều phần.");
    }
    const segments = parseTranscript(values.transcript);
    if (segments.length === 0) return fail("Phiên âm đang trống.");

    const meetingId = crypto.randomUUID();
    await db.tx(async (tx) => {
      await tx.query(
        `INSERT INTO meetings (id, title, started_at, auto_send, raw_transcript, created_at, next_occurrence_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [meetingId, values.title.slice(0, 200), startedAt, values.auto_send, values.transcript, deps.now(), nextAt],
      );
      for (const [i, p] of people.list.entries()) {
        await tx.query(
          `INSERT INTO participants (id, meeting_id, display_name, email, is_organizer, position) VALUES ($1, $2, $3, $4, $5, $6)`,
          [crypto.randomUUID(), meetingId, p.name, p.email, i === 0, i],
        );
      }
      for (const s of segments) {
        await tx.query(
          `INSERT INTO transcript_segments (id, meeting_id, idx, speaker, at_seconds, text) VALUES ($1, $2, $3, $4, $5, $6)`,
          [crypto.randomUUID(), meetingId, s.idx, s.speaker, s.atSeconds, s.text],
        );
      }
    });

    const job = processMeeting(deps, meetingId);
    if (options.awaitProcessing) await job;
    return c.redirect(`/m/${meetingId}`, 303);
  });

  const NOTICES: Record<string, string> = {
    sent: "Đã gửi yêu cầu xác nhận.",
    nothing: "Không có task nào để gửi.",
    failed: "Gửi email thất bại. Kiểm tra cấu hình SMTP rồi thử lại.",
    saved: "Đã lưu.",
  };

  app.get("/m/:id", async (c) => {
    const id = c.req.param("id");
    const meeting = UUID.test(id)
      ? await db.one<MeetingView>(`SELECT id, title, started_at, status, error, extractor, next_occurrence_at FROM meetings WHERE id = $1`, [id])
      : null;
    if (!meeting) return c.html(messagePage(null, "Không tìm thấy cuộc họp", "Liên kết này không đúng hoặc cuộc họp đã bị xóa."), 404);
    const participants = await db.query<ParticipantView>(
      `SELECT id, display_name, email, is_organizer FROM participants WHERE meeting_id = $1 ORDER BY position`,
      [id],
    );
    const tasks = await db.query<TaskView>(`${TASK_VIEW_SQL} WHERE t.meeting_id = $1 ORDER BY t.position, t.id`, [id]);
    return c.html(meetingPage(meeting, participants, tasks, { outbox, notice: NOTICES[c.req.query("msg") ?? ""] ?? null }));
  });

  const sendNotice = (r: { emails: number; failed: number }) => (r.failed > 0 ? "failed" : r.emails > 0 ? "sent" : "nothing");

  app.post("/m/:id/send", async (c) => {
    const id = c.req.param("id");
    if (!UUID.test(id)) return c.notFound();
    const now = deps.now();
    const result = await sendConfirmationRequests(db, mailer, id, { now });
    await replanMeeting(db, id, now);
    return c.redirect(`/m/${id}?msg=${sendNotice(result)}`, 303);
  });

  app.post("/m/:id/retry", async (c) => {
    const id = c.req.param("id");
    if (!UUID.test(id)) return c.notFound();
    const updated = await db.query(`UPDATE meetings SET status = 'processing', error = NULL WHERE id = $1 AND status = 'failed' RETURNING id`, [id]);
    if (updated.length > 0) {
      const job = processMeeting(deps, id);
      if (options.awaitProcessing) await job;
    }
    return c.redirect(`/m/${id}`, 303);
  });

  app.post("/t/:id/assign", async (c) => {
    const id = c.req.param("id");
    if (!UUID.test(id)) return c.notFound();
    const body = await c.req.parseBody();
    const ownerId = str(body.owner_id);
    const task = await getTask(db, id);
    if (!task) return c.notFound();
    if (!UUID.test(ownerId)) return c.redirect(`/m/${task.meeting_id}`, 303);
    const dueRaw = str(body.due_at);
    const now = deps.now();
    const result = await assignTask(db, id, { ownerId, title: str(body.title), dueAt: dueRaw ? fromLocalInput(dueRaw) : null }, now);
    if (!result.ok) return c.redirect(`/m/${task.meeting_id}`, 303);
    const sent = await sendConfirmationRequests(db, mailer, task.meeting_id, { now, taskIds: [id] });
    await replanTask(db, id, now);
    return c.redirect(`/m/${task.meeting_id}?msg=${sendNotice(sent)}`, 303);
  });

  app.post("/t/:id/resend", async (c) => {
    const id = c.req.param("id");
    const task = UUID.test(id) ? await getTask(db, id) : null;
    if (!task) return c.notFound();
    const now = deps.now();
    const sent = await sendConfirmationRequests(db, mailer, task.meeting_id, { now, taskIds: [id] });
    await replanTask(db, id, now);
    return c.redirect(`/m/${task.meeting_id}?msg=${sendNotice(sent)}`, 303);
  });

  // Dữ liệu để chọn giờ nhắc: cuộc họp liên quan và công sức ước tính.
  app.post("/t/:id/nudge-context", async (c) => {
    const id = c.req.param("id");
    const task = UUID.test(id) ? await getTask(db, id) : null;
    if (!task) return c.notFound();
    const body = await c.req.parseBody();
    const now = deps.now();
    const atRaw = str(body.related_meeting_at);
    const effort = Number(str(body.effort_minutes));
    await setNudgeContext(
      db,
      id,
      {
        relatedMeetingTitle: str(body.related_meeting_title).slice(0, 200) || null,
        relatedMeetingAt: atRaw ? fromLocalInput(atRaw) : null,
        effortMinutes: Number.isInteger(effort) && effort >= 5 && effort <= 2400 ? effort : task.effort_minutes,
      },
      now,
    );
    await replanTask(db, id, now);
    return c.redirect(`/m/${task.meeting_id}?msg=saved`, 303);
  });

  for (const [path, to] of [["cancel", "cancelled"], ["done", "done"]] as const) {
    app.post(`/t/:id/${path}`, async (c) => {
      const id = c.req.param("id");
      const task = UUID.test(id) ? await getTask(db, id) : null;
      if (!task) return c.notFound();
      const now = deps.now();
      await moveTask(db, id, to, { participantId: null, channel: "app" }, now);
      await replanTask(db, id, now);
      return c.redirect(`/m/${task.meeting_id}?msg=saved`, 303);
    });
  }

  if (outbox) {
    app.get("/outbox", async (c) => {
      const items = await db.query<OutboxItem>(
        `SELECT n.id, n.subject, n.sent_at, n.kind, p.display_name AS recipient, p.email, m.title AS meeting_title
           FROM notifications n
           JOIN participants p ON p.id = n.recipient_participant_id
           JOIN meetings m ON m.id = n.meeting_id
          ORDER BY n.sent_at DESC, n.id LIMIT 100`,
      );
      return c.html(outboxPage(items));
    });
    app.get("/outbox/:id", async (c) => {
      const id = c.req.param("id");
      const row = UUID.test(id) ? await db.one<{ body_html: string | null }>(`SELECT body_html FROM notifications WHERE id = $1`, [id]) : null;
      if (!row?.body_html) return c.notFound();
      return c.html(row.body_html);
    });
  }

  // ---------- Lịch thử: nguồn lịch nhập tay, dùng khi chưa kết nối Google Calendar ----------

  const CAL_NOTICES: Record<string, string> = {
    saved: "Đã lưu và tính lại lịch nhắc.",
    invalid: "Dữ liệu không hợp lệ. Kiểm tra lại giờ bắt đầu và kết thúc.",
    removed: "Đã xóa dữ liệu lịch của người này.",
  };
  const KINDS: readonly string[] = ["meeting", "focus", "out_of_office"];
  const personEmail = (c: Context): string | null => {
    const email = normEmail(c.req.param("email") ?? "");
    return EMAIL.test(email) ? email : null;
  };
  const personUrl = (email: string, msg?: string) => `/calendar/${encodeURIComponent(email)}${msg ? `?msg=${msg}` : ""}`;

  app.get("/calendar", async (c) => {
    const people = await db.query<CalendarListItem>(
      `SELECT e.email,
              (SELECT display_name FROM participants WHERE lower(email) = e.email ORDER BY id LIMIT 1) AS name,
              c.source,
              (SELECT count(*)::int FROM nudges n JOIN tasks t ON t.id = n.task_id JOIN participants p ON p.id = t.owner_participant_id
                WHERE lower(p.email) = e.email AND n.status = 'scheduled') AS scheduled
         FROM (SELECT lower(email) AS email FROM participants UNION SELECT email FROM calendar_people) e
         LEFT JOIN calendar_people c ON c.email = e.email
        ORDER BY e.email LIMIT 500`,
    );
    const ran = c.req.query("msg") === "ran" ? `Đã chạy lượt nhắc: gửi ${Number(c.req.query("emails")) || 0} email, bỏ qua ${Number(c.req.query("skipped")) || 0} lời nhắc.` : null;
    return c.html(calendarListPage(people, { outbox, notice: ran }));
  });

  // Chạy ngay việc định kỳ của nudge thay vì chờ lượt kế tiếp (mỗi phút một lần).
  app.post("/nudges/run", async (c) => {
    const now = deps.now();
    await replanAll(db, now);
    const sent = await sendDueNudges(db, mailer, now);
    return c.redirect(`/calendar?msg=ran&emails=${sent.emails}&skipped=${sent.skipped}`, 303);
  });

  app.get("/calendar/:email", async (c) => {
    const email = personEmail(c);
    if (!email) return c.notFound();
    const now = deps.now();
    const person = await getPerson(db, email);
    const hours = person ? hoursOf(person) : defaultHours();
    const blocks = person ? await listBlocks(db, email, now) : [];
    const name = await db.one<{ display_name: string }>(`SELECT display_name FROM participants WHERE lower(email) = $1 ORDER BY id LIMIT 1`, [email]);
    const nudges = await db.query<CalendarNudgeItem>(
      `SELECT n.id, n.kind, n.scheduled_for, n.status, n.reason, n.response, t.title AS task_title
         FROM nudges n JOIN tasks t ON t.id = n.task_id JOIN participants p ON p.id = t.owner_participant_id
        WHERE lower(p.email) = $1 AND (n.status = 'scheduled' OR n.updated_at > $2)
        ORDER BY (n.status = 'scheduled') DESC, n.scheduled_for DESC LIMIT 50`,
      [email, new Date(now.getTime() - 7 * 86_400_000)],
    );
    return c.html(
      calendarPersonPage(
        { email, name: name?.display_name ?? null, connected: !!person, source: person?.source ?? null, hours, blocks, nudges, now },
        { outbox, notice: CAL_NOTICES[c.req.query("msg") ?? ""] ?? null },
      ),
    );
  });

  app.post("/calendar/:email/hours", async (c) => {
    const email = personEmail(c);
    if (!email) return c.notFound();
    const body = await c.req.parseBody();
    const timezone = str(body.timezone).trim() || config.timezone;
    const startMinute = clockToMinute(str(body.work_start));
    const endMinute = clockToMinute(str(body.work_end));
    const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => str(body[`day_${d}`]) === "on");
    if (startMinute === null || endMinute === null || endMinute <= startMinute || days.length === 0 || !isValidTimezone(timezone)) {
      return c.redirect(personUrl(email, "invalid"), 303);
    }
    const now = deps.now();
    await saveHours(db, email, { timezone, startMinute, endMinute, days }, "manual", now);
    await replanPerson(db, email, now);
    return c.redirect(personUrl(email, "saved"), 303);
  });

  app.post("/calendar/:email/blocks", async (c) => {
    const email = personEmail(c);
    if (!email) return c.notFound();
    const body = await c.req.parseBody();
    const now = deps.now();
    const tz = (await getPerson(db, email))?.timezone ?? config.timezone;
    const start = fromLocalInput(str(body.starts_at), tz);
    const end = fromLocalInput(str(body.ends_at), tz);
    const kind = str(body.kind);
    if (!start || !end || end.getTime() <= start.getTime() || !KINDS.includes(kind)) return c.redirect(personUrl(email, "invalid"), 303);
    await ensurePerson(db, email, "manual", now);
    await addBusyBlock(db, email, { start, end, kind: kind as BusyKind });
    await replanPerson(db, email, now);
    return c.redirect(personUrl(email, "saved"), 303);
  });

  app.post("/calendar/:email/blocks/:id/delete", async (c) => {
    const email = personEmail(c);
    const id = c.req.param("id");
    if (!email || !UUID.test(id)) return c.notFound();
    await deleteBusyBlock(db, email, id);
    await replanPerson(db, email, deps.now());
    return c.redirect(personUrl(email, "saved"), 303);
  });

  // Điền lịch của một ngày theo ví dụ trong wiki (lịch thứ Sáu của Lan), thay cho mọi khung bận của ngày đó.
  app.post("/calendar/:email/sample", async (c) => {
    const email = personEmail(c);
    if (!email) return c.notFound();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str((await c.req.parseBody()).date));
    if (!m) return c.redirect(personUrl(email, "invalid"), 303);
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const now = deps.now();
    await ensurePerson(db, email, "manual", now);
    const tz = (await getPerson(db, email))!.timezone;
    const range = { from: zonedTimeToUtc(y, mo, d, 0, 0, tz), to: zonedTimeToUtc(y, mo, d + 1, 0, 0, tz) };
    await replaceBusyBlocks(db, email, range, sampleDayBlocks(y, mo, d, tz));
    await replanPerson(db, email, now);
    return c.redirect(personUrl(email, "saved"), 303);
  });

  app.post("/calendar/:email/disconnect", async (c) => {
    const email = personEmail(c);
    if (!email) return c.notFound();
    await disconnectCalendar(db, email);
    await replanPerson(db, email, deps.now());
    return c.redirect(personUrl(email, "removed"), 303);
  });

  // ---------- Người nhận: liên kết một cú bấm trong email ----------

  type Loaded = {
    token: TokenRow;
    used: boolean;
    ctx: ActionContext;
    /** Các task token này còn hành động được. Rỗng = không còn gì để làm. */
    actionable: TaskView[];
    /** Task mà token trỏ tới (null với confirm_all), dù còn hành động được hay không. */
    task: TaskView | null;
    others: ParticipantView[];
  };

  async function loadToken(c: Context): Promise<Loaded | Response> {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Robots-Tag", "noindex");
    const now = deps.now();
    if (!allow(clientIp(c), now.getTime())) {
      return c.html(messagePage(null, "Thử lại sau ít phút", "Có quá nhiều yêu cầu từ địa chỉ của bạn."), 429);
    }
    const found = await lookupToken(db, c.req.param("token") ?? "", now);
    if (!found) {
      return c.html(messagePage(null, "Liên kết không hợp lệ", "Hãy mở lại liên kết từ email gần nhất bạn nhận được."), 404);
    }
    if (found.state === "expired") {
      return c.html(messagePage(null, "Liên kết đã hết hạn", "Hãy nhờ người chủ trì cuộc họp gửi lại yêu cầu xác nhận."), 410);
    }
    const { token } = found;
    const meeting = await db.one<{ title: string; started_at: Date }>(`SELECT title, started_at FROM meetings WHERE id = $1`, [token.meeting_id]);
    const people = await db.query<ParticipantView>(
      `SELECT id, display_name, email, is_organizer FROM participants WHERE meeting_id = $1 ORDER BY position`,
      [token.meeting_id],
    );
    const participant = people.find((p) => p.id === token.participant_id);
    if (!meeting || !participant) {
      return c.html(messagePage(null, "Liên kết không hợp lệ", "Cuộc họp này không còn tồn tại."), 404);
    }

    let task: TaskView | null = null;
    let actionable: TaskView[];
    if (token.action === "confirm_all") {
      actionable = await db.query<TaskView>(
        `${TASK_VIEW_SQL} WHERE t.meeting_id = $1 AND t.owner_participant_id = $2 AND t.status = 'proposed' AND t.sent_at IS NOT NULL
          ORDER BY t.position, t.id`,
        [token.meeting_id, token.participant_id],
      );
    } else {
      task = await db.one<TaskView>(`${TASK_VIEW_SQL} WHERE t.id = $1`, [token.task_id]);
      const mine = !!task && task.owner_participant_id === token.participant_id;
      let open: boolean;
      if (!isNudgeAction(token.action)) open = task?.status === "proposed";
      // Nút trên email nhắc việc: Xong rồi và Dời hạn dùng được khi task đang mở; Đang làm và hoãn nhắc chỉ khi chưa bắt đầu.
      else if (token.action === "done" || token.action === "reschedule") open = task?.status === "committed" || task?.status === "in_progress";
      else open = task?.status === "committed";
      actionable = task && mine && open ? [task] : [];
    }
    return {
      token,
      used: found.state === "used",
      ctx: { meeting, participant },
      actionable,
      task,
      others: people.filter((p) => p.id !== token.participant_id),
    };
  }

  /** Trang trạng thái khi liên kết không còn gì để làm: đã dùng, đã xác nhận, đã chuyển người… */
  function statusPage(l: Loaded) {
    const { ctx, task, token } = l;
    if (isNudgeAction(token.action)) return nudgeStatusPage(l);
    if (!task) return messagePage(ctx, "Không còn task nào chờ bạn", "Mọi task của bạn từ buổi họp này đã được xử lý.", { ok: true });
    if (task.owner_participant_id !== token.participant_id) {
      return messagePage(ctx, "Task này đã chuyển cho người khác", "Bạn không cần làm gì thêm.", { task });
    }
    switch (task.status) {
      case "committed":
      case "in_progress":
      case "done":
        return messagePage(ctx, "Bạn đã xác nhận task này", task.due_at ? `Hạn: ${fmtDateTime(task.due_at)}.` : "", { ok: true, task });
      case "declined":
        return messagePage(ctx, "Đã ghi nhận", "Bạn đã báo task này không phải của mình. Người chủ trì sẽ gán lại.", { task });
      case "expired":
        return messagePage(ctx, "Yêu cầu xác nhận đã hết hạn", "Người chủ trì sẽ gửi lại nếu việc này vẫn cần bạn.", { task });
      case "cancelled":
        return messagePage(ctx, "Task này đã được hủy", "Bạn không cần làm gì thêm.", { task });
      default:
        return messagePage(ctx, "Liên kết này đã được dùng", "Hãy mở liên kết trong email mới nhất.", { task });
    }
  }

  /** Như `statusPage`, cho các liên kết trên email nhắc việc. */
  function nudgeStatusPage(l: Loaded) {
    const { ctx, task, token } = l;
    if (!task) return messagePage(ctx, "Việc này không còn tồn tại", "Bạn không cần làm gì thêm.");
    if (task.owner_participant_id !== token.participant_id) {
      return messagePage(ctx, "Task này đã chuyển cho người khác", "Bạn không cần làm gì thêm.", { task });
    }
    if (task.status === "done") return messagePage(ctx, "Việc này đã xong", "Cảm ơn bạn. Chúng tôi không nhắc việc này nữa.", { ok: true, task });
    if (task.status === "cancelled") return messagePage(ctx, "Task này đã được hủy", "Bạn không cần làm gì thêm.", { task });
    if (task.status === "in_progress" && (token.action === "start" || token.action === "snooze")) {
      return messagePage(ctx, "Bạn đang làm việc này", "Chúng tôi không nhắc việc này ở các khoảng trống nữa. Xong thì bấm “Xong rồi” trong email nhắc.", { ok: true, task });
    }
    if (l.used && token.action === "snooze") {
      return messagePage(ctx, "Bạn đã hoãn lời nhắc này", "Lời nhắc kế tiếp sẽ đến ở khoảng trống sau trong lịch của bạn.", { task });
    }
    if (l.used && token.action === "reschedule") {
      return messagePage(ctx, "Bạn đã dời hạn việc này", task.due_at ? `Hạn hiện tại: ${fmtDateTime(task.due_at)}.` : "", { ok: true, task });
    }
    return messagePage(ctx, "Liên kết này không còn dùng được", "Hãy mở liên kết trong email mới nhất.", { task });
  }

  // GET chỉ hiển thị trang. Hành động chỉ xảy ra ở POST, để các bộ quét email tự mở
  // liên kết không vô tình "xác nhận" thay người nhận.
  app.get("/a/:token", async (c) => {
    const l = await loadToken(c);
    if (l instanceof Response) return l;
    if (l.used || l.actionable.length === 0) return c.html(statusPage(l));
    return c.html(actionPage(l.ctx, l.token.action, l.actionable, l.others, null));
  });

  app.post("/a/:token", async (c) => {
    const l = await loadToken(c);
    if (l instanceof Response) return l;
    if (l.used || l.actionable.length === 0) return c.html(statusPage(l));

    const { token, ctx } = l;
    const now = deps.now();
    const body = await c.req.parseBody();
    const actor = { participantId: token.participant_id, channel: "email_link" as const };
    const retry = (message: string) => c.html(actionPage(ctx, token.action, l.actionable, l.others, message), 400);
    const reload = async (id: string) => (await db.one<TaskView>(`${TASK_VIEW_SQL} WHERE t.id = $1`, [id]))!;
    const failed = (r: Outcome) => !r.ok && r.reason !== "due_required";

    if (isNudgeAction(token.action)) {
      const task = l.actionable[0]!;
      const gone = async () => c.html(statusPage({ ...l, task: await reload(task.id), actionable: [] }));

      if (token.action === "done" || token.action === "start") {
        const to = token.action === "done" ? "done" : "in_progress";
        const result = await moveTask(db, task.id, to, actor, now);
        if (!result.ok) return gone();
        await markTokenUsed(db, token.id, now);
        await recordNudgeResponse(db, task.id, to === "done" ? "done" : "started", now);
        await replanTask(db, task.id, now);
        const fresh = await reload(task.id);
        return c.html(
          to === "done"
            ? messagePage(ctx, "Đã ghi nhận là xong", "Cảm ơn bạn. Chúng tôi không nhắc việc này nữa.", { ok: true, task: fresh })
            : messagePage(ctx, "Đã ghi nhận bạn đang làm", "Chúng tôi không nhắc việc này ở các khoảng trống nữa. Xong thì bấm “Xong rồi” trong email nhắc.", { ok: true, task: fresh }),
        );
      }

      if (token.action === "reschedule") {
        const dueAt = fromLocalInput(str(body.due_at));
        if (!dueAt) return retry("Hãy chọn hạn mới.");
        if (dueAt.getTime() <= now.getTime()) return retry("Hạn phải ở trong tương lai.");
        const result = await changeDue(db, task.id, actor, dueAt, now);
        if (!result.ok) return gone();
        await markTokenUsed(db, token.id, now);
        await recordNudgeResponse(db, task.id, "due_changed", now);
        await replanTask(db, task.id, now);
        return c.html(messagePage(ctx, "Đã dời hạn", `Hạn mới: ${fmtDateTime(dueAt)}. Lời nhắc sẽ được tính lại theo hạn này.`, { ok: true, task: await reload(task.id) }));
      }

      // Nhắc ở khoảng trống sau: lần nhắc kế tiếp phải bắt đầu sau khi khoảng trống hiện tại kết thúc.
      const until = await currentGapEnd(db, ctx.participant.email, now);
      const result = await snoozeTask(db, task.id, actor, until, now);
      if (!result.ok) return gone();
      await markTokenUsed(db, token.id, now);
      await recordNudgeResponse(db, task.id, "snoozed", now);
      await replanTask(db, task.id, now);
      const fresh = await reload(task.id);
      const next = (await scheduledNudges(db, task.id)).find((n) => n.kind === "gap");
      if (next) {
        return c.html(messagePage(ctx, "Đã hoãn", `Chúng tôi sẽ nhắc lại lúc ${fmtDateTime(next.scheduled_for)}, ở khoảng trống kế tiếp trong lịch của bạn.`, { ok: true, task: fresh }));
      }
      // Đã hoãn hai lần, hoặc trước hạn không còn khoảng trống nào: hỏi có muốn dời hạn không, thay vì nhắc tiếp.
      const raw = await createActionToken(db, { meetingId: task.meeting_id, participantId: token.participant_id, taskId: task.id, action: "reschedule", now });
      const intro =
        result.task.nudge_snooze_count >= 2
          ? "Bạn đã hoãn việc này hai lần nên chúng tôi không nhắc tiếp. Nếu hạn hiện tại không còn phù hợp, bạn dời hạn nhé."
          : "Trước hạn không còn khoảng trống nào trong lịch của bạn. Nếu hạn hiện tại không còn phù hợp, bạn dời hạn nhé.";
      return c.html(reschedulePage(ctx, fresh, { heading: "Dời hạn việc này?", intro, formAction: `/a/${raw}`, error: null }));
    }

    if (token.action === "confirm_all") {
      const dues = new Map<string, Date>();
      for (const t of l.actionable) {
        if (t.due_at) continue;
        const due = fromLocalInput(str(body[`due_${t.id}`]));
        if (!due) return retry("Hãy chọn hạn cho các việc chưa có hạn.");
        dues.set(t.id, due);
      }
      for (const t of l.actionable) await confirmTask(db, t.id, actor, { dueAt: dues.get(t.id) }, now);
      await markTokenUsed(db, token.id, now);
      await replanPerson(db, ctx.participant.email, now);
      return c.html(messagePage(ctx, `Đã xác nhận ${l.actionable.length} task`, "Cảm ơn bạn. Các việc này đã được ghi nhận là của bạn.", { ok: true }));
    }

    const task = l.actionable[0]!;

    if (token.action === "decline") {
      const reassignTo = str(body.reassign_to);
      const result = await declineTask(db, task.id, actor, { reassignToId: UUID.test(reassignTo) ? reassignTo : null, note: str(body.note).slice(0, 500) }, now);
      if (!result.ok) return c.html(statusPage({ ...l, task: await reload(task.id), actionable: [] }));
      await markTokenUsed(db, token.id, now);
      if (result.task.status === "proposed") {
        await sendConfirmationRequests(db, mailer, task.meeting_id, { now, taskIds: [task.id] });
        await replanTask(db, task.id, now);
        return c.html(messagePage(ctx, "Đã chuyển task", "Người bạn chọn sẽ nhận được yêu cầu xác nhận."));
      }
      await replanTask(db, task.id, now);
      return c.html(messagePage(ctx, "Đã ghi nhận", "Người chủ trì sẽ gán việc này cho người khác."));
    }

    // confirm hoặc amend
    const dueRaw = str(body.due_at);
    const dueAt = dueRaw ? fromLocalInput(dueRaw) : null;
    if (dueRaw && !dueAt) return retry("Hạn không hợp lệ.");
    if (token.action === "amend" && !dueAt) return retry("Hãy chọn hạn.");
    if (dueAt && dueAt.getTime() <= now.getTime()) return retry("Hạn phải ở trong tương lai.");
    const changes = token.action === "amend" ? { title: str(body.title).slice(0, 200), dueAt } : { dueAt: dueAt ?? undefined };
    const result = await confirmTask(db, task.id, actor, changes, now);
    if (!result.ok && result.reason === "due_required") return retry("Việc này chưa có hạn. Hãy chọn hạn rồi xác nhận.");
    if (failed(result)) return c.html(statusPage({ ...l, task: await reload(task.id), actionable: [] }));
    await markTokenUsed(db, token.id, now);
    await replanTask(db, task.id, now);
    const confirmed = await reload(task.id);
    return c.html(
      messagePage(ctx, "Đã xác nhận", `Cảm ơn bạn. Việc này đã được ghi nhận là của bạn${confirmed.due_at ? `, hạn ${fmtDateTime(confirmed.due_at)}` : ""}.`, {
        ok: true,
        task: confirmed,
      }),
    );
  });

  app.notFound((c) => c.html(messagePage(null, "Không tìm thấy trang", "Địa chỉ này không tồn tại."), 404));
  app.onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse();
    console.error("[app] lỗi chưa xử lý:", error);
    return c.html(messagePage(null, "Có lỗi xảy ra", "Thử lại sau ít phút."), 500);
  });

  return app;
}
