import { config } from "../config.ts";
import { localDayPlus, localParts } from "../time.ts";
import { normalizeText } from "../transcript.ts";
import type { ExtractedTask, ExtractInput, ExtractParticipant, Extractor } from "./types.ts";

/**
 * Bộ trích xuất DEMO: vài luật từ khóa, chạy khi chưa cấu hình Claude. Mục đích
 * duy nhất là để thử trọn luồng trên máy. Không dùng cho cuộc họp thật.
 */

const word = (alternatives: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, "u");

const ACTION = word(
  "gửi|chuẩn bị|làm|kiểm tra|hoàn thành|viết|cập nhật|rà soát|liên hệ|tổng hợp|send|prepare|review|update|finish|write|check",
);
const COMMIT = word(
  "nhé|giúp|sẽ|để em|để tôi|để mình|để anh|để chị|trước thứ|trước ngày|ngày mai|hôm nay|cuối tuần|will|i'll|please|by",
);
const FIRST_PERSON = word("để em|để tôi|để mình|em sẽ|tôi sẽ|mình sẽ|i will|i'll|let me");

const WEEKDAY: [RegExp, number][] = [
  [word("thứ hai|monday"), 1],
  [word("thứ ba|tuesday"), 2],
  [word("thứ tư|wednesday"), 3],
  [word("thứ năm|thursday"), 4],
  [word("thứ sáu|friday|cuối tuần"), 5],
  [word("thứ bảy|saturday"), 6],
  [word("chủ nhật|sunday"), 0],
];

/** Tên gọi thường dùng trong lời nói: từ cuối của tên tiếng Việt ("Nguyễn Lan" → "lan"). */
const givenName = (name: string) => normalizeText(name).split(" ").at(-1) ?? "";

export function matchParticipant(name: string | null, participants: ExtractParticipant[]): string | null {
  if (!name) return null;
  const n = normalizeText(name);
  const exact = participants.filter((p) => normalizeText(p.name) === n);
  if (exact.length === 1) return exact[0]!.id;
  const given = participants.filter((p) => givenName(p.name) === givenName(n));
  return given.length === 1 ? given[0]!.id : null;
}

function parseDue(text: string, startedAt: Date, tz: string): { at: Date; spokenAs: string } | null {
  const today = localParts(startedAt, tz);
  const hour = config.endOfWorkdayHour;
  if (word("hôm nay|today").test(text)) return { at: localDayPlus(today, 0, hour, tz), spokenAs: "hôm nay" };
  if (word("ngày mai|tomorrow").test(text)) return { at: localDayPlus(today, 1, hour, tz), spokenAs: "ngày mai" };
  for (const [re, weekday] of WEEKDAY) {
    const m = re.exec(text);
    if (!m) continue;
    // Lần gần nhất sắp tới của thứ đó, không tính hôm nay.
    const days = ((weekday - today.weekday + 7) % 7 || 7) + (word("tuần sau|next week").test(text) && weekday > today.weekday ? 7 : 0);
    return { at: localDayPlus(today, days, hour, tz), spokenAs: m[0] };
  }
  return null;
}

export const demoExtractor: Extractor = {
  name: "demo",
  async extract(input: ExtractInput): Promise<ExtractedTask[]> {
    const tasks: ExtractedTask[] = [];
    for (const segment of input.segments) {
      for (const sentence of segment.text.split(/(?<=[.!?…])\s+/)) {
        const text = normalizeText(sentence);
        if (!ACTION.test(text) || !COMMIT.test(text)) continue;

        const speakerId = matchParticipant(segment.speaker, input.participants);
        let ownerId: string | null = null;
        if (FIRST_PERSON.test(text)) {
          ownerId = speakerId;
        } else {
          const mentioned = input.participants.filter(
            (p) => p.id !== speakerId && word(givenName(p.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(text),
          );
          if (mentioned.length === 1) ownerId = mentioned[0]!.id;
        }

        const due = parseDue(text, input.startedAt, input.timezone);
        tasks.push({
          title: sentence.trim().replace(/[.!?…]+$/, ""),
          ownerParticipantId: ownerId,
          ownerConfidence: ownerId ? 0.7 : 0,
          dueAt: due ? due.at.toISOString() : null,
          dueInferred: Boolean(due),
          dueSpokenAs: due?.spokenAs ?? null,
          effortMinutes: 30,
          segmentIdx: segment.idx,
          quote: sentence.trim(),
          confidence: ownerId ? 0.7 : 0.5,
        });
      }
    }
    return tasks;
  },
};
