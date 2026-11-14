import { localParts, zonedTimeToUtc } from "../time.ts";

/**
 * Tính khoảng trống trong lịch của một người. Module thuần: không đọc database,
 * không đọc đồng hồ, cùng đầu vào luôn cho cùng kết quả. Nudging dùng để chọn giờ
 * nhắc; Blocker Detection (giai đoạn 3) dùng lại để tính thời gian rảnh còn lại.
 * Định nghĩa khoảng trống: wiki/04-context-aware-nudging.md, bước 1.
 */

export type BusyKind = "meeting" | "focus" | "out_of_office";

/** Một khung giờ bận. Cố ý không có tiêu đề: nudging chỉ cần biết bận hay rảnh. */
export type BusyBlock = { start: Date; end: Date; kind: BusyKind };

export type WorkHours = {
  timezone: string;
  /** Phút tính từ 00:00 giờ địa phương. 510 = 08:30. */
  startMinute: number;
  endMinute: number;
  /** Các ngày làm việc, 0 = Chủ nhật … 6 = Thứ Bảy. */
  days: readonly number[];
};

export type Calendar = { hours: WorkHours; busy: readonly BusyBlock[] };

export type Gap = { start: Date; end: Date; minutes: number };

export type GapOptions = {
  /** Độ dài tối thiểu của một khoảng trống. Mặc định 15 phút. */
  minMinutes?: number;
  /** Khoảng trống bắt đầu sau khi cuộc họp trước kết thúc từng này phút. Mặc định 5. */
  bufferMinutes?: number;
};

export const MIN_GAP_MINUTES = 15;
export const BUFFER_AFTER_MEETING_MINUTES = 5;

const MINUTE = 60_000;
const MAX_DAYS = 400;

type Interval = { start: number; end: number };

/** Các khung giờ làm việc giao với [from, to), theo thứ tự thời gian. */
export function workWindows(hours: WorkHours, from: Date, to: Date): { start: Date; end: Date }[] {
  const out: { start: Date; end: Date }[] = [];
  if (hours.endMinute <= hours.startMinute || to.getTime() <= from.getTime()) return out;
  const tz = hours.timezone;
  const base = localParts(from, tz);
  for (let i = 0; i < MAX_DAYS; i++) {
    const day = new Date(Date.UTC(base.year, base.month - 1, base.day + i));
    const [y, m, d] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()];
    const start = zonedTimeToUtc(y, m, d, Math.floor(hours.startMinute / 60), hours.startMinute % 60, tz);
    if (start.getTime() >= to.getTime()) break;
    if (!hours.days.includes(day.getUTCDay())) continue;
    const end = zonedTimeToUtc(y, m, d, Math.floor(hours.endMinute / 60), hours.endMinute % 60, tz);
    const s = Math.max(start.getTime(), from.getTime());
    const e = Math.min(end.getTime(), to.getTime());
    if (e > s) out.push({ start: new Date(s), end: new Date(e) });
  }
  return out;
}

/**
 * Các khoảng trống trong [from, to): nằm trong giờ làm việc, không trùng khung bận
 * nào (họp, focus time, nghỉ phép), bắt đầu sau khi cuộc họp trước kết thúc
 * `bufferMinutes`, và sau khi trừ khoảng đệm đó vẫn dài ít nhất `minMinutes`.
 */
export function findGaps(cal: Calendar, from: Date, to: Date, opts: GapOptions = {}): Gap[] {
  const minMs = (opts.minMinutes ?? MIN_GAP_MINUTES) * MINUTE;
  const bufferMs = (opts.bufferMinutes ?? BUFFER_AFTER_MEETING_MINUTES) * MINUTE;
  const blocked: Interval[] = cal.busy
    .map((b) => ({ start: b.start.getTime(), end: b.end.getTime() + (b.kind === "meeting" ? bufferMs : 0) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);

  const gaps: Gap[] = [];
  const push = (start: number, end: number) => {
    if (end - start >= minMs && end - start > 0) {
      gaps.push({ start: new Date(start), end: new Date(end), minutes: Math.floor((end - start) / MINUTE) });
    }
  };
  for (const w of workWindows(cal.hours, from, to)) {
    const [ws, we] = [w.start.getTime(), w.end.getTime()];
    let cursor = ws;
    for (const b of blocked) {
      if (b.end <= cursor) continue;
      if (b.start >= we) break;
      if (b.start > cursor) push(cursor, b.start);
      cursor = Math.max(cursor, b.end);
      if (cursor >= we) break;
    }
    if (cursor < we) push(cursor, we);
  }
  return gaps;
}

/** Khoảng trống chứa thời điểm `t` (tính cả đầu, không tính cuối). */
export function gapAt(gaps: readonly Gap[], t: Date): Gap | null {
  const ms = t.getTime();
  return gaps.find((g) => g.start.getTime() <= ms && ms < g.end.getTime()) ?? null;
}

/** Người này rảnh suốt đoạn [from, to]: nằm trọn trong một ngày làm việc và không chạm khung bận nào. */
export function isFreeBetween(cal: Calendar, from: Date, to: Date): boolean {
  const end = new Date(Math.max(to.getTime(), from.getTime() + MINUTE));
  const windows = workWindows(cal.hours, from, end);
  if (windows.length !== 1) return false;
  const w = windows[0]!;
  if (w.start.getTime() !== from.getTime() || w.end.getTime() !== end.getTime()) return false;
  return !cal.busy.some((b) => b.start.getTime() < end.getTime() && b.end.getTime() > from.getTime());
}

/** Tổng số phút trống trong [from, to). Blocker Detection dùng để so với công sức còn lại. */
export function freeMinutes(cal: Calendar, from: Date, to: Date, opts: GapOptions = {}): number {
  return findGaps(cal, from, to, opts).reduce((sum, g) => sum + g.minutes, 0);
}
