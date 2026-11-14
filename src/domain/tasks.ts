import type { Db } from "../db.ts";

export type TaskStatus =
  | "proposed"
  | "committed"
  | "in_progress"
  | "done"
  | "declined"
  | "expired"
  | "cancelled";

export type TaskRow = {
  id: string;
  meeting_id: string;
  title: string;
  owner_participant_id: string | null;
  status: TaskStatus;
  due_at: Date | null;
  due_is_inferred: boolean;
  due_spoken_as: string | null;
  effort_minutes: number;
  related_meeting_title: string | null;
  related_meeting_at: Date | null;
  nudge_snooze_count: number;
  nudge_snoozed_until: Date | null;
  source_segment_id: string | null;
  source_quote: string;
  confidence: number;
  owner_confidence: number;
  needs_review: boolean;
  sent_at: Date | null;
  reminder_sent_at: Date | null;
  committed_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
};

export type Channel = "app" | "email_link" | "system";
/** Ai thực hiện hành động. `participantId` null nghĩa là người chủ trì (trên app) hoặc hệ thống. */
export type Actor = { participantId: string | null; channel: Channel };

export type FailReason = "not_found" | "not_owner" | "due_required" | "invalid_state" | "invalid_owner";
export type Outcome =
  | { ok: true; task: TaskRow; changed: boolean }
  | { ok: false; reason: FailReason; task?: TaskRow };

