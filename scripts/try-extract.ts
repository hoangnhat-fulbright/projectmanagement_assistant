/**
 * Chạy bộ trích xuất Claude trên một phiên âm và in kết quả, không đụng tới database hay email.
 *
 *   npm run try:claude                                  → dùng ví dụ mẫu
 *   npm run try:claude -- phien-am.txt nguoi-tham-gia.txt [2026-11-10T14:00]
 *
 * File người tham gia: mỗi dòng "Tên <email>". Tham số thứ ba là thời điểm họp theo giờ địa phương
 * (mặc định: bây giờ). Mỗi lần chạy là một lần gọi API có tính phí.
 */
import { readFileSync } from "node:fs";
import { claudeExtractor, describeExtractionError } from "../src/ai/claude.ts";
import type { ExtractInput } from "../src/ai/types.ts";
import { validateExtracted } from "../src/ai/validate.ts";
import { parseParticipants } from "../src/app.ts";
import { config } from "../src/config.ts";
import { SAMPLE } from "../src/sample.ts";
import { fmtDateTime, fmtOffset, fromLocalInput } from "../src/time.ts";
import { parseTranscript } from "../src/transcript.ts";

const [transcriptPath, participantsPath, startedAtArg] = process.argv.slice(2);
const transcript = transcriptPath ? readFileSync(transcriptPath, "utf8") : SAMPLE.transcript;
const people = parseParticipants(participantsPath ? readFileSync(participantsPath, "utf8") : SAMPLE.participants);
if (people.error) {
  console.error(people.error);
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.error("Chưa có khóa Claude. Mở file .env, điền ANTHROPIC_API_KEY=... rồi chạy lại.");
  process.exit(1);
}

const startedAt = startedAtArg ? fromLocalInput(startedAtArg) : new Date();
if (!startedAt) {
  console.error(`Không đọc được thời điểm họp "${startedAtArg}". Dùng dạng 2026-11-10T14:00.`);
  process.exit(1);
}

const input: ExtractInput = {
  meetingTitle: transcriptPath ? "Cuộc họp" : SAMPLE.title,
  startedAt,
  timezone: config.timezone,
  participants: people.list.map((p, i) => ({ id: `p${i + 1}`, name: p.name, email: p.email })),
  segments: parseTranscript(transcript),
};
const nameById = new Map(input.participants.map((p) => [p.id, p.name]));

console.log(`Mô hình: ${config.anthropicModel} · ${input.segments.length} đoạn phiên âm · ${input.participants.length} người`);
console.log(`Thời điểm họp: ${fmtDateTime(input.startedAt)}\n`);

const started = Date.now();
try {
  const raw = await claudeExtractor().extract(input);
  const { accepted, rejected } = validateExtracted(raw, input);
  console.log(`Claude trả về ${raw.length} task trong ${((Date.now() - started) / 1000).toFixed(1)} giây. Giữ ${accepted.length}, loại ${rejected.length}.\n`);

  for (const [i, t] of accepted.entries()) {
    const seg = input.segments[t.segmentIdx]!;
    const needsReview =
      !t.ownerParticipantId || t.confidence < config.autoSendMinConfidence || t.ownerConfidence < config.autoSendMinConfidence;
    console.log(`${i + 1}. ${t.title}`);
    console.log(`   Người làm: ${t.ownerParticipantId ? nameById.get(t.ownerParticipantId) : "(chưa có)"} · tin cậy ${t.ownerConfidence.toFixed(2)}`);
    // Hạn Claude đưa ra có thể bị bước kiểm tra bỏ đi; in ra để phân biệt với "Claude không đưa hạn".
    const rawDue = raw.find((r) => r.quote.replace(/\s+/g, " ").trim() === t.quote)?.dueAt;
    const dropped = !t.dueAt && rawDue ? ` · Claude đưa "${rawDue}" nhưng bị bỏ vì không nằm sau thời điểm họp` : "";
    console.log(`   Hạn: ${t.dueAt ? fmtDateTime(t.dueAt) : "(chưa có)"}${t.dueInferred ? ` · suy ra từ "${t.dueSpokenAs ?? "?"}"` : ""}${dropped}`);
    console.log(`   Công sức: ${t.effortMinutes} phút · tin cậy task ${t.confidence.toFixed(2)} · ${needsReview ? "CHỜ DUYỆT" : "tự gửi"}`);
    console.log(`   Bằng chứng [${seg.atSeconds !== null ? fmtOffset(seg.atSeconds) : `đoạn ${seg.idx}`}] ${seg.speaker ?? "?"}: "${t.quote}"\n`);
  }
  if (rejected.length > 0) {
    console.log("Bị loại:");
    for (const r of rejected) console.log(`   - ${r.title || "(không có tiêu đề)"} — ${r.reason}`);
  }
} catch (error) {
  console.error(`Thất bại sau ${((Date.now() - started) / 1000).toFixed(1)} giây: ${describeExtractionError(error)}`);
  process.exit(1);
}
