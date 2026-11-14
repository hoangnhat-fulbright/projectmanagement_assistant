import type { Segment } from "../transcript.ts";

export type ExtractParticipant = { id: string; name: string; email: string };

export type ExtractInput = {
  meetingTitle: string;
  startedAt: Date;
  timezone: string;
  participants: ExtractParticipant[];
  segments: Segment[];
};

/** Một task do bộ trích xuất đề xuất, CHƯA được kiểm tra. Xem validate.ts. */
export type ExtractedTask = {
  title: string;
  ownerParticipantId: string | null;
  ownerConfidence: number;
  /** ISO 8601 kèm độ lệch múi giờ, hoặc null nếu không ai nêu hạn. */
  dueAt: string | null;
  /** true nếu hạn được suy ra từ cách nói tương đối ("trước thứ Sáu"). */
  dueInferred: boolean;
  dueSpokenAs: string | null;
  effortMinutes: number;
  /** Đoạn phiên âm chứa câu làm bằng chứng. */
  segmentIdx: number;
  /** Câu nguyên văn trong đoạn đó. */
  quote: string;
  confidence: number;
};

export interface Extractor {
  readonly name: string;
  extract(input: ExtractInput): Promise<ExtractedTask[]>;
}

export const EFFORT_BUCKETS = [15, 30, 60, 120, 240] as const;
