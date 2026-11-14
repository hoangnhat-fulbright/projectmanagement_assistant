import { describeExtractionError } from "./ai/claude.ts";
import type { Extractor } from "./ai/types.ts";
import { validateExtracted } from "./ai/validate.ts";
import { config } from "./config.ts";
import type { Db } from "./db.ts";
import { sendConfirmationRequests } from "./domain/notify.ts";
import { replanMeeting } from "./domain/nudges.ts";
import { logEvent } from "./domain/tasks.ts";
import type { Mailer } from "./mail.ts";

export type Deps = { db: Db; mailer: Mailer; extractor: Extractor; now: () => Date };

type MeetingRow = { id: string; title: string; started_at: Date; auto_send: boolean };

/**
 * Chạy một lần sau khi cuộc họp được tạo: trích xuất task từ phiên âm, kiểm tra,
 * lưu ở trạng thái `proposed`, rồi (nếu bật) gửi yêu cầu xác nhận cho các task đủ tin cậy.
 */
export async function processMeeting(deps: Deps, meetingId: string): Promise<void> {
  const { db } = deps;
  try {
    const meeting = await db.one<MeetingRow>(`SELECT id, title, started_at, auto_send FROM meetings WHERE id = $1`, [
      meetingId,
    ]);
    if (!meeting) return;
    const participants = await db.query<{ id: string; display_name: string; email: string }>(
      `SELECT id, display_name, email FROM participants WHERE meeting_id = $1 ORDER BY position`,
      [meetingId],
    );
    const segments = await db.query<{ id: string; idx: number; speaker: string | null; at_seconds: number | null; text: string }>(
      `SELECT id, idx, speaker, at_seconds, text FROM transcript_segments WHERE meeting_id = $1 ORDER BY idx`,
      [meetingId],
    );

    const input = {
      meetingTitle: meeting.title,
      startedAt: meeting.started_at,
      timezone: config.timezone,
      participants: participants.map((p) => ({ id: p.id, name: p.display_name, email: p.email })),
      segments: segments.map((s) => ({ idx: s.idx, speaker: s.speaker, atSeconds: s.at_seconds, text: s.text })),
    };
    const extracted = await deps.extractor.extract(input);
    const { accepted, rejected } = validateExtracted(extracted, input);
    if (rejected.length > 0) {
      console.warn(`[pipeline] meeting ${meetingId}: loại ${rejected.length} task`, rejected);
    }

    const now = deps.now();
    const segmentIdByIdx = new Map(segments.map((s) => [s.idx, s.id]));
    await db.tx(async (tx) => {
      // Chạy lại sau lỗi thì bắt đầu từ đầu: chưa có task nào được gửi đi.
      await tx.query(`DELETE FROM tasks WHERE meeting_id = $1`, [meetingId]);
      for (const [position, t] of accepted.entries()) {
        const id = crypto.randomUUID();
        const needsReview =
          !t.ownerParticipantId ||
          t.confidence < config.autoSendMinConfidence ||
          t.ownerConfidence < config.autoSendMinConfidence;
        await tx.query(
          `INSERT INTO tasks (id, meeting_id, title, owner_participant_id, status, due_at, due_is_inferred,
                              due_spoken_as, effort_minutes, source_segment_id, source_quote, confidence,
                              owner_confidence, needs_review, created_at, position)
           VALUES ($1, $2, $3, $4, 'proposed', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            id,
            meetingId,
            t.title,
            t.ownerParticipantId,
            t.dueAt,
            t.dueInferred,
            t.dueSpokenAs,
            t.effortMinutes,
            segmentIdByIdx.get(t.segmentIdx) ?? null,
            t.quote,
            t.confidence,
            t.ownerConfidence,
            needsReview,
            now,
            position,
          ],
        );
        await logEvent(
          tx,
          id,
          "proposed",
          { participantId: null, channel: "system" },
          { extractor: deps.extractor.name, confidence: t.confidence },
          now,
        );
      }
      await tx.query(`UPDATE meetings SET status = 'ready', error = NULL, extractor = $2 WHERE id = $1`, [
        meetingId,
        deps.extractor.name,
      ]);
    });

    if (meeting.auto_send) {
      await sendConfirmationRequests(db, deps.mailer, meetingId, { now, skipNeedsReview: true });
      await replanMeeting(db, meetingId, now);
    }
  } catch (error) {
    console.error(`[pipeline] meeting ${meetingId} thất bại:`, error);
    await db.query(`UPDATE meetings SET status = 'failed', error = $2 WHERE id = $1`, [
      meetingId,
      describeExtractionError(error),
    ]);
  }
}
