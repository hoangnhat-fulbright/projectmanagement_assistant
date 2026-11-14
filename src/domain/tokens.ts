import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.ts";
import type { Db } from "../db.ts";

/** Nút trên email xác nhận. */
export type CommitAction = "confirm" | "amend" | "decline" | "confirm_all";
/** Nút trên email nhắc việc: Xong rồi, Đang làm, Nhắc ở khoảng trống sau, Dời hạn. */
export type NudgeAction = "done" | "start" | "snooze" | "reschedule";
export type TokenAction = CommitAction | NudgeAction;

const NUDGE_ACTIONS: readonly string[] = ["done", "start", "snooze", "reschedule"];
export const isNudgeAction = (action: TokenAction): action is NudgeAction => NUDGE_ACTIONS.includes(action);

export type TokenRow = {
  id: string;
  meeting_id: string;
  participant_id: string;
  task_id: string | null;
  action: TokenAction;
  expires_at: Date;
  used_at: Date | null;
};

const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");

/**
 * Tạo token cho một nút trong email. Mỗi token gắn với đúng một người nhận, một
 * hành động và (trừ `confirm_all`) một task. Database chỉ giữ mã băm, nên lộ
 * database không làm lộ các liên kết còn hiệu lực.
 */
export async function createActionToken(
  db: Db,
  p: { meetingId: string; participantId: string; taskId: string | null; action: TokenAction; now: Date },
): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const expires = new Date(p.now.getTime() + config.tokenTtlDays * 86_400_000);
  await db.query(
    `INSERT INTO action_tokens (id, token_hash, meeting_id, participant_id, task_id, action, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [crypto.randomUUID(), hash(raw), p.meetingId, p.participantId, p.taskId, p.action, expires, p.now],
  );
  return raw;
}

export type TokenLookup = { token: TokenRow; state: "valid" | "used" | "expired" };

export async function lookupToken(db: Db, raw: string, now: Date): Promise<TokenLookup | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(raw)) return null;
  const token = await db.one<TokenRow>(`SELECT * FROM action_tokens WHERE token_hash = $1`, [hash(raw)]);
  if (!token) return null;
  const state = token.used_at ? "used" : token.expires_at.getTime() <= now.getTime() ? "expired" : "valid";
  return { token, state };
}

export async function markTokenUsed(db: Db, tokenId: string, now: Date): Promise<void> {
  await db.query(`UPDATE action_tokens SET used_at = $2 WHERE id = $1 AND used_at IS NULL`, [tokenId, now]);
}
