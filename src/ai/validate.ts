import { normalizeText } from "../transcript.ts";
import { EFFORT_BUCKETS, type ExtractedTask, type ExtractInput } from "./types.ts";

export type ValidTask = {
  title: string;
  ownerParticipantId: string | null;
  ownerConfidence: number;
  dueAt: Date | null;
  dueInferred: boolean;
  dueSpokenAs: string | null;
  effortMinutes: number;
  segmentIdx: number;
  quote: string;
  confidence: number;
};

export type Rejection = { title: string; reason: "empty_title" | "quote_not_in_transcript" | "duplicate" };

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

function snapEffort(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 30;
  return EFFORT_BUCKETS.reduce((best, b) => (Math.abs(b - minutes) < Math.abs(best - minutes) ? b : best));
}

/**
 * Kiểm tra lại mọi thứ bộ trích xuất trả về trước khi tin dùng. Hàng rào chính
 * chống task bịa: câu trích dẫn phải thật sự có trong phiên âm, nếu không thì loại.
 */
export function validateExtracted(
  tasks: ExtractedTask[],
  input: ExtractInput,
): { accepted: ValidTask[]; rejected: Rejection[] } {
  const participantIds = new Set(input.participants.map((p) => p.id));
  const normalized = input.segments.map((s) => normalizeText(s.text));
  const accepted: ValidTask[] = [];
  const rejected: Rejection[] = [];
  const seen = new Set<string>();

  for (const t of tasks) {
    const title = (t.title ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!title) {
      rejected.push({ title: "", reason: "empty_title" });
      continue;
    }

    // Câu trích dẫn phải nằm trong đoạn được chỉ ra; nếu AI chỉ nhầm đoạn thì tìm ở các đoạn khác.
    const quote = (t.quote ?? "").replace(/\s+/g, " ").trim();
    const needle = normalizeText(quote);
    let segmentIdx = -1;
    if (needle.length >= 8) {
      if (normalized[t.segmentIdx]?.includes(needle)) segmentIdx = t.segmentIdx;
      else segmentIdx = normalized.findIndex((s) => s.includes(needle));
    }
    if (segmentIdx < 0) {
      rejected.push({ title, reason: "quote_not_in_transcript" });
      continue;
    }

    const ownerParticipantId =
      t.ownerParticipantId && participantIds.has(t.ownerParticipantId) ? t.ownerParticipantId : null;

    const key = `${ownerParticipantId ?? "-"}|${normalizeText(title)}`;
    if (seen.has(key)) {
      rejected.push({ title, reason: "duplicate" });
      continue;
    }
    seen.add(key);

    // Hạn sai định dạng hoặc nằm trước cuộc họp thì bỏ, để người nhận tự chọn.
    let dueAt: Date | null = null;
    if (t.dueAt) {
      const parsed = new Date(t.dueAt);
      if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > input.startedAt.getTime()) dueAt = parsed;
    }

    accepted.push({
      title,
      ownerParticipantId,
      ownerConfidence: ownerParticipantId ? clamp01(t.ownerConfidence) : 0,
      dueAt,
      dueInferred: dueAt ? Boolean(t.dueInferred) : false,
      dueSpokenAs: t.dueSpokenAs?.trim() || null,
      effortMinutes: snapEffort(t.effortMinutes),
      segmentIdx,
      quote,
      confidence: clamp01(t.confidence),
    });
  }
  return { accepted, rejected };
}
