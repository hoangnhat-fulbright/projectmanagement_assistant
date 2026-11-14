import assert from "node:assert/strict";
import { test } from "node:test";
import { demoExtractor } from "../src/ai/demo.ts";
import type { Extractor } from "../src/ai/types.ts";
import { createApp } from "../src/app.ts";
import { openDb, type Db } from "../src/db.ts";
import { outboxMailer, type Mailer } from "../src/mail.ts";
import { SAMPLE } from "../src/sample.ts";
import { runSweep } from "../src/sweeper.ts";

const HOUR = 3_600_000;
// Thứ Hai 16/11/2026, 10:00 giờ Việt Nam
const START = new Date("2026-11-16T03:00:00Z");

type TaskRec = {
  id: string;
  title: string;
  status: string;
  owner: string | null;
  due_at: Date | null;
  due_is_inferred: boolean;
  sent_at: Date | null;
  reminder_sent_at: Date | null;
};

async function setup(opts: { extractor?: Extractor; mailer?: Mailer } = {}) {
  const db = await openDb();
  const clock = { now: new Date(START) };
  const mailer = opts.mailer ?? outboxMailer;
  const app = createApp({ db, mailer, extractor: opts.extractor ?? demoExtractor, now: () => clock.now }, { awaitProcessing: true });

  const post = (path: string, fields: Record<string, string> = {}) =>
    app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "http://localhost" },
      body: new URLSearchParams(fields).toString(),
    });

  async function createMeeting(over: Record<string, string> = {}): Promise<string> {
    const res = await post("/meetings", {
      title: SAMPLE.title,
      started_at: "2026-11-16T10:00",
      participants: SAMPLE.participants,
      transcript: SAMPLE.transcript,
      auto_send: "on",
      ...over,
    });
    assert.equal(res.status, 303, await res.text());
    return res.headers.get("location")!.split("/").pop()!;
  }

  const tasks = (meetingId: string) =>
    db.query<TaskRec>(
      `SELECT t.id, t.title, t.status, p.display_name AS owner, t.due_at, t.due_is_inferred, t.sent_at, t.reminder_sent_at
         FROM tasks t LEFT JOIN participants p ON p.id = t.owner_participant_id
        WHERE t.meeting_id = $1 ORDER BY t.position, t.id`,
      [meetingId],
    );

  /** Email mới nhất gửi cho một người, kèm các liên kết theo từng task (theo thứ tự trong email). */
  async function latestEmail(meetingId: string, email: string) {
    const row = await db.one<{ subject: string; body_text: string }>(
      `SELECT n.subject, n.body_text FROM notifications n JOIN participants p ON p.id = n.recipient_participant_id
        WHERE n.meeting_id = $1 AND p.email = $2 ORDER BY n.sent_at DESC, n.id DESC LIMIT 1`,
      [meetingId, email],
    );
    assert.ok(row, `chưa có email nào gửi cho ${email}`);
    const paths = (label: string) =>
      [...row.body_text.matchAll(new RegExp(`${label}: http://localhost:\\d+(/a/\\S+)`, "g"))].map((m) => m[1]!);
    return {
      subject: row.subject,
      text: row.body_text,
      confirm: paths("Xác nhận"),
      amend: paths("Sửa"),
      decline: paths("Không phải của tôi"),
      confirmAll: paths("Xác nhận tất cả")[0] ?? null,
    };
  }

  const events = (taskId: string) =>
    db.query<{ type: string; channel: string }>(`SELECT type, channel FROM task_events WHERE task_id = $1 ORDER BY id`, [taskId]);

  return { db, app, clock, post, createMeeting, tasks, latestEmail, events };
}

