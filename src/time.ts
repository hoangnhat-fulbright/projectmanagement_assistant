import { config } from "./config.ts";

const WEEKDAYS = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

export type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Chủ nhật … 6 = Thứ Bảy */
  weekday: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Giờ địa phương của một thời điểm trong múi giờ `tz`. */
export function localParts(date: Date, tz: string = config.timezone): LocalParts {
  const p: Record<string, number> = {};
  for (const part of formatter(tz).formatToParts(date)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const { year = 0, month = 1, day = 1, hour = 0, minute = 0 } = p;
  return { year, month, day, hour, minute, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}

function offsetMs(utcMs: number, tz: string): number {
  const p = localParts(new Date(utcMs), tz);
  const second = Math.floor(utcMs / 1000) % 60;
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, second) - Math.floor(utcMs / 1000) * 1000;
}

/** Chuyển giờ địa phương trong múi giờ `tz` thành thời điểm UTC. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string = config.timezone,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(guess, tz);
  // Lặp lần hai để đúng quanh thời điểm đổi giờ mùa hè.
  return new Date(guess - offsetMs(first, tz));
}

/** Cộng `days` ngày lịch vào một ngày địa phương, trả về ngày địa phương mới lúc `hour:00`. */
export function localDayPlus(base: LocalParts, days: number, hour: number, tz: string = config.timezone): Date {
  const d = new Date(Date.UTC(base.year, base.month - 1, base.day + days));
  return zonedTimeToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), hour, 0, tz);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "Thứ Sáu 20/11, 17:00" */
export function fmtDateTime(date: Date, tz: string = config.timezone): string {
  const p = localParts(date, tz);
  return `${WEEKDAYS[p.weekday]} ${pad(p.day)}/${pad(p.month)}, ${pad(p.hour)}:${pad(p.minute)}`;
}

/** "17:00" */
export function fmtTime(date: Date, tz: string = config.timezone): string {
  const p = localParts(date, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** "17:00 hôm nay", "09:00 ngày mai", hoặc "Thứ Sáu 20/11, 17:00" nếu xa hơn. */
export function fmtWhen(date: Date, now: Date, tz: string = config.timezone): string {
  const [a, b] = [localParts(date, tz), localParts(now, tz)];
  const days = Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / 86_400_000);
  if (days === 0) return `${fmtTime(date, tz)} hôm nay`;
  if (days === 1) return `${fmtTime(date, tz)} ngày mai`;
  return fmtDateTime(date, tz);
}

/** 510 → "08:30" */
export function minuteToClock(minute: number): string {
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
}

/** "08:30" → 510. Trả về null nếu sai định dạng. */
export function clockToMinute(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [h, mi] = [Number(m[1]), Number(m[2])];
  return h > 24 || mi > 59 || h * 60 + mi > 1440 ? null : h * 60 + mi;
}

/** "16/11/2026" */
export function fmtDate(date: Date, tz: string = config.timezone): string {
  const p = localParts(date, tz);
  return `${pad(p.day)}/${pad(p.month)}/${p.year}`;
}

/** Giá trị cho <input type="datetime-local">: "2026-11-20T17:00" */
export function toLocalInput(date: Date, tz: string = config.timezone): string {
  const p = localParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Đọc giá trị của <input type="datetime-local">. Trả về null nếu sai định dạng. */
export function fromLocalInput(value: string, tz: string = config.timezone): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return zonedTimeToUtc(y, mo, d, h, mi, tz);
}

/** Mốc thời gian trong phiên âm: 754 → "12:34", 3723 → "1:02:03" */
export function fmtOffset(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** ISO 8601 kèm độ lệch múi giờ, ví dụ "2026-11-16T10:00:00+07:00". Dùng trong prompt cho AI. */
export function toZonedIso(date: Date, tz: string = config.timezone): string {
  const p = localParts(date, tz);
  const off = Math.round(offsetMs(date.getTime(), tz) / 60000);
  const sign = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
