import { config } from "../config.ts";
import type { Db } from "../db.ts";
import type { BusyBlock, BusyKind, Calendar, WorkHours } from "../nudge/gaps.ts";

/**
 * Bản sao lịch bận/rảnh trong database (bảng `calendar_people` và `busy_blocks`).
 * Mọi thứ tính khoảng trống đều đọc từ đây, không gọi thẳng nhà cung cấp lịch.
 * Chưa có tài khoản người dùng nên một người được nhận diện qua email (chữ thường).
 */

export type CalendarPerson = {
  email: string;
  timezone: string;
  work_start_minute: number;
  work_end_minute: number;
  work_days: string;
  source: string;
  synced_at: Date;
};

export type BusyBlockRow = { id: string; starts_at: Date; ends_at: Date; kind: BusyKind; calendar_event_id: string | null };

export const normEmail = (email: string) => email.trim().toLowerCase();

/** Giờ làm việc mặc định, dùng cho người chưa có dữ liệu lịch. */
export function defaultHours(): WorkHours {
  const n = config.nudge;
  return { timezone: config.timezone, startMinute: n.workStartMinute, endMinute: n.workEndMinute, days: n.workDays };
}

export function hoursOf(person: CalendarPerson): WorkHours {
  return {
    timezone: person.timezone,
    startMinute: person.work_start_minute,
    endMinute: person.work_end_minute,
    days: person.work_days.split(",").filter(Boolean).map(Number),
  };
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function getPerson(db: Db, email: string): Promise<CalendarPerson | null> {
  return db.one<CalendarPerson>(`SELECT * FROM calendar_people WHERE email = $1`, [normEmail(email)]);
}

export function listBlocks(db: Db, email: string, from: Date, to?: Date): Promise<BusyBlockRow[]> {
  return db.query<BusyBlockRow>(
    `SELECT id, starts_at, ends_at, kind, calendar_event_id FROM busy_blocks
      WHERE person_email = $1 AND ends_at > $2 AND ($3::timestamptz IS NULL OR starts_at < $3)
      ORDER BY starts_at, ends_at`,
    [normEmail(email), from, to ?? null],
  );
}

export type LoadedCalendar = {
  /** false = người này chưa có dữ liệu lịch; `cal` khi đó là giờ làm việc mặc định, không có khung bận. */
  connected: boolean;
  cal: Calendar;
};

export async function loadCalendar(db: Db, email: string, from: Date, to?: Date): Promise<LoadedCalendar> {
  const person = await getPerson(db, email);
  if (!person) return { connected: false, cal: { hours: defaultHours(), busy: [] } };
  const rows = await listBlocks(db, email, from, to);
  const busy: BusyBlock[] = rows.map((r) => ({ start: r.starts_at, end: r.ends_at, kind: r.kind }));
  return { connected: true, cal: { hours: hoursOf(person), busy } };
}

/** Tạo hoặc cập nhật giờ làm việc và múi giờ của một người. */
export async function saveHours(db: Db, email: string, hours: WorkHours, source: string, now: Date): Promise<void> {
  await db.query(
    `INSERT INTO calendar_people (email, timezone, work_start_minute, work_end_minute, work_days, source, synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (email) DO UPDATE
       SET timezone = EXCLUDED.timezone, work_start_minute = EXCLUDED.work_start_minute,
           work_end_minute = EXCLUDED.work_end_minute, work_days = EXCLUDED.work_days,
           source = EXCLUDED.source, synced_at = EXCLUDED.synced_at`,
    [normEmail(email), hours.timezone, hours.startMinute, hours.endMinute, [...hours.days].sort().join(","), source, now],
  );
}

/** Đảm bảo người này có dòng trong `calendar_people` (giờ làm việc mặc định nếu chưa có). */
export async function ensurePerson(db: Db, email: string, source: string, now: Date): Promise<void> {
  if (!(await getPerson(db, email))) await saveHours(db, email, defaultHours(), source, now);
}

export async function addBusyBlock(
  db: Db,
  email: string,
  block: BusyBlock & { eventId?: string | null },
): Promise<void> {
  await db.query(
    `INSERT INTO busy_blocks (id, person_email, starts_at, ends_at, kind, calendar_event_id) VALUES ($1, $2, $3, $4, $5, $6)`,
    [crypto.randomUUID(), normEmail(email), block.start, block.end, block.kind, block.eventId ?? null],
  );
}

export async function deleteBusyBlock(db: Db, email: string, id: string): Promise<void> {
  await db.query(`DELETE FROM busy_blocks WHERE id = $1 AND person_email = $2`, [id, normEmail(email)]);
}

/** Thay toàn bộ khung bận giao với [from, to) bằng danh sách mới. Dùng khi đồng bộ từ nguồn lịch. */
export async function replaceBusyBlocks(
  db: Db,
  email: string,
  range: { from: Date; to: Date },
  blocks: readonly (BusyBlock & { eventId?: string | null })[],
): Promise<void> {
  await db.tx(async (tx) => {
    await tx.query(`DELETE FROM busy_blocks WHERE person_email = $1 AND ends_at > $2 AND starts_at < $3`, [
      normEmail(email),
      range.from,
      range.to,
    ]);
    for (const b of blocks) {
      if (b.end.getTime() > b.start.getTime()) await addBusyBlock(tx, email, b);
    }
  });
}

/** Ngắt kết nối: xóa giờ làm việc và toàn bộ bản sao lịch của người này. */
export async function disconnectCalendar(db: Db, email: string): Promise<void> {
  await db.query(`DELETE FROM calendar_people WHERE email = $1`, [normEmail(email)]);
}