const emailCount = async (db: Db) => (await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM notifications`))!.n;

test("tạo cuộc họp: trích xuất task, tự gửi cho task đủ tin cậy, giữ lại task chưa có người nhận", async () => {
  const s = await setup();
  const meetingId = await s.createMeeting();
  const list = await s.tasks(meetingId);

  assert.deepEqual(
    list.map((t) => [t.owner, t.status, t.sent_at !== null]),
    [
      ["Nguyễn Lan", "proposed", true],
      ["Lê Hùng", "proposed", true],
      [null, "proposed", false],
      ["Nguyễn Lan", "proposed", true],
    ],
  );
  // Mỗi người MỘT email gom mọi task của họ: Lan (2 task) và Hùng (1 task).
  assert.equal(await emailCount(s.db), 2);
  const lan = await s.latestEmail(meetingId, "lan@example.com");
  assert.equal(lan.subject, 'Xác nhận 2 task từ buổi "Họp nhóm Sales"');
  assert.equal(lan.confirm.length, 2);
  assert.ok(lan.confirmAll, "người có từ 2 task trở lên có nút Xác nhận tất cả");
  const hung = await s.latestEmail(meetingId, "hung@example.com");
  assert.equal(hung.confirm.length, 1);
  assert.equal(hung.confirmAll, null);

  const page = await (await s.app.request(`/m/${meetingId}`)).text();
  assert.match(page, /Cần bạn xử lý \(1\)/);
  assert.match(page, /Đang chờ xác nhận \(3\)/);
  assert.match(page, /chưa có người nhận/);
});

test("xác nhận một cú bấm: GET không làm gì, POST cam kết, bấm lại vẫn an toàn", async () => {
  const s = await setup();
  const meetingId = await s.createMeeting();
  const lan = await s.latestEmail(meetingId, "lan@example.com");
  const link = lan.confirm[0]!;

  // Mở liên kết (như bộ quét email vẫn làm) không được xác nhận thay người nhận.
  const view = await s.app.request(link);
  assert.equal(view.status, 200);
  assert.match(await view.text(), /Việc này của bạn chứ\?/);
  assert.equal((await s.tasks(meetingId))[0]!.status, "proposed");

  const done = await s.post(link);
  assert.equal(done.status, 200);
  assert.match(await done.text(), /Đã xác nhận/);
  const [task] = await s.tasks(meetingId);
  assert.equal(task!.status, "committed");
  assert.equal(task!.due_is_inferred, false, "người làm xác nhận thì hạn không còn là AI đoán");
  assert.deepEqual(await s.events(task!.id), [
    { type: "proposed", channel: "system" },
    { type: "sent", channel: "system" },
    { type: "confirmed", channel: "email_link" },
  ]);

  // Bấm lần nữa, hoặc mở lại: thấy trạng thái, không có sự kiện mới.
  assert.match(await (await s.post(link)).text(), /Bạn đã xác nhận task này/);
  assert.match(await (await s.app.request(link)).text(), /Bạn đã xác nhận task này/);
  assert.equal((await s.events(task!.id)).length, 3);

  // Liên kết "Không phải của tôi" của task đã cam kết không còn tác dụng.
  assert.match(await (await s.post(lan.decline[0]!)).text(), /Bạn đã xác nhận task này/);
  assert.equal((await s.tasks(meetingId))[0]!.status, "committed");
});

test("database chỉ lưu mã băm của token", async () => {
  const s = await setup();
  const meetingId = await s.createMeeting();
  const raw = (await s.latestEmail(meetingId, "hung@example.com")).confirm[0]!.split("/").pop()!;
  const hashes = await s.db.query<{ token_hash: string }>(`SELECT token_hash FROM action_tokens`);
  assert.ok(hashes.length > 0);
  assert.ok(hashes.every((h) => /^[0-9a-f]{64}$/.test(h.token_hash) && h.token_hash !== raw));
});

test("sửa rồi xác nhận: đổi nội dung và hạn", async () => {
  const s = await setup();
  const meetingId = await s.createMeeting();
  const hung = await s.latestEmail(meetingId, "hung@example.com");

  assert.match(await (await s.app.request(hung.amend[0]!)).text(), /Sửa rồi xác nhận/);
  const res = await s.post(hung.amend[0]!, { title: "Chuẩn bị slide Q4 cho ban giám đốc", due_at: "2026-11-24T09:00" });
  assert.match(await res.text(), /Đã xác nhận/);

  const task = (await s.tasks(meetingId))[1]!;
  assert.equal(task.status, "committed");
  assert.equal(task.title, "Chuẩn bị slide Q4 cho ban giám đốc");
  assert.equal(task.due_at?.toISOString(), "2026-11-24T02:00:00.000Z");
  assert.deepEqual((await s.events(task.id)).map((e) => e.type), ["proposed", "sent", "amended", "confirmed"]);

  const bad = await s.post((await s.latestEmail(meetingId, "lan@example.com")).amend[0]!, { title: "X", due_at: "2020-01-01T09:00" });
  assert.equal(bad.status, 400);
  assert.match(await bad.text(), /Hạn phải ở trong tương lai/);
});

test("không phải của tôi: chuyển cho người khác thì người đó nhận email, liên kết cũ hết tác dụng", async () => {
  const s = await setup();
  const meetingId = await s.createMeeting();
  const hung = await s.latestEmail(meetingId, "hung@example.com");
  const minh = (await s.db.one<{ id: string }>(`SELECT id FROM participants WHERE meeting_id = $1 AND email = 'minh@example.com'`, [meetingId]))!;

  const res = await s.post(hung.decline[0]!, { reassign_to: minh.id, note: "Anh Minh làm slide" });
  assert.match(await res.text(), /Đã chuyển task/);

  const task = (await s.tasks(meetingId))[1]!;
  assert.deepEqual([task.owner, task.status, task.sent_at !== null], ["Trần Minh", "proposed", true]);
  assert.deepEqual((await s.events(task.id)).map((e) => e.type), ["proposed", "sent", "declined", "reassigned", "sent"]);

  // Liên kết Xác nhận cũ của Hùng không xác nhận được task giờ đã là của Minh.
  assert.match(await (await s.post(hung.confirm[0]!)).text(), /đã chuyển cho người khác/);
  assert.equal((await s.tasks(meetingId))[1]!.status, "proposed");

  const minhMail = await s.latestEmail(meetingId, "minh@example.com");
  assert.match(await (await s.post(minhMail.confirm[0]!)).text(), /Đã xác nhận/);
  assert.equal((await s.tasks(meetingId))[1]!.status, "committed");
});

test("không phải của tôi, không chọn ai: task quay về người chủ trì kèm ghi chú", async () => {
  const s = await setup();
  const meetingId = await s.createMeeting();
  const hung = await s.latestEmail(meetingId, "hung@example.com");
  assert.match(await (await s.post(hung.decline[0]!, { note: "Em không phụ trách slide" })).text(), /Đã ghi nhận/);

  assert.equal((await s.tasks(meetingId))[1]!.status, "declined");
  const page = await (await s.app.request(`/m/${meetingId}`)).text();
  assert.match(page, /Lê Hùng báo đây không phải việc của họ/);
  assert.match(page, /Em không phụ trách slide/);
});

test("xác nhận tất cả: một cú bấm cho mọi task của một người", async () => {
  const s = await setup();
  const meetingId = await s.createMeeting();
  const lan = await s.latestEmail(meetingId, "lan@example.com");

  assert.match(await (await s.app.request(lan.confirmAll!)).text(), /Xác nhận 2 task/);
  assert.match(await (await s.post(lan.confirmAll!)).text(), /Đã xác nhận 2 task/);
  const list = await s.tasks(meetingId);
  assert.deepEqual(list.filter((t) => t.owner === "Nguyễn Lan").map((t) => t.status), ["committed", "committed"]);
  assert.match(await (await s.app.request(lan.confirmAll!)).text(), /Không còn task nào chờ bạn/);
});

test("người chủ trì gán task chưa có người nhận; task chưa có hạn buộc chọn hạn khi xác nhận", async () => {
  const s = await setup();
  const meetingId = await s.createMeeting();
  const orphan = (await s.tasks(meetingId))[2]!;
  const minh = (await s.db.one<{ id: string }>(`SELECT id FROM participants WHERE meeting_id = $1 AND email = 'minh@example.com'`, [meetingId]))!;

  const res = await s.post(`/t/${orphan.id}/assign`, { owner_id: minh.id, title: orphan.title, due_at: "" });
  assert.equal(res.status, 303);
  assert.match(res.headers.get("location")!, /msg=sent/);

  const link = (await s.latestEmail(meetingId, "minh@example.com")).confirm[0]!;
  assert.match(await (await s.app.request(link)).text(), /Chưa ai nêu hạn/);
  const noDue = await s.post(link);
  assert.equal(noDue.status, 400);
  assert.equal((await s.tasks(meetingId))[2]!.status, "proposed");

  assert.match(await (await s.post(link, { due_at: "2026-11-19T12:00" })).text(), /Đã xác nhận/);
  const task = (await s.tasks(meetingId))[2]!;
  assert.deepEqual([task.status, task.owner, task.due_at?.toISOString()], ["committed", "Trần Minh", "2026-11-19T05:00:00.000Z"]);
});

test("bỏ chọn tự gửi: không email nào đi cho đến khi người chủ trì bấm gửi", async () => {
  const s = await setup();
  const meetingId = await s.createMeeting({ auto_send: "" });
  assert.equal(await emailCount(s.db), 0);
  assert.ok((await s.tasks(meetingId)).every((t) => t.sent_at === null));

  const res = await s.post(`/m/${meetingId}/send`);
  assert.match(res.headers.get("location")!, /msg=sent/);
  assert.equal(await emailCount(s.db), 2);
  // Task chưa có người nhận vẫn nằm lại.
  assert.deepEqual((await s.tasks(meetingId)).map((t) => t.sent_at !== null), [true, true, false, true]);
});

test("liên kết sai, liên kết hết hạn sau 7 ngày", async () => {
  const s = await setup();
  const meetingId = await s.createMeeting();
  const link = (await s.latestEmail(meetingId, "hung@example.com")).confirm[0]!;

  assert.equal((await s.app.request("/a/khong-phai-token-that-nao-ca-0000")).status, 404);
  assert.equal((await s.post(`${link.slice(0, -4)}AAAA`)).status, 404);

  s.clock.now = new Date(START.getTime() + 8 * 24 * HOUR);
  const expired = await s.post(link);
  assert.equal(expired.status, 410);
  assert.match(await expired.text(), /Liên kết đã hết hạn/);
  assert.equal((await s.tasks(meetingId))[1]!.status, "proposed");
});

test("việc định kỳ: nhắc đúng một lần sau 4 giờ, hết hạn sau 72 giờ", async () => {
  const s = await setup();
  const meetingId = await s.createMeeting();
  const lan = await s.latestEmail(meetingId, "lan@example.com");
  await s.post(lan.confirm[0]!); // task đã xác nhận thì không bị nhắc

  s.clock.now = new Date(START.getTime() + 3 * HOUR);
  assert.deepEqual(await runSweep(s.db, outboxMailer, s.clock.now), { expired: 0, reminded: 0 });

  s.clock.now = new Date(START.getTime() + 5 * HOUR);
  assert.deepEqual(await runSweep(s.db, outboxMailer, s.clock.now), { expired: 0, reminded: 2 });
  assert.match((await s.latestEmail(meetingId, "hung@example.com")).subject, /^Nhắc lại: /);

  s.clock.now = new Date(START.getTime() + 30 * HOUR);
  assert.deepEqual(await runSweep(s.db, outboxMailer, s.clock.now), { expired: 0, reminded: 0 }, "chỉ nhắc một lần");

  s.clock.now = new Date(START.getTime() + 73 * HOUR);
  assert.deepEqual(await runSweep(s.db, outboxMailer, s.clock.now), { expired: 2, reminded: 0 });
  assert.deepEqual(
    (await s.tasks(meetingId)).map((t) => t.status),
    ["committed", "expired", "proposed", "expired"], // task chưa gửi (chưa có người nhận) không hết hạn
  );

  // Liên kết của task đã hết hạn chờ thì không xác nhận được nữa.
  const hungLink = (await s.latestEmail(meetingId, "hung@example.com")).confirm[0]!;
  assert.match(await (await s.post(hungLink)).text(), /Yêu cầu xác nhận đã hết hạn/);
});

test("gửi email lỗi: task không bị đánh dấu đã gửi", async () => {
  const failing: Mailer = {
    outboxOnly: false,
    async send() {
      throw new Error("SMTP từ chối kết nối");
    },
  };
  const s = await setup({ mailer: failing });
  const meetingId = await s.createMeeting();
  assert.ok((await s.tasks(meetingId)).every((t) => t.sent_at === null));
  const rows = await s.db.query<{ error: string | null; body_html: string | null }>(`SELECT error, body_html FROM notifications`);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.error === "SMTP từ chối kết nối" && r.body_html === null), "gửi thật thì không lưu nội dung email");
});

test("trích xuất lỗi: cuộc họp chuyển failed và thử lại được", async () => {
  let calls = 0;
  const flaky: Extractor = {
    name: "flaky",
    async extract(input) {
      calls += 1;
      if (calls === 1) throw new Error("mất kết nối");
      return demoExtractor.extract(input);
    },
  };
  const s = await setup({ extractor: flaky });
  const meetingId = await s.createMeeting();
  assert.match(await (await s.app.request(`/m/${meetingId}`)).text(), /Trích xuất thất bại.*mất kết nối/s);
  assert.equal((await s.tasks(meetingId)).length, 0);

  assert.equal((await s.post(`/m/${meetingId}/retry`)).status, 303);
  assert.equal((await s.tasks(meetingId)).length, 4);
});

test("form tạo cuộc họp báo lỗi đầu vào; POST từ trang khác bị chặn", async () => {
  const s = await setup();
  const bad = await s.post("/meetings", { title: "X", started_at: "2026-11-16T10:00", participants: "không có email", transcript: "A: b" });
  assert.equal(bad.status, 400);
  assert.match(await bad.text(), /Không đọc được dòng/);

  const crossSite = await s.app.request("/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://evil.example" },
    body: "title=x",
  });
  assert.equal(crossSite.status, 403);
});
