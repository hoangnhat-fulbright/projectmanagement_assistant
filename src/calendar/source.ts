import { config } from "../config.ts";
import type { Db } from "../db.ts";
import { replaceBusyBlocks, saveHours } from "../domain/calendar.ts";
import type { BusyBlock, BusyKind, WorkHours } from "../nudge/gaps.ts";
import { zonedTimeToUtc } from "../time.ts";

/**
 * Nguồn dữ liệu lịch. Phần còn lại của app chỉ đọc bản sao trong database
 * (src/domain/calendar.ts); một nguồn lịch chỉ có việc trả về ảnh chụp bận/rảnh
 * để `syncCalendar` chép vào bản sao đó.
 *
 * Hiện có: nhập tay trên trang "Lịch thử" (ghi thẳng vào bản sao) và nguồn giả lập
 * dưới đây. Google Calendar sẽ là một `CalendarSource` nữa: `fetch` gọi API
 * freebusy bằng token OAuth của từng người, còn webhook thay đổi lịch và việc đồng
 * bộ định kỳ đều gọi `syncCalendar` rồi lập lịch lại nudge.
 */
export interface CalendarSource {
  readonly name: string;
  /**
   * Bận/rảnh của một người trong khoảng thời gian cho trước. Trả về null nếu người
   * này chưa kết nối lịch ở nguồn này. Không trả về tiêu đề hay mô tả sự kiện.
   */
  fetch(email: string, range: { from: Date; to: Date }): Promise<CalendarSnapshot | null>;
}

export type SourceBlock = BusyBlock & { eventId?: string | null };
export type CalendarSnapshot = { hours: WorkHours; blocks: SourceBlock[] };

/**
 * Chép lịch của một người từ nguồn vào bản sao, cho `calendarHorizonDays` ngày tới.
 * Trả về false nếu nguồn không có dữ liệu của người này. Người gọi lập lịch lại
 * nudge sau khi đồng bộ (xem `replanPerson`).
 */
export async function syncCalendar(db: Db, source: CalendarSource, email: string, now: Date): Promise<boolean> {
  const range = { from: now, to: new Date(now.getTime() + config.nudge.calendarHorizonDays * 86_400_000) };
  const snapshot = await source.fetch(email, range);
  if (!snapshot) return false;
  await db.tx(async (tx) => {
    await saveHours(tx, email, snapshot.hours, source.name, now);
    await replaceBusyBlocks(tx, email, range, snapshot.blocks);
  });
  return true;
}

/** Nguồn giả lập: lịch cố định theo email. Dùng trong test và để điền lịch mẫu. */
export function staticCalendarSource(data: Record<string, CalendarSnapshot>, name = "static"): CalendarSource {
  return {
    name,
    async fetch(email, range) {
      const snapshot = data[email.trim().toLowerCase()];
      if (!snapshot) return null;
      const blocks = snapshot.blocks.filter((b) => b.end.getTime() > range.from.getTime() && b.start.getTime() < range.to.getTime());
      return { hours: snapshot.hours, blocks };
    },
  };
}

/**
 * Lịch một ngày theo ví dụ của Lan trong wiki/04-context-aware-nudging.md:
 * họp 09:00–10:30, 11:00–12:00, nghỉ trưa 12:00–13:00, họp 13:00–14:00 và 15:00–16:00.
 */
export function sampleDayBlocks(year: number, month: number, day: number, tz: string): SourceBlock[] {
  const at = (h: number, m: number) => zonedTimeToUtc(year, month, day, h, m, tz);
  const spans: [number, number, number, number, BusyKind][] = [
    [9, 0, 10, 30, "meeting"],
    [11, 0, 12, 0, "meeting"],
    [12, 0, 13, 0, "meeting"],
    [13, 0, 14, 0, "meeting"],
    [15, 0, 16, 0, "meeting"],
  ];
  return spans.map(([h1, m1, h2, m2, kind], i) => ({
    start: at(h1, m1),
    end: at(h2, m2),
    kind,
    eventId: `sample-${year}-${month}-${day}-${i}`,
  }));
}
