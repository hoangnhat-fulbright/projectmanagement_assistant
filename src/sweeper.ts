import { config } from "./config.ts";
import type { Db } from "./db.ts";
import { sendConfirmationRequests } from "./domain/notify.ts";
import { moveTask } from "./domain/tasks.ts";
import type { Mailer } from "./mail.ts";

const HOUR = 3_600_000;

/**
 * Việc định kỳ cho các task đang chờ xác nhận:
 *  - quá 72 giờ không phản hồi → `expired`, trả về cho người chủ trì;
 *  - quá 4 giờ chưa phản hồi → nhắc lại đúng MỘT lần.
 * Mốc 4 giờ cố định chỉ còn áp dụng cho người CHƯA có dữ liệu lịch. Người đã có lịch
 * được nhắc ở khoảng trống đầu tiên sau mốc đó, do src/domain/nudges.ts lập lịch và gửi.
 */
export async function runSweep(db: Db, mailer: Mailer, now: Date): Promise<{ expired: number; reminded: number }> {
  const expireBefore = new Date(now.getTime() - config.expireAfterHours * HOUR);
  const stale = await db.query<{ id: string }>(
    `SELECT id FROM tasks WHERE status = 'proposed' AND sent_at IS NOT NULL AND sent_at <= $1`,
    [expireBefore],
  );
  let expired = 0;
  for (const { id } of stale) {
    const result = await moveTask(db, id, "expired", { participantId: null, channel: "system" }, now);
    if (result.ok && result.changed) expired += 1;
  }

  const remindBefore = new Date(now.getTime() - config.reminderAfterHours * HOUR);
  const due = await db.query<{ id: string; meeting_id: string }>(
    `SELECT id, meeting_id FROM tasks
      WHERE status = 'proposed' AND sent_at IS NOT NULL AND sent_at <= $1 AND reminder_sent_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM participants p JOIN calendar_people c ON c.email = lower(p.email)
           WHERE p.id = tasks.owner_participant_id)`,
    [remindBefore],
  );
  const byMeeting = new Map<string, string[]>();
  for (const row of due) byMeeting.set(row.meeting_id, [...(byMeeting.get(row.meeting_id) ?? []), row.id]);

  let reminded = 0;
  for (const [meetingId, taskIds] of byMeeting) {
    const sent = await sendConfirmationRequests(db, mailer, meetingId, { now, kind: "confirm_reminder", taskIds });
    reminded += sent.tasks;
  }
  return { expired, reminded };
}
