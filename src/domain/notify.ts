import { config } from "../config.ts";
import type { Db } from "../db.ts";
import { renderConfirmEmail, type EmailTask } from "../email.ts";
import type { Mailer } from "../mail.ts";
import { logEvent } from "./tasks.ts";
import { createActionToken } from "./tokens.ts";

type PendingRow = {
  id: string;
  title: string;
  due_at: Date | null;
  due_is_inferred: boolean;
  source_quote: string;
  owner_confidence: number;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  speaker: string | null;
  at_seconds: number | null;
};

export type SendOptions = {
  now: Date;
  kind?: "confirm_request" | "confirm_reminder";
  /** Chỉ gửi các task này (gửi lại, nhắc lại). Bỏ trống = mọi task chưa gửi. */
  taskIds?: string[];
  /** Bỏ qua các task đang chờ người chủ trì duyệt (dùng khi tự động gửi sau trích xuất). */
  skipNeedsReview?: boolean;
};

/**
 * Gửi yêu cầu xác nhận: mỗi người nhận MỘT email gom mọi task của họ trong buổi họp.
 * Trả về số email đã gửi thành công và số task nằm trong các email đó.
 */
export async function sendConfirmationRequests(
  db: Db,
  mailer: Mailer,
  meetingId: string,
  opts: SendOptions,
): Promise<{ emails: number; tasks: number; failed: number }> {
  const kind = opts.kind ?? "confirm_request";
  const params: unknown[] = [meetingId];
  let filter = "";
  if (opts.taskIds) {
    if (opts.taskIds.length === 0) return { emails: 0, tasks: 0, failed: 0 };
    filter = ` AND t.id IN (${opts.taskIds.map((id) => `$${params.push(id)}`).join(", ")})`;
  } else {
    filter = " AND t.sent_at IS NULL";
  }
  if (opts.skipNeedsReview) filter += " AND t.needs_review = false";

  const rows = await db.query<PendingRow>(
    `SELECT t.id, t.title, t.due_at, t.due_is_inferred, t.source_quote, t.owner_confidence,
            p.id AS owner_id, p.display_name AS owner_name, p.email AS owner_email,
            s.speaker, s.at_seconds
       FROM tasks t
       JOIN participants p ON p.id = t.owner_participant_id
       LEFT JOIN transcript_segments s ON s.id = t.source_segment_id
      WHERE t.meeting_id = $1 AND t.status = 'proposed'${filter}
      ORDER BY p.position, t.position, t.id`,
    params,
  );
  if (rows.length === 0) return { emails: 0, tasks: 0, failed: 0 };

  const meeting = await db.one<{ title: string; started_at: Date }>(
    `SELECT title, started_at FROM meetings WHERE id = $1`,
    [meetingId],
  );
  if (!meeting) return { emails: 0, tasks: 0, failed: 0 };
  const organizer = await db.one<{ display_name: string; email: string }>(
    `SELECT display_name, email FROM participants WHERE meeting_id = $1 AND is_organizer LIMIT 1`,
    [meetingId],
  );

  const byOwner = new Map<string, PendingRow[]>();
  for (const row of rows) {
    const list = byOwner.get(row.owner_id) ?? [];
    list.push(row);
    byOwner.set(row.owner_id, list);
  }

  const link = (raw: string) => `${config.baseUrl}/a/${raw}`;
  let emails = 0;
  let tasks = 0;
  let failed = 0;

  for (const [ownerId, ownerTasks] of byOwner) {
    const first = ownerTasks[0]!;
    const emailTasks: EmailTask[] = [];
    for (const t of ownerTasks) {
      const token = (action: "confirm" | "amend" | "decline") =>
        createActionToken(db, { meetingId, participantId: ownerId, taskId: t.id, action, now: opts.now });
      emailTasks.push({
        title: t.title,
        dueAt: t.due_at,
        dueIsInferred: t.due_is_inferred,
        quote: t.source_quote,
        speaker: t.speaker,
        atSeconds: t.at_seconds,
        uncertainOwner: t.owner_confidence < config.autoSendMinConfidence,
        links: {
          confirm: link(await token("confirm")),
          amend: link(await token("amend")),
          decline: link(await token("decline")),
        },
      });
    }
    const confirmAllLink =
      ownerTasks.length >= 2
        ? link(
            await createActionToken(db, {
              meetingId,
              participantId: ownerId,
              taskId: null,
              action: "confirm_all",
              now: opts.now,
            }),
          )
        : null;

    const mail = renderConfirmEmail({
      kind,
      recipientName: first.owner_name,
      meetingTitle: meeting.title,
      meetingStartedAt: meeting.started_at,
      organizerName: organizer?.display_name ?? null,
      organizerEmail: organizer?.email ?? null,
      tasks: emailTasks,
      confirmAllLink,
    });

    let error: string | null = null;
    try {
      await mailer.send({ to: first.owner_email, toName: first.owner_name, ...mail });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    await db.query(
      `INSERT INTO notifications (id, meeting_id, recipient_participant_id, channel, kind, subject,
                                  body_html, body_text, error, sent_at)
       VALUES ($1, $2, $3, 'email', $4, $5, $6, $7, $8, $9)`,
      [
        crypto.randomUUID(),
        meetingId,
        ownerId,
        kind,
        mail.subject,
        mailer.outboxOnly ? mail.html : null,
        mailer.outboxOnly ? mail.text : null,
        error,
        opts.now,
      ],
    );

    if (error) {
      failed += 1;
      continue;
    }
    emails += 1;
    tasks += ownerTasks.length;
    const column = kind === "confirm_reminder" ? "reminder_sent_at" : "sent_at";
    for (const t of ownerTasks) {
      await db.query(`UPDATE tasks SET ${column} = $2 WHERE id = $1`, [t.id, opts.now]);
      await logEvent(
        db,
        t.id,
        kind === "confirm_reminder" ? "reminded" : "sent",
        { participantId: null, channel: "system" },
        { to: ownerId },
        opts.now,
      );
    }
  }
  return { emails, tasks, failed };
}
