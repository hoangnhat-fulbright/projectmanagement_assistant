import { serve } from "@hono/node-server";
import { claudeExtractor } from "./ai/claude.ts";
import { demoExtractor } from "./ai/demo.ts";
import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { openDb } from "./db.ts";
import { replanAll, sendDueNudges } from "./domain/nudges.ts";
import { createMailer } from "./mail.ts";
import { runSweep } from "./sweeper.ts";

const db = await openDb(config.dataDir);
const mailer = createMailer();
const extractor = config.extractor === "claude" ? claudeExtractor() : demoExtractor;
const now = () => new Date();

// Cuộc họp đang xử lý dở khi tiến trình trước dừng thì không ai chạy tiếp: đánh dấu lỗi để bấm "Thử lại".
await db.query(
  `UPDATE meetings SET status = 'failed', error = 'Quá trình trích xuất bị gián đoạn do app khởi động lại.' WHERE status = 'processing'`,
);

const app = createApp({ db, mailer, extractor, now });
const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Đang chạy tại ${config.baseUrl} (cổng ${info.port})`);
  console.log(`  Trích xuất: ${extractor.name}${extractor.name === "demo" ? " — chưa có ANTHROPIC_API_KEY, chỉ để thử luồng" : ""}`);
  console.log(`  Email: ${mailer.outboxOnly ? `không gửi thật, xem tại ${config.baseUrl}/outbox` : "gửi qua SMTP"}`);
  if (!config.appPassword) console.log("  Chưa đặt APP_PASSWORD: các trang của người chủ trì đang mở cho bất kỳ ai truy cập được app.");
});

// Việc định kỳ, mỗi phút: hết hạn chờ và nhắc xác nhận kiểu cũ, tính lại lịch nhắc (dự phòng
// khi một lần lập lịch lại bị sót), rồi gửi các nudge đã đến giờ.
let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const at = now();
    const swept = await runSweep(db, mailer, at);
    if (swept.expired || swept.reminded) console.log(`[sweep] hết hạn ${swept.expired}, nhắc lại ${swept.reminded}`);
    await replanAll(db, at);
    const sent = await sendDueNudges(db, mailer, at);
    if (sent.emails || sent.skipped || sent.failed) {
      console.log(`[nudge] gửi ${sent.emails} email cho ${sent.nudges} task, bỏ qua ${sent.skipped}, lỗi ${sent.failed}`);
    }
  } catch (error) {
    console.error("[tick] lỗi:", error);
  } finally {
    ticking = false;
  }
}
const timer = setInterval(tick, 60_000);
void tick();

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  server.close();
  await db.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
