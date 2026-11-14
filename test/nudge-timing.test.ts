import assert from "node:assert/strict";
import { test } from "node:test";
import { findGaps, freeMinutes, isFreeBetween, type BusyBlock, type BusyKind, type Calendar, type WorkHours } from "../src/nudge/gaps.ts";
import { leadMinutes, pickConfirmReminder, pickGapNudge, pickPrepTime, scoreGap } from "../src/nudge/timing.ts";
import { zonedTimeToUtc } from "../src/time.ts";

const TZ = "Asia/Ho_Chi_Minh";
const HOURS: WorkHours = { timezone: TZ, startMinute: 9 * 60, endMinute: 18 * 60, days: [1, 2, 3, 4, 5] };

/** Giờ Việt Nam trong tháng 11/2026. Thứ Sáu là ngày 20. */
const at = (day: number, hhmm: string): Date => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return zonedTimeToUtc(2026, 11, day, h, m, TZ);
};
const block = (day: number, from: string, to: string, kind: BusyKind = "meeting"): BusyBlock => ({ start: at(day, from), end: at(day, to), kind });
const hhmm = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
const spans = (cal: Calendar, from: Date, to: Date) => findGaps(cal, from, to).map((g) => `${hhmm(g.start)}–${hhmm(g.end).slice(4)} (${g.minutes})`);

// Lịch thứ Sáu của Lan trong wiki/04-context-aware-nudging.md, mục "Ví dụ".
const LAN: Calendar = {
  hours: HOURS,
  busy: [
    block(20, "09:00", "10:30"), // Họp khách hàng
    block(20, "11:00", "12:00"), // Sprint review
    block(20, "12:00", "13:00"), // Nghỉ trưa
    block(20, "13:00", "14:00"), // 1:1 với quản lý
    block(20, "15:00", "16:00"), // Weekly Sales
  ],
};
const WEEKLY_SALES = at(20, "15:00");
const Q4_EFFORT = 45;

test("khoảng trống: trong giờ làm việc, sau cuộc họp trước 5 phút, dài ít nhất 15 phút", () => {
  assert.deepEqual(spans(LAN, at(20, "00:00"), at(21, "00:00")), [
    "Fri 10:35–11:00 (25)",
    "Fri 14:05–15:00 (55)",
    "Fri 16:05–18:00 (115)",
  ]);
});

test("khoảng trống: bỏ khe quá ngắn, nghỉ phép, focus time, cuối tuần và ngoài giờ", () => {
  const cal: Calendar = {
    hours: HOURS,
    busy: [
      block(19, "09:00", "10:00"),
      block(19, "10:15", "11:00"), // khe 10:00–10:15 chỉ còn 10 phút sau khoảng đệm
      block(19, "11:20", "12:00"), // khe 11:05–11:20 đúng 15 phút: vẫn tính
      block(19, "13:00", "15:00", "focus"), // focus time không có khoảng đệm phía sau
      block(20, "00:00", "23:59", "out_of_office"),
    ],
  };
  assert.deepEqual(spans(cal, at(19, "07:00"), at(24, "12:00")), [
    "Thu 11:05–11:20 (15)",
    "Thu 12:05–13:00 (55)",
    "Thu 15:00–18:00 (180)",
    // thứ Sáu nghỉ phép, thứ Bảy và Chủ nhật không làm việc
    "Mon 09:00–18:00 (540)",
    "Tue 09:00–12:00 (180)",
  ]);
  assert.equal(freeMinutes(cal, at(19, "07:00"), at(20, "00:00")), 250);
});

test("khoảng trống: bắt đầu tính giữa chừng thì vẫn tôn trọng khoảng đệm sau cuộc họp vừa xong", () => {
  assert.deepEqual(spans(LAN, at(20, "10:32"), at(20, "12:00")), ["Fri 10:35–11:00 (25)"]);
  assert.deepEqual(spans(LAN, at(20, "10:40"), at(20, "12:00")), ["Fri 10:40–11:00 (20)"]);
  // Còn dưới 15 phút thì không còn là khoảng trống.
  assert.deepEqual(spans(LAN, at(20, "10:50"), at(20, "12:00")), []);
});

