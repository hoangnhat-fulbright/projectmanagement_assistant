try {
  process.loadEnvFile();
} catch {
  // Không có file .env: dùng biến môi trường và giá trị mặc định.
}

const env = process.env;
const port = Number(env.PORT ?? 3000);

/** Số không âm từ biến môi trường; thiếu hoặc sai thì dùng giá trị mặc định. */
function num(name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function pickExtractor(): "claude" | "demo" {
  if (env.EXTRACTOR === "claude" || env.EXTRACTOR === "demo") return env.EXTRACTOR;
  return env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN ? "claude" : "demo";
}

export const config = {
  port,
  baseUrl: (env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/, ""),
  timezone: env.APP_TIMEZONE || "Asia/Ho_Chi_Minh",
  dataDir: env.DATA_DIR || "./data/pg",
  appPassword: env.APP_PASSWORD || "",
  smtpUrl: env.SMTP_URL || "",
  mailFrom: env.MAIL_FROM || "Meeting Commitments <no-reply@localhost>",
  extractor: pickExtractor(),
  anthropicModel: env.ANTHROPIC_MODEL || "claude-opus-5-5",

  /** Task do AI trích xuất dưới ngưỡng này phải được người chủ trì duyệt trước khi gửi. */
  autoSendMinConfidence: 0.6,
  /**
   * Nhắc xác nhận một lần sau từng này giờ. Người có dữ liệu lịch thì được nhắc ở
   * khoảng trống đầu tiên sau mốc này; người chưa có thì nhắc đúng mốc này.
   */
  reminderAfterHours: 4,
  /** Task chờ xác nhận quá từng này giờ thì chuyển sang expired. */
  expireAfterHours: 72,
  /** Liên kết trong email hết hạn sau từng này ngày. */
  tokenTtlDays: 7,
  /** Giờ kết thúc ngày làm việc, dùng khi hạn chỉ nêu ngày ("trước thứ Sáu"). */
  endOfWorkdayHour: 17,

  /**
   * Tham số của Context-Aware Nudging (wiki/04-context-aware-nudging.md). Đều là phỏng
   * đoán ban đầu, cần chỉnh theo dữ liệu thật, nên đổi được bằng biến môi trường.
   */
  nudge: {
    /** Thời gian báo trước tối thiểu của nhắc chuẩn bị (phút). Việc lớn dùng 2 × công sức. */
    leadMinutes: num("NUDGE_LEAD_MINUTES", 120),
    /** Độ dài tối thiểu của một khoảng trống (phút). */
    minGapMinutes: num("NUDGE_MIN_GAP_MINUTES", 15),
    /** Khoảng trống bắt đầu sau khi cuộc họp trước kết thúc từng này phút. */
    bufferAfterMeetingMinutes: num("NUDGE_BUFFER_MINUTES", 5),
    /** Nhắc khoảng trống chỉ áp dụng khi còn dưới từng này giờ đến hạn. */
    gapWindowHours: num("NUDGE_GAP_WINDOW_HOURS", 48),
    /** Số lần nhắc tối đa mỗi người mỗi ngày. */
    maxPerDay: num("NUDGE_MAX_PER_DAY", 3),
    /** Khoảng cách tối thiểu giữa hai lần nhắc cùng một người (phút). */
    minSpacingMinutes: num("NUDGE_MIN_SPACING_MINUTES", 90),
    /** Không nhắc trong từng này phút sau khi người đó vừa xác nhận task. */
    quietAfterCommitMinutes: num("NUDGE_QUIET_AFTER_COMMIT_MINUTES", 30),
    /** Giờ làm việc mặc định (phút từ 00:00) cho người chưa có dữ liệu lịch. */
    workStartMinute: 8 * 60 + 30,
    workEndMinute: 17 * 60 + 30,
    workDays: [1, 2, 3, 4, 5] as readonly number[],
    /** Bản sao lịch bận/rảnh giữ cho từng này ngày tới. */
    calendarHorizonDays: 14,
  },
};