/** Các bước chuyển trạng thái hợp lệ. Xem sơ đồ ở wiki/03-one-click-commitment.md. */
export const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  proposed: ["committed", "declined", "expired", "cancelled"],
  declined: ["proposed", "cancelled"],
  expired: ["proposed", "cancelled"],
  committed: ["in_progress", "done", "cancelled"],
  in_progress: ["done", "cancelled"],
  done: [],
  cancelled: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export async function logEvent(
  db: Db,
  taskId: string,
  type: string,
  actor: Actor,
  payload: Record<string, unknown>,
  now: Date,
): Promise<void> {
  await db.query(
    `INSERT INTO task_events (task_id, type, actor_participant_id, channel, payload, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [taskId, type, actor.participantId, actor.channel, JSON.stringify(payload), now],
  );
}

export function getTask(db: Db, id: string): Promise<TaskRow | null> {
  return db.one<TaskRow>(`SELECT * FROM tasks WHERE id = $1`, [id]);
}

function lockTask(tx: Db, id: string): Promise<TaskRow | null> {
  return tx.one<TaskRow>(`SELECT * FROM tasks WHERE id = $1 FOR UPDATE`, [id]);
}

const sameTime = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

/**
 * Người làm xác nhận task. Lặp lại an toàn: xác nhận một task đã cam kết trả về
 * thành công với `changed: false`. Task chưa có hạn thì phải kèm `dueAt`.
 */
export function confirmTask(
  db: Db,
  taskId: string,
  actor: Actor,
  changes: { title?: string; dueAt?: Date | null },
  now: Date,
): Promise<Outcome> {
  return db.tx(async (tx) => {
    const task = await lockTask(tx, taskId);
    if (!task) return { ok: false, reason: "not_found" };
    if (actor.participantId && actor.participantId !== task.owner_participant_id) {
      return { ok: false, reason: "not_owner", task };
    }
    if (task.status === "committed" || task.status === "in_progress" || task.status === "done") {
      return { ok: true, task, changed: false };
    }
    if (task.status !== "proposed") return { ok: false, reason: "invalid_state", task };

    const title = changes.title?.trim() || task.title;
    const dueAt = changes.dueAt ?? task.due_at;
    if (!dueAt) return { ok: false, reason: "due_required", task };

    const amended = title !== task.title || !sameTime(dueAt, task.due_at);
    const updated = await tx.one<TaskRow>(
      `UPDATE tasks
          SET status = 'committed', committed_at = $2, title = $3, due_at = $4,
              due_is_inferred = false, needs_review = false
        WHERE id = $1 RETURNING *`,
      [taskId, now, title, dueAt],
    );
    if (amended) {
      await logEvent(
        tx,
        taskId,
        "amended",
        actor,
        { from: { title: task.title, due_at: task.due_at }, to: { title, due_at: dueAt } },
        now,
      );
    }
    await logEvent(tx, taskId, "confirmed", actor, {}, now);
    return { ok: true, task: updated!, changed: true };
  });
}

/**
 * Người làm từ chối task ("Không phải của tôi"). Nếu chọn luôn người khác thì
 * task quay về `proposed` với người làm mới và chờ được gửi đi.
 */
export function declineTask(
  db: Db,
  taskId: string,
  actor: Actor,
  opts: { reassignToId?: string | null; note?: string },
  now: Date,
): Promise<Outcome> {
  return db.tx(async (tx) => {
    const task = await lockTask(tx, taskId);
    if (!task) return { ok: false, reason: "not_found" };
    if (actor.participantId && actor.participantId !== task.owner_participant_id) {
      return { ok: false, reason: "not_owner", task };
    }
    if (task.status === "declined") return { ok: true, task, changed: false };
    if (task.status !== "proposed") return { ok: false, reason: "invalid_state", task };

    const reassignTo = opts.reassignToId || null;
    if (reassignTo) {
      const target = await tx.one(`SELECT id FROM participants WHERE id = $1 AND meeting_id = $2`, [
        reassignTo,
        task.meeting_id,
      ]);
      if (!target || reassignTo === task.owner_participant_id) {
        return { ok: false, reason: "invalid_owner", task };
      }
    }

    await logEvent(tx, taskId, "declined", actor, { note: opts.note?.trim() || null }, now);
    if (!reassignTo) {
      const updated = await tx.one<TaskRow>(
        `UPDATE tasks SET status = 'declined' WHERE id = $1 RETURNING *`,
        [taskId],
      );
      return { ok: true, task: updated!, changed: true };
    }
    const updated = await tx.one<TaskRow>(
      `UPDATE tasks
          SET status = 'proposed', owner_participant_id = $2, sent_at = NULL,
              reminder_sent_at = NULL, needs_review = false
        WHERE id = $1 RETURNING *`,
      [taskId, reassignTo],
    );
    await logEvent(
      tx,
      taskId,
      "reassigned",
      actor,
      { from: task.owner_participant_id, to: reassignTo },
      now,
    );
    return { ok: true, task: updated!, changed: true };
  });
}

/**
 * Người chủ trì gán hoặc sửa một task chưa được cam kết. Task quay về `proposed`
 * và chờ gửi lại cho người làm.
 */
export function assignTask(
  db: Db,
  taskId: string,
  changes: { ownerId: string; title?: string; dueAt?: Date | null },
  now: Date,
): Promise<Outcome> {
  const actor: Actor = { participantId: null, channel: "app" };
  return db.tx(async (tx) => {
    const task = await lockTask(tx, taskId);
    if (!task) return { ok: false, reason: "not_found" };
    if (task.status !== "proposed" && !canTransition(task.status, "proposed")) {
      return { ok: false, reason: "invalid_state", task };
    }
    const owner = await tx.one(`SELECT id FROM participants WHERE id = $1 AND meeting_id = $2`, [
      changes.ownerId,
      task.meeting_id,
    ]);
    if (!owner) return { ok: false, reason: "invalid_owner", task };

    const title = changes.title?.trim() || task.title;
    const dueAt = changes.dueAt === undefined ? task.due_at : changes.dueAt;
    const dueChanged = !sameTime(dueAt, task.due_at);
    const updated = await tx.one<TaskRow>(
      `UPDATE tasks
          SET status = 'proposed', owner_participant_id = $2, title = $3, due_at = $4,
              due_is_inferred = $5, needs_review = false, sent_at = NULL, reminder_sent_at = NULL
        WHERE id = $1 RETURNING *`,
      [taskId, changes.ownerId, title, dueAt, dueChanged ? false : task.due_is_inferred],
    );
    if (task.status !== "proposed") await logEvent(tx, taskId, "reopened", actor, { from: task.status }, now);
    if (changes.ownerId !== task.owner_participant_id) {
      await logEvent(tx, taskId, "reassigned", actor, { from: task.owner_participant_id, to: changes.ownerId }, now);
    }
    if (title !== task.title || dueChanged) {
      await logEvent(
        tx,
        taskId,
        "amended",
        actor,
        { from: { title: task.title, due_at: task.due_at }, to: { title, due_at: dueAt } },
        now,
      );
    }
    return { ok: true, task: updated!, changed: true };
  });
}

/** Chuyển trạng thái đơn giản, không kèm dữ liệu: expired, cancelled, done, in_progress. */
export function moveTask(
  db: Db,
  taskId: string,
  to: "expired" | "cancelled" | "done" | "in_progress",
  actor: Actor,
  now: Date,
): Promise<Outcome> {
  const eventType = { expired: "expired", cancelled: "cancelled", done: "completed", in_progress: "started" }[to];
  return db.tx(async (tx) => {
    const task = await lockTask(tx, taskId);
    if (!task) return { ok: false, reason: "not_found" };
    if (actor.participantId && actor.participantId !== task.owner_participant_id) {
      return { ok: false, reason: "not_owner", task };
    }
    if (task.status === to) return { ok: true, task, changed: false };
    if (!canTransition(task.status, to)) return { ok: false, reason: "invalid_state", task };
    const updated = await tx.one<TaskRow>(
      `UPDATE tasks SET status = $2, completed_at = CASE WHEN $2 = 'done' THEN $3::timestamptz ELSE completed_at END
        WHERE id = $1 RETURNING *`,
      [taskId, to, now],
    );
    await logEvent(tx, taskId, eventType, actor, { from: task.status }, now);
    return { ok: true, task: updated!, changed: true };
  });
}

const isOpen = (task: TaskRow) => task.status === "committed" || task.status === "in_progress";

/**
 * Dời hạn của một task đã cam kết. Hạn mới xóa trạng thái "đã hoãn nhắc": lời nhắc
 * được tính lại từ đầu theo hạn mới.
 */
export function changeDue(db: Db, taskId: string, actor: Actor, dueAt: Date, now: Date): Promise<Outcome> {
  return db.tx(async (tx) => {
    const task = await lockTask(tx, taskId);
    if (!task) return { ok: false, reason: "not_found" };
    if (actor.participantId && actor.participantId !== task.owner_participant_id) {
      return { ok: false, reason: "not_owner", task };
    }
    if (!isOpen(task)) return { ok: false, reason: "invalid_state", task };
    if (sameTime(dueAt, task.due_at)) return { ok: true, task, changed: false };
    const updated = await tx.one<TaskRow>(
      `UPDATE tasks SET due_at = $2, due_is_inferred = false, nudge_snooze_count = 0, nudge_snoozed_until = NULL
        WHERE id = $1 RETURNING *`,
      [taskId, dueAt],
    );
    await logEvent(tx, taskId, "due_changed", actor, { from: task.due_at, to: dueAt }, now);
    return { ok: true, task: updated!, changed: true };
  });
}

/**
 * Người làm bấm "Nhắc ở khoảng trống sau". `until` là lúc khoảng trống hiện tại kết
 * thúc: lần nhắc kế tiếp phải bắt đầu sau mốc này.
 */
export function snoozeTask(db: Db, taskId: string, actor: Actor, until: Date, now: Date): Promise<Outcome> {
  return db.tx(async (tx) => {
    const task = await lockTask(tx, taskId);
    if (!task) return { ok: false, reason: "not_found" };
    if (actor.participantId && actor.participantId !== task.owner_participant_id) {
      return { ok: false, reason: "not_owner", task };
    }
    if (!isOpen(task)) return { ok: false, reason: "invalid_state", task };
    const updated = await tx.one<TaskRow>(
      `UPDATE tasks SET nudge_snooze_count = nudge_snooze_count + 1, nudge_snoozed_until = $2 WHERE id = $1 RETURNING *`,
      [taskId, until],
    );
    await logEvent(tx, taskId, "snoozed", actor, { until, count: updated!.nudge_snooze_count }, now);
    return { ok: true, task: updated!, changed: true };
  });
}

/**
 * Người chủ trì chỉnh dữ liệu dùng để chọn giờ nhắc: cuộc họp liên quan và công sức
 * ước tính. Không đổi trạng thái task.
 */
export function setNudgeContext(
  db: Db,
  taskId: string,
  changes: { relatedMeetingTitle: string | null; relatedMeetingAt: Date | null; effortMinutes: number },
  now: Date,
): Promise<Outcome> {
  const actor: Actor = { participantId: null, channel: "app" };
  return db.tx(async (tx) => {
    const task = await lockTask(tx, taskId);
    if (!task) return { ok: false, reason: "not_found" };
    if (task.status === "done" || task.status === "cancelled") return { ok: false, reason: "invalid_state", task };
    const title = changes.relatedMeetingAt ? changes.relatedMeetingTitle?.trim() || null : null;
    const from = { related_meeting_title: task.related_meeting_title, related_meeting_at: task.related_meeting_at, effort_minutes: task.effort_minutes };
    const to = { related_meeting_title: title, related_meeting_at: changes.relatedMeetingAt, effort_minutes: changes.effortMinutes };
    if (from.related_meeting_title === to.related_meeting_title && sameTime(from.related_meeting_at, to.related_meeting_at) && from.effort_minutes === to.effort_minutes) {
      return { ok: true, task, changed: false };
    }
    const updated = await tx.one<TaskRow>(
      `UPDATE tasks SET related_meeting_title = $2, related_meeting_at = $3, effort_minutes = $4 WHERE id = $1 RETURNING *`,
      [taskId, to.related_meeting_title, to.related_meeting_at, to.effort_minutes],
    );
    await logEvent(tx, taskId, "nudge_context_changed", actor, { from, to }, now);
    return { ok: true, task: updated!, changed: true };
  });
}
