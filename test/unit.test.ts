import assert from "node:assert/strict";
import { test } from "node:test";
import { demoExtractor, matchParticipant } from "../src/ai/demo.ts";
import type { ExtractedTask, ExtractInput } from "../src/ai/types.ts";
import { validateExtracted } from "../src/ai/validate.ts";
import { parseParticipants } from "../src/app.ts";
import { canTransition } from "../src/domain/tasks.ts";
import { SAMPLE } from "../src/sample.ts";
import { fmtDateTime, fmtOffset, fromLocalInput, localParts, toLocalInput, toZonedIso, zonedTimeToUtc } from "../src/time.ts";
import { parseTranscript } from "../src/transcript.ts";

const TZ = "Asia/Ho_Chi_Minh";
// Thứ Hai 16/11/2026, 10:00 giờ Việt Nam
const MEETING_START = new Date("2026-11-16T03:00:00Z");

const participants = [
  { id: "p-minh", name: "Trần Minh", email: "minh@example.com" },
  { id: "p-lan", name: "Nguyễn Lan", email: "lan@example.com" },
  { id: "p-hung", name: "Lê Hùng", email: "hung@example.com" },
];

function sampleInput(): ExtractInput {
  return {
    meetingTitle: SAMPLE.title,
    startedAt: MEETING_START,
    timezone: TZ,
    participants,
    segments: parseTranscript(SAMPLE.transcript),
  };
}

test("parseTranscript đọc mốc thời gian, người nói và nối dòng tiếp theo", () => {
  const segs = parseTranscript(
    ["[00:12] Lan: Xin chào.", "tiếp tục câu trên", "1:02:03 Minh: Vâng", "(05:00) - Hùng: Ok", "", "Lan: không có giờ"].join("\n"),
  );
  assert.equal(segs.length, 4);
  assert.deepEqual(segs[0], { idx: 0, speaker: "Lan", atSeconds: 12, text: "Xin chào. tiếp tục câu trên" });
  assert.equal(segs[1]!.atSeconds, 3723);
  assert.equal(segs[2]!.speaker, "Hùng");
  assert.equal(segs[2]!.atSeconds, 300);
  assert.deepEqual(segs[3], { idx: 3, speaker: "Lan", atSeconds: null, text: "không có giờ" });
});

test("parseTranscript: văn bản không có người nói vẫn thành đoạn", () => {
  const segs = parseTranscript("Chỉ là một đoạn văn.\nDòng hai.");
  assert.equal(segs.length, 1);
  assert.equal(segs[0]!.speaker, null);
  assert.equal(segs[0]!.text, "Chỉ là một đoạn văn. Dòng hai.");
});

test("parseParticipants chấp nhận nhiều dạng và báo lỗi rõ ràng", () => {
  const ok = parseParticipants("Trần Minh <Minh@Example.com>\nNguyễn Lan, lan@example.com\n\nLê Hùng hung@example.com");
  assert.equal(ok.error, null);
  assert.deepEqual(ok.list, [
    { name: "Trần Minh", email: "minh@example.com" },
    { name: "Nguyễn Lan", email: "lan@example.com" },
    { name: "Lê Hùng", email: "hung@example.com" },
  ]);
  assert.match(parseParticipants("Chỉ có tên").error ?? "", /Không đọc được dòng/);
  assert.match(parseParticipants("A <a@x.com>\nB <a@x.com>").error ?? "", /hai lần/);
  assert.match(parseParticipants("  \n").error ?? "", /ít nhất một/);
});

test("chuyển đổi giờ địa phương và UTC", () => {
  const utc = zonedTimeToUtc(2026, 11, 20, 17, 0, TZ);
  assert.equal(utc.toISOString(), "2026-11-20T10:00:00.000Z");
  assert.equal(fmtDateTime(utc, TZ), "Thứ Sáu 20/11, 17:00");
  assert.equal(toLocalInput(utc, TZ), "2026-11-20T17:00");
  assert.equal(fromLocalInput("2026-11-20T17:00", TZ)?.toISOString(), utc.toISOString());
  assert.equal(fromLocalInput("không phải ngày", TZ), null);
  assert.equal(toZonedIso(utc, TZ), "2026-11-20T17:00:00+07:00");
  assert.equal(localParts(MEETING_START, TZ).weekday, 1);
  // Múi giờ có giờ mùa hè: 15/07 ở New York lệch UTC 4 tiếng, 15/01 lệch 5 tiếng.
  assert.equal(zonedTimeToUtc(2026, 7, 15, 9, 0, "America/New_York").toISOString(), "2026-07-15T13:00:00.000Z");
  assert.equal(zonedTimeToUtc(2026, 1, 15, 9, 0, "America/New_York").toISOString(), "2026-01-15T14:00:00.000Z");
  assert.equal(fmtOffset(754), "12:34");
  assert.equal(fmtOffset(3723), "1:02:03");
});