test("isFreeBetween: rảnh suốt đoạn, trong giờ làm việc", () => {
  assert.ok(isFreeBetween(LAN, at(20, "10:35"), at(20, "10:39")));
  assert.ok(!isFreeBetween(LAN, at(20, "10:35"), at(20, "11:10")), "chạm Sprint review");
  assert.ok(!isFreeBetween(LAN, at(20, "13:30"), at(20, "13:31")), "đang trong 1:1");
  assert.ok(!isFreeBetween(LAN, at(20, "18:30"), at(20, "18:31")), "ngoài giờ");
  assert.ok(!isFreeBetween(LAN, at(21, "10:00"), at(21, "10:01")), "thứ Bảy");
});

test("thời gian báo trước: 2 tiếng, hoặc 2 lần công sức nếu lớn hơn", () => {
  assert.equal(leadMinutes(45), 120);
  assert.equal(leadMinutes(60), 120);
  assert.equal(leadMinutes(180), 360);
});

test("ví dụ của Lan: 13:00 đang họp 1:1 → nhắc chuẩn bị dịch sớm lên 10:35", () => {
  const pick = pickPrepTime(LAN, { earliest: at(19, "16:00"), anchorAt: WEEKLY_SALES, effortMinutes: Q4_EFFORT });
  assert.ok(pick);
  assert.equal(hhmm(pick.idealAt), "Fri 13:00");
  assert.equal(pick.shifted, true);
  assert.equal(hhmm(pick.at), "Fri 10:35");
  // "Bạn có 25 phút bây giờ": khoảng 10:35–11:00 ngắn hơn 45 phút công sức nhưng vẫn là khoảng gần nhất trước 13:00.
  assert.equal(pick.gap.minutes, 25);
});

test("ví dụ của Lan: đến 14:05 chưa bắt đầu → nhắc khoảng trống, trống đến 15:00", () => {
  const pick = pickGapNudge(LAN, { earliest: at(19, "16:00"), deadlineAt: WEEKLY_SALES, effortMinutes: Q4_EFFORT });
  assert.ok(pick);
  assert.equal(hhmm(pick.at), "Fri 14:05");
  assert.equal(hhmm(pick.gap.end), "Fri 15:00");
  assert.equal(pick.fits, true, "55 phút trống ≥ 45 phút công sức + 5");
  // Sau khi đã gửi nhắc chuẩn bị lúc 10:35, tính lại lúc 10:40 vẫn ra 14:05.
  assert.equal(hhmm(pickGapNudge(LAN, { earliest: at(20, "10:40"), deadlineAt: WEEKLY_SALES, effortMinutes: Q4_EFFORT })!.at), "Fri 14:05");
});

test("nhắc chuẩn bị: thời điểm lý tưởng đang rảnh thì gửi đúng lúc đó", () => {
  const cal: Calendar = { hours: HOURS, busy: [block(20, "09:00", "10:30")] };
  const pick = pickPrepTime(cal, { earliest: at(19, "16:00"), anchorAt: WEEKLY_SALES, effortMinutes: Q4_EFFORT });
  assert.equal(hhmm(pick!.at), "Fri 13:00");
  assert.equal(pick!.shifted, false);
});

test("nhắc chuẩn bị: việc lớn được báo trước 2 lần công sức", () => {
  const cal: Calendar = { hours: HOURS, busy: [] };
  const pick = pickPrepTime(cal, { earliest: at(19, "09:00"), anchorAt: WEEKLY_SALES, effortMinutes: 180 });
  assert.equal(hhmm(pick!.at), "Fri 09:00"); // 15:00 − 6 tiếng
});

test("nhắc chuẩn bị: trong ngày không còn khoảng trống trước T → khoảng trống cuối của ngày làm việc trước đó", () => {
  // Họp thứ Hai 23/11 lúc 10:00 → T = 08:00, trước giờ làm việc. Ngày làm việc trước đó là thứ Sáu.
  const pick = pickPrepTime(LAN, { earliest: at(19, "16:00"), anchorAt: at(23, "10:00"), effortMinutes: 30 });
  assert.equal(hhmm(pick!.idealAt), "Mon 08:00");
  assert.equal(hhmm(pick!.at), "Fri 16:05");
});

