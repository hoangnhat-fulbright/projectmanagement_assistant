export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Số ngày lịch từ a tới b (b sau a thì dương). */
export function daysBetween(a: string, b: string): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86_400_000);
}

/** 0 = Chủ nhật … 6 = Thứ Bảy */
export function dow(iso: string): number {
  return fromISO(iso).getDay();
}

export function isWorkday(iso: string): boolean {
  const d = dow(iso);
  return d >= 1 && d <= 5;
}

export function nextWorkday(iso: string): string {
  let d = iso;
  while (!isWorkday(d)) d = addDays(d, 1);
  return d;
}

/** Tuần làm việc: bắt đầu từ ngày làm việc gần nhất, kết thúc vào Thứ Sáu. */
export function sprintRange(today: string): { start: string; end: string } {
  const start = nextWorkday(today);
  let end = start;
  while (dow(end) !== 5) end = addDays(end, 1);
  if (end === start) end = addDays(end, 7);
  return { start, end };
}

/** Số ngày làm việc từ a tới b (tính cả hai đầu). */
export function workdays(a: string, b: string): number {
  let n = 0;
  for (let d = a; d <= b; d = addDays(d, 1)) if (isWorkday(d)) n++;
  return n;
}

export const DOW_NAMES = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

export function fmtDay(iso: string): string {
  const d = fromISO(iso);
  return `${DOW_NAMES[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

export function fmtShort(iso: string): string {
  const d = fromISO(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}