test("máy trạng thái chỉ cho các bước chuyển hợp lệ", () => {
  assert.ok(canTransition("proposed", "committed"));
  assert.ok(canTransition("declined", "proposed"));
  assert.ok(canTransition("committed", "done"));
  assert.ok(!canTransition("done", "committed"));
  assert.ok(!canTransition("proposed", "done"));
  assert.ok(!canTransition("cancelled", "proposed"));
});

test("matchParticipant khớp theo tên đầy đủ hoặc tên gọi", () => {
  assert.equal(matchParticipant("Lan", participants), "p-lan");
  assert.equal(matchParticipant("nguyễn lan", participants), "p-lan");
  assert.equal(matchParticipant("Khách", participants), null);
  assert.equal(matchParticipant(null, participants), null);
});

test("bộ demo: nhặt đúng 4 task trong ví dụ mẫu, bỏ qua ý kiến chung và việc đã xong", async () => {
  const input = sampleInput();
  const { accepted, rejected } = validateExtracted(await demoExtractor.extract(input), input);
  assert.equal(rejected.length, 0);
  assert.deepEqual(
    accepted.map((t) => [t.ownerParticipantId, t.dueAt?.toISOString() ?? null]),
    [
      ["p-lan", "2026-11-20T10:00:00.000Z"], // "trước thứ Sáu" → thứ Sáu 20/11, 17:00
      ["p-hung", "2026-11-23T10:00:00.000Z"], // "thứ Hai tuần sau" → 23/11
      [null, null], // "Ai đó cần kiểm tra…" → chưa có người nhận, chưa có hạn
      ["p-lan", "2026-11-17T10:00:00.000Z"], // "Để em … ngày mai" → người nói là Lan
    ],
  );
  assert.ok(accepted.every((t) => !/cải thiện quy trình|đã gửi hợp đồng/.test(t.title)));
});

function extracted(over: Partial<ExtractedTask>): ExtractedTask {
  return {
    title: "Gửi báo cáo doanh thu Q4",
    ownerParticipantId: "p-lan",
    ownerConfidence: 0.9,
    dueAt: "2026-11-20T17:00:00+07:00",
    dueInferred: true,
    dueSpokenAs: "trước thứ Sáu",
    effortMinutes: 60,
    segmentIdx: 2,
    quote: "Lan gửi giúp anh báo cáo doanh thu Q4 trước thứ Sáu nhé.",
    confidence: 0.9,
    ...over,
  };
}

test("validate: loại task có trích dẫn không nằm trong phiên âm", () => {
  const input = sampleInput();
  const { accepted, rejected } = validateExtracted(
    [extracted({}), extracted({ title: "Việc bịa", quote: "Câu này không ai nói trong cuộc họp cả." })],
    input,
  );
  assert.equal(accepted.length, 1);
  assert.deepEqual(rejected, [{ title: "Việc bịa", reason: "quote_not_in_transcript" }]);
});

test("validate: sửa số đoạn sai, bỏ người làm lạ, bỏ hạn trong quá khứ, làm tròn công sức", () => {
  const input = sampleInput();
  const { accepted } = validateExtracted(
    [
      extracted({
        segmentIdx: 7,
        quote: "  lan gửi giúp anh   BÁO CÁO doanh thu Q4 trước thứ Sáu nhé. ",
        ownerParticipantId: "khong-ton-tai",
        dueAt: "2026-11-01T17:00:00+07:00",
        effortMinutes: 50,
        confidence: 7,
      }),
    ],
    input,
  );
  const t = accepted[0]!;
  assert.equal(t.segmentIdx, 2);
  assert.equal(t.ownerParticipantId, null);
  assert.equal(t.ownerConfidence, 0);
  assert.equal(t.dueAt, null);
  assert.equal(t.dueInferred, false);
  assert.equal(t.effortMinutes, 60);
  assert.equal(t.confidence, 1);
});

test("validate: loại task trùng và task không có tiêu đề", () => {
  const input = sampleInput();
  const { accepted, rejected } = validateExtracted([extracted({}), extracted({}), extracted({ title: "   " })], input);
  assert.equal(accepted.length, 1);
  assert.deepEqual(rejected.map((r) => r.reason).sort(), ["duplicate", "empty_title"]);
});