test("nhắc chuẩn bị: không bao giờ dịch muộn đi", () => {
  // Lúc 11:30 Lan đang họp, T = 13:00 cũng đang họp, giữa hai mốc không có khoảng trống nào.
  assert.equal(pickPrepTime(LAN, { earliest: at(20, "11:30"), anchorAt: WEEKLY_SALES, effortMinutes: Q4_EFFORT }), null);
  // T đã trôi qua: không nhắc chuẩn bị nữa (nhắc khoảng trống lo phần còn lại).
  assert.equal(pickPrepTime(LAN, { earliest: at(20, "13:10"), anchorAt: WEEKLY_SALES, effortMinutes: Q4_EFFORT }), null);
  for (const earliest of [at(19, "09:00"), at(20, "09:00"), at(20, "10:36")]) {
    const pick = pickPrepTime(LAN, { earliest, anchorAt: WEEKLY_SALES, effortMinutes: Q4_EFFORT });
    assert.ok(pick && pick.at.getTime() <= pick.idealAt.getTime());
  }
});

test("chấm điểm khoảng trống: đủ dài thắng gần hạn; cùng loại thì gần hạn thắng", () => {
  const gap = (from: string, to: string) => findGaps({ hours: HOURS, busy: [] }, at(20, from), at(20, to))[0]!;
  const long = scoreGap(gap("09:00", "10:00"), WEEKLY_SALES, 45);
  const shortLate = scoreGap(gap("14:30", "15:00"), WEEKLY_SALES, 45);
  const longLate = scoreGap(gap("14:00", "15:00"), WEEKLY_SALES, 45);
  assert.deepEqual([long.fits, shortLate.fits, longLate.fits], [true, false, true]);
  assert.ok(long.score > shortLate.score);
  assert.ok(longLate.score > long.score);
});

test("nhắc khoảng trống: chỉ trong 48 giờ trước hạn, và 'nhắc ở khoảng trống sau' lấy khoảng kế tiếp", () => {
  // Hạn thứ Sáu 15:00, tính từ thứ Hai: không xét khoảng trống nào trước thứ Tư 15:00.
  const far = pickGapNudge({ hours: HOURS, busy: [] }, { earliest: at(16, "09:00"), deadlineAt: WEEKLY_SALES, effortMinutes: 600 });
  assert.equal(hhmm(far!.at), "Fri 09:00", "không khoảng nào đủ 10 tiếng → khoảng gần hạn nhất");
  assert.ok(far!.at.getTime() >= at(18, "15:00").getTime());

  // Lan bấm hoãn trong khoảng 10:35–11:00 → khoảng kế tiếp là 14:05, không phải khoảng điểm cao nhất tính lại.
  const next = pickGapNudge(LAN, { earliest: at(20, "10:40"), deadlineAt: at(20, "18:00"), effortMinutes: 30, after: at(20, "11:00") });
  assert.equal(hhmm(next!.at), "Fri 14:05");
  // Hoãn ở khoảng cuối cùng trước hạn: không còn gì để nhắc.
  assert.equal(pickGapNudge(LAN, { earliest: at(20, "14:10"), deadlineAt: WEEKLY_SALES, effortMinutes: 45, after: at(20, "15:00") }), null);
  // Hạn đã qua.
  assert.equal(pickGapNudge(LAN, { earliest: at(20, "15:30"), deadlineAt: WEEKLY_SALES, effortMinutes: 45 }), null);
});

test("nhắc xác nhận: khoảng trống đầu tiên sau 4 giờ kể từ lúc gửi", () => {
  // Gửi thứ Sáu 08:00 → sau 12:00. Lan bận đến 14:00 → 14:05.
  const sentAt = at(20, "08:00");
  const pick = pickConfirmReminder(LAN, { sentAt, earliest: sentAt, expiresAt: at(23, "08:00") });
  assert.equal(hhmm(pick!.at), "Fri 14:05");
  // Gửi thứ Sáu 16:30 → sau 20:30 là ngoài giờ → sáng thứ Hai.
  const late = pickConfirmReminder(LAN, { sentAt: at(20, "16:30"), earliest: at(20, "16:30"), expiresAt: at(23, "16:30") });
  assert.equal(hhmm(late!.at), "Mon 09:00");
  // Không còn khoảng trống nào trước khi yêu cầu hết hạn chờ.
  assert.equal(pickConfirmReminder(LAN, { sentAt: at(20, "17:00"), earliest: at(20, "17:00"), expiresAt: at(21, "12:00") }), null);
});
