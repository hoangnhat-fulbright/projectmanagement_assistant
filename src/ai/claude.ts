import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { config } from "../config.ts";
import { fmtOffset, localParts, toZonedIso } from "../time.ts";
import type { ExtractedTask, ExtractInput, Extractor } from "./types.ts";

const WEEKDAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const Output = z.object({
  tasks: z.array(
    z.object({
      title: z.string().describe("Short imperative description of the work, in the language the meeting was held in."),
      owner_ref: z
        .string()
        .nullable()
        .describe('The ref of the participant who will do the work (e.g. "p2"), or null if the transcript does not settle who.'),
      owner_confidence: z.number().describe("0 to 1: how sure you are about the owner."),
      due_at: z
        .string()
        .nullable()
        .describe("Deadline as ISO 8601 with the meeting's UTC offset, or null if no deadline was stated or implied."),
      due_inferred: z.boolean().describe("True when due_at was resolved from a relative or vague phrase."),
      due_spoken_as: z.string().nullable().describe("The deadline phrase as spoken, verbatim, or null."),
      effort_minutes: z.number().describe("Rough effort: one of 15, 30, 60, 120, 240."),
      segment: z.number().describe("The number of the transcript segment that contains the quote."),
      quote: z.string().describe("The sentence that establishes this task, copied verbatim from that one segment."),
      confidence: z.number().describe("0 to 1: how sure you are this is a real commitment someone is expected to deliver."),
    }),
  ),
});

function systemPrompt(): string {
  return `You extract action items from a meeting transcript for a product that turns meeting talk into tracked commitments.

How your output is used: right after the meeting, each task you return is sent to its owner as a notification asking them to confirm it with one click. A task that was never really agreed, or that lands on the wrong person, costs the product that person's trust the first time it happens. So precision matters more than recall here. When you are unsure whether something is a real commitment, leave it out or give it a low confidence; when you are unsure who owns it, set owner_ref to null rather than guessing. The meeting organizer reviews low-confidence and ownerless tasks before anything is sent.

What counts as a task: someone commits to do something, or is asked to do something and it is not refused. An explicit acceptance is not required when a request is addressed to a specific person and nobody objects. A task with no clear owner still counts ("someone needs to check with legal"), with owner_ref null.

What does not count: general opinions or wishes ("we should improve the process"), work reported as already done, things conditional on an event that has not happened, and discussion with no agreed next step.

Evidence: every task needs a quote copied character for character from a single transcript segment, and the number of that segment. The quote is shown to the owner as proof the task came up, and the backend drops any task whose quote is not found in the transcript. Pick the sentence that best establishes the task; do not stitch text from several segments together or tidy up the wording. The owner reads the quote right next to the title, owner and deadline you return, so it has to agree with them: when the owner or the deadline was changed later in the meeting, quote the sentence that states the final version, not the earlier one it replaced.

Owner: resolve names and pronouns to the participant list. Meetings are often in Vietnamese, where people refer to themselves and each other by kinship terms ("em", "anh", "chị", "mình", "tôi", "sếp") and by given name, which is the last word of a Vietnamese full name. "Để em làm" spoken by Lan means Lan owns it. If two participants could match, or the person is not in the list, use null.

Deadline: resolve relative phrases against the meeting's date, weekday and timezone given in the input. When only a day is named, use ${config.endOfWorkdayHour}:00 local time on that day. "Trước thứ Sáu" / "by Friday" means the coming Friday. Set due_inferred to true whenever you resolved a relative or vague phrase, and copy the phrase into due_spoken_as. If no deadline was stated or clearly implied, use null; do not invent one.

Effort: a rough bucket for how long the work takes one person, 15 (send an email), 30, 60 (a short report), 120, or 240 (half a day or more).

Write each title in the language the meeting was held in, as a short imperative phrase that makes sense to someone who was not in the meeting, naming the thing concerned rather than saying "it". If the meeting contains no tasks, return an empty list.`;
}

function userMessage(input: ExtractInput): string {
  const start = localParts(input.startedAt, input.timezone);
  const refs = input.participants.map((p, i) => `p${i + 1}: ${p.name} <${p.email}>`).join("\n");
  const transcript = input.segments
    .map((s) => {
      const at = s.atSeconds !== null ? ` (${fmtOffset(s.atSeconds)})` : "";
      return `[${s.idx}]${at} ${s.speaker ?? "Unknown speaker"}: ${s.text}`;
    })
    .join("\n");
  return `<meeting>
Title: ${input.meetingTitle}
Started: ${toZonedIso(input.startedAt, input.timezone)} (${WEEKDAYS_EN[start.weekday]})
Timezone: ${input.timezone}
</meeting>

<participants>
${refs}
</participants>

<transcript>
${transcript}
</transcript>

Extract the action items from this meeting.`;
}

export function claudeExtractor(): Extractor {
  const client = new Anthropic();
  return {
    name: `claude:${config.anthropicModel}`,
    async extract(input: ExtractInput): Promise<ExtractedTask[]> {
      const response = await client.beta.messages.parse({
        model: config.anthropicModel,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        // Nếu bộ lọc an toàn từ chối yêu cầu, API tự chạy lại trên mô hình dự phòng.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: systemPrompt(),
        messages: [{ role: "user", content: userMessage(input) }],
        output_config: { effort: "high", format: betaZodOutputFormat(Output) },
      });

      if (response.stop_reason === "refusal") {
        throw new Error("Mô hình từ chối xử lý phiên âm này.");
      }
      if (response.stop_reason === "max_tokens") {
        throw new Error("Phiên âm quá dài: mô hình chưa trả lời xong trong giới hạn đầu ra.");
      }
      const parsed = response.parsed_output;
      if (!parsed) throw new Error("Mô hình trả về kết quả không đúng định dạng.");

      const idByRef = new Map(input.participants.map((p, i) => [`p${i + 1}`, p.id]));
      return parsed.tasks.map((t) => ({
        title: t.title,
        ownerParticipantId: t.owner_ref ? (idByRef.get(t.owner_ref.trim()) ?? null) : null,
        ownerConfidence: t.owner_confidence,
        dueAt: t.due_at,
        dueInferred: t.due_inferred,
        dueSpokenAs: t.due_spoken_as,
        effortMinutes: t.effort_minutes,
        segmentIdx: t.segment,
        quote: t.quote,
        confidence: t.confidence,
      }));
    },
  };
}

/** Thông báo lỗi dễ hiểu cho người chủ trì khi gọi Claude thất bại. */
export function describeExtractionError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "Khóa API của Claude không hợp lệ. Kiểm tra ANTHROPIC_API_KEY trong file .env.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Claude đang giới hạn tốc độ. Thử lại sau ít phút.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Không kết nối được tới Claude. Kiểm tra mạng rồi thử lại.";
  }
  if (error instanceof Anthropic.APIError) {
    return `Claude trả về lỗi ${error.status ?? ""}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
