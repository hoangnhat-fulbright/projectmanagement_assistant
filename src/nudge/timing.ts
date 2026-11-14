import { findGaps, gapAt, type Calendar, type Gap, type GapOptions } from "./gaps.ts";

/**
 * Bộ chọn thời điểm nhắc. Thuần như gaps.ts: không I/O, không LLM, để kết quả lặp
 * lại được và giải thích được. Thuật toán: wiki/04-context-aware-nudging.md.
 */

export const LEAD_MINUTES = 120;
export const GAP_WINDOW_HOURS = 48;
/** Khoảng trống phải dài hơn công sức từng này phút mới tính là "làm xong ngay được". */
export const FINISH_MARGIN_MINUTES = 5;
export const CONFIRM_REMINDER_AFTER_HOURS = 4;

const MINUTE = 60_000;
const HOUR = 3_600_000;

/** Thời gian báo trước của nhắc chuẩn bị: 2 tiếng, hoặc 2 lần công sức nếu lớn hơn. */
export function leadMinutes(effortMinutes: number, base: number = LEAD_MINUTES): number {
  return Math.max(base, effortMinutes * 2);
}

export type PrepPick = {
  at: Date;
  /** Thời điểm lý tưởng: mốc − thời gian báo trước. */
  idealAt: Date;
  /** true nếu thời điểm lý tưởng rơi vào lúc bận và đã dịch sớm lên. */
  shifted: boolean;
  gap: Gap;
};

/**
 * Nhắc chuẩn bị. T = mốc − thời gian báo trước. T rơi vào khoảng trống thì gửi lúc T;
 * không thì gửi vào ĐẦU khoảng trống gần nhất trước T, lùi qua cả các ngày trước nếu cần.
 * Chỉ dịch sớm lên, không bao giờ dịch muộn đi: không còn khoảng trống nào từ `earliest`
 * đến T thì trả về null (không nhắc chuẩn bị).
 */
export function pickPrepTime(
  cal: Calendar,
  p: { earliest: Date; anchorAt: Date; effortMinutes: number; leadBaseMinutes?: number },
  opts: GapOptions = {},
): PrepPick | null {
  const idealAt = new Date(p.anchorAt.getTime() - leadMinutes(p.effortMinutes, p.leadBaseMinutes) * MINUTE);
  if (idealAt.getTime() < p.earliest.getTime()) return null;
  const gaps = findGaps(cal, p.earliest, p.anchorAt, opts);
  const hit = gapAt(gaps, idealAt);
  if (hit) return { at: idealAt, idealAt, shifted: false, gap: hit };
  const before = gaps.filter((g) => g.start.getTime() < idealAt.getTime());
  const last = before[before.length - 1];
  return last ? { at: last.start, idealAt, shifted: true, gap: last } : null;
}

export type GapScore = { score: number; fits: boolean };

/**
 * Chấm điểm một khoảng trống cho nhắc khoảng trống (bản MVP: đủ dài, gần hạn).
 *  - đủ dài để làm xong (≥ công sức + 5 phút): +100; ngắn hơn nhưng vẫn là khoảng trống: +30;
 *  - càng gần hạn càng cộng, tối đa +40 khi sát hạn, 0 khi cách hạn trọn cửa sổ 48 giờ.
 * Nên: ưu tiên khoảng làm xong được; trong các khoảng cùng loại, chọn khoảng gần hạn nhất.
 */
export function scoreGap(gap: Gap, deadlineAt: Date, effortMinutes: number, windowHours: number = GAP_WINDOW_HOURS): GapScore {
  const fits = gap.minutes >= effortMinutes + FINISH_MARGIN_MINUTES;
  const hoursLeft = (deadlineAt.getTime() - gap.start.getTime()) / HOUR;
  const closeness = Math.min(1, Math.max(0, 1 - hoursLeft / windowHours));
  return { score: Math.round(((fits ? 100 : 30) + 40 * closeness) * 10) / 10, fits };
}

export type GapPick = { at: Date; gap: Gap; score: number; fits: boolean };

/**
 * Nhắc khoảng trống: trong các khoảng trống từ `earliest` đến hạn, thuộc 48 giờ cuối
 * trước hạn, chọn khoảng điểm cao nhất và gửi vào đầu khoảng đó. Có `after` (người
 * dùng bấm "Nhắc ở khoảng trống sau") thì lấy khoảng trống đầu tiên bắt đầu sau mốc đó.
 */
export function pickGapNudge(
  cal: Calendar,
  p: { earliest: Date; deadlineAt: Date; effortMinutes: number; after?: Date | null; windowHours?: number },
  opts: GapOptions = {},
): GapPick | null {
  const windowHours = p.windowHours ?? GAP_WINDOW_HOURS;
  const from = new Date(Math.max(p.earliest.getTime(), p.deadlineAt.getTime() - windowHours * HOUR));
  if (from.getTime() >= p.deadlineAt.getTime()) return null;
  const gaps = findGaps(cal, from, p.deadlineAt, opts);
  const scored = gaps.map((gap) => ({ at: gap.start, gap, ...scoreGap(gap, p.deadlineAt, p.effortMinutes, windowHours) }));
  if (p.after) {
    const after = p.after.getTime();
    return scored.find((s) => s.gap.start.getTime() > after) ?? null;
  }
  let best: GapPick | null = null;
  for (const s of scored) if (!best || s.score > best.score) best = s;
  return best;
}

/**
 * Nhắc xác nhận: khoảng trống đầu tiên trong lịch sau khi yêu cầu xác nhận được gửi
 * 4 giờ (wiki/03-one-click-commitment.md), trước khi yêu cầu hết hạn chờ.
 */
export function pickConfirmReminder(
  cal: Calendar,
  p: { sentAt: Date; earliest: Date; expiresAt: Date; afterHours?: number },
  opts: GapOptions = {},
): { at: Date; gap: Gap } | null {
  const from = new Date(Math.max(p.earliest.getTime(), p.sentAt.getTime() + (p.afterHours ?? CONFIRM_REMINDER_AFTER_HOURS) * HOUR));
  const gap = findGaps(cal, from, p.expiresAt, opts)[0];
  return gap ? { at: gap.start, gap } : null;
}
