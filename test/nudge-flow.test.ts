import assert from "node:assert/strict";
import { test } from "node:test";
import { demoExtractor } from "../src/ai/demo.ts";
import { createApp } from "../src/app.ts";
import { sampleDayBlocks, staticCalendarSource, syncCalendar, type CalendarSnapshot } from "../src/calendar/source.ts";
import { openDb } from "../src/db.ts";
import { addBusyBlock } from "../src/domain/calendar.ts";
import { replanAll, replanPerson, sendDueNudges } from "../src/domain/nudges.ts";
import { outboxMailer, type Mailer } from "../src/mail.ts";
import type { WorkHours } from "../src/nudge/gaps.ts";
import { SAMPLE } from "../src/sample.ts";
import { runSweep } from "../src/sweeper.ts";
import { zonedTimeToUtc } from "../src/time.ts";

const TZ = "Asia/Ho_Chi_Minh";
const HOURS: WorkHours = { timezone: TZ, startMinute: 9 * 60, endMinute: 18 * 60, days: [1, 2, 3, 4, 5] };
/** Giờ Việt Nam trong tháng 11/2026: thứ Hai 16, thứ Sáu 20, thứ Hai 23. */
const at = (day: number, hhmm: string): Date => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return zonedTimeToUtc(2026, 11, day, h, m, TZ);
};
const START = at(16, "10:00");
const LAN = "lan@example.com";
const HUNG = "hung@example.com";
/** Lịch thứ Sáu 20/11 của Lan trong wiki/04-context-aware-nudging.md. */
const LAN_CALENDAR: CalendarSnapshot = { hours: HOURS, blocks: sampleDayBlocks(2026, 11, 20, TZ) };

type NudgeRec = { kind: string; status: string; at: string; reason: Record<string, unknown>; response: string | null };

async function setup(opts: { mailer?: Mailer } = {}) {
  const db = await openDb();
  const clock = { now: new Date(START) };
  const mailer = opts.mailer ?? outboxMailer;
  const app = createApp({ db, mailer, extractor: demoExtractor, now: () => clock.now }, { awaitProcessing: true });

  const post = (path: string, fields: Record<string, string> = {}) =>
    app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "http://localhost" },
      body: new URLSearchParams(fields).toString(),
    });
  const page = async (path: string) => (await app.request(path)).text();

  const res = await post("/meetings", {
    title: SAMPLE.title,
    started_at: "2026-11-16T10:00",
    participants: SAMPLE.participants,
    transcript: SAMPLE.transcript,
    auto_send: "on",
  });
  assert.equal(res.status, 303);
  const meetingId = res.headers.get("location")!.split("/").pop()!;

  const tasks = () =>
    db.query<{ id: string; title: string; status: string; owner: string | null; due_at: Date | null }>(
      `SELECT t.id, t.title, t.status, p.email AS owner, t.due_at FROM tasks t LEFT JOIN participants p ON p.id = t.owner_participant_id
        WHERE t.meeting_id = $1 ORDER BY t.position, t.id`,
      [meetingId],
    );

  /** Email mới nhất gửi cho một người, kèm liên kết của từng nút theo thứ tự task trong email. */
  async function latestEmail(email: string) {
    const row = await db.one<{ subject: string; body_text: string; kind: string }>(
      `SELECT n.subject, n.body_text, n.kind FROM notifications n JOIN participants p ON p.id = n.recipient_participant_id
        WHERE p.email = $1 ORDER BY n.sent_at DESC, n.id DESC LIMIT 1`,
      [email],
    );
    assert.ok(row, `chưa có email nào gửi cho ${email}`);
    const paths = (label: string) => [...row.body_text.matchAll(new RegExp(`${label}: http://localhost:\\d+(/a/\\S+)`, "g"))].map((m) => m[1]!);
    return {
      subject: row.subject,
      kind: row.kind,
      text: row.body_text,
      confirm: paths("Xác nhận"),
      amend: paths("Sửa"),
      confirmAll: paths("Xác nhận tất cả")[0] ?? null,
      done: paths("Xong rồi"),
      start: paths("Đang làm"),
      snooze: paths("Nhắc ở khoảng trống sau"),
      reschedule: paths("Dời hạn"),
    };
  }

  const emailCount = async (email: string, kind = "nudge") =>
    (await db.one<{ n: number }>(
      `SELECT count(*)::int AS n FROM notifications n JOIN participants p ON p.id = n.recipient_participant_id WHERE p.email = $1 AND n.kind = $2`,
      [email, kind],
    ))!.n;

  /** Lời nhắc của một task, giờ ghi theo giờ Việt Nam: "Fri 10:35". */
  async function nudges(taskId: string): Promise<NudgeRec[]> {
    const rows = await db.query<{ kind: string; status: string; scheduled_for: Date; reason: Record<string, unknown>; response: string | null }>(
      `SELECT kind, status, scheduled_for, reason, response FROM nudges WHERE task_id = $1 ORDER BY scheduled_for, kind`,
      [taskId],
    );
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    return rows.map((r) => ({ kind: r.kind, status: r.status, at: fmt.format(r.scheduled_for), reason: r.reason, response: r.response }));
  }
  const brief = async (taskId: string, status = "scheduled") =>
    (await nudges(taskId)).filter((n) => n.status === status).map((n) => `${n.kind} ${n.at}`);

  const events = async (taskId: string) =>
    (await db.query<{ type: string }>(`SELECT type FROM task_events WHERE task_id = $1 ORDER BY id`, [taskId])).map((e) => e.type);

  const tick = (when: Date) => {
    clock.now = when;
    return sendDueNudges(db, mailer, when);
  };

  /** Lan có dữ liệu lịch (qua nguồn giả lập), xác nhận task báo cáo Q4, và task đó cần cho Weekly Sales 15:00 thứ Sáu. */
  async function lanCommitsQ4() {
    assert.equal(await syncCalendar(db, staticCalendarSource({ [LAN]: LAN_CALENDAR }), LAN, clock.now), true);
    const mail = await latestEmail(LAN);
    assert.match(await (await post(mail.confirm[0]!)).text(), /Đã xác nhận/);
    const [task, , , other] = await tasks();
    assert.ok(task && other);
    // Task còn lại của Lan (chờ xác nhận) không thuộc ví dụ: người chủ trì bỏ nó đi.
    await post(`/t/${other.id}/cancel`);
    const saved = await post(`/t/${task.id}/nudge-context`, {
      related_meeting_title: "Weekly Sales",
      related_meeting_at: "2026-11-20T15:00",
      effort_minutes: "45",
    });
    assert.equal(saved.status, 303);
    return task;
  }

  /** Thêm thẳng một task đã cam kết, để dựng tình huống nhiều task cho một người. */
  async function addCommitted(email: string, title: string, dueAt: Date, effort = 30) {
    const id = crypto.randomUUID();
    const owner = (await db.one<{ id: string }>(`SELECT id FROM participants WHERE meeting_id = $1 AND email = $2`, [meetingId, email]))!;
    await db.query(
      `INSERT INTO tasks (id, meeting_id, title, owner_participant_id, status, due_at, effort_minutes, source_quote, sent_at, committed_at, created_at, position)
       VALUES ($1, $2, $3, $4, 'committed', $5, $6, 'trích dẫn', $7, $7, $7, 99)`,
      [id, meetingId, title, owner.id, dueAt, effort, START],
    );
    return id;
  }

  return { db, app, clock, post, page, meetingId, tasks, latestEmail, emailCount, nudges, brief, events, tick, lanCommitsQ4, addCommitted };
}

test("ví dụ của Lan, trọn luồng: lập lịch → 10:35 nhắc chuẩn bị → 14:05 nhắc khoảng trống → bấm Xong rồi", async () => {
  const s = await setup();
  const task = await s.lanCommitsQ4();

  // Bản sao lịch chỉ có khung giờ và loại, không có tiêu đề sự kiện.
  const blocks = await s.db.query<Record<string, unknown>>(`SELECT * FROM busy_blocks WHERE person_email = $1`, [LAN]);
  assert.equal(blocks.length, 5);
  assert.deepEqual(Object.keys(blocks[0]!).sort(), ["calendar_event_id", "ends_at", "id", "kind", "person_email", "starts_at"]);

  // 13:00 = 15:00 − 2 tiếng rơi vào cuộc 1:1 → dịch sớm lên 10:35. Nhắc khoảng trống ở 14:05.
  assert.deepEqual(await s.brief(task.id), ["prep Fri 10:35", "gap Fri 14:05"]);
  const [prep] = await s.nudges(task.id);
  assert.equal(prep!.reason.shifted, true);
  assert.equal(prep!.reason.ideal_at, at(20, "13:00").toISOString());

  // Người chủ trì thấy có lời nhắc đang chờ, nhưng không thấy giờ nhắc (nó để lộ lịch của Lan).
  const hostPage = await s.page(`/m/${s.meetingId}`);
  assert.match(hostPage, /2 lời nhắc đang chờ gửi/);
  assert.doesNotMatch(hostPage, /10:35|14:05/);
  // Trang lịch của chính Lan giải thích vì sao chọn giờ đó.
  const lanPage = await s.page(`/calendar/${encodeURIComponent(LAN)}`);
  assert.match(lanPage, /Thứ Sáu 20\/11, 10:35/);
  assert.match(lanPage, /lúc đó bận nên dịch sớm lên đầu khoảng trống 10:35–11:00 \(25 phút\)/);

  assert.deepEqual(await s.tick(at(20, "10:34")), { emails: 0, nudges: 0, skipped: 0, failed: 0 });
  assert.deepEqual(await s.tick(at(20, "10:35")), { emails: 1, nudges: 1, skipped: 0, failed: 0 });
  const first = await s.latestEmail(LAN);
  assert.equal(first.subject, `Nhắc việc: ${task.title}`);
  assert.match(first.text, /Weekly Sales bắt đầu lúc 15:00 hôm nay\. Bạn đã nhận việc này trước buổi đó\./);
  assert.match(first.text, /Bạn có 25 phút bây giờ và 55 phút lúc 14:05 để làm việc này \(ước tính 45 phút\)\./);
  assert.deepEqual([first.done.length, first.start.length, first.snooze.length, first.reschedule.length], [1, 1, 1, 1]);
  // Chạy lại ngay sau đó không gửi lần hai.
  assert.equal((await s.tick(at(20, "10:36"))).emails, 0);

  // Mở liên kết (GET) không đánh dấu xong.
  assert.match(await s.page(first.done[0]!), /Việc này xong rồi chứ\?/);
  assert.equal((await s.tasks())[0]!.status, "committed");

  // Đến 14:05 task vẫn chưa bắt đầu → nhắc khoảng trống.
  assert.equal((await s.tick(at(20, "14:00"))).emails, 0);
  assert.deepEqual(await s.tick(at(20, "14:05")), { emails: 1, nudges: 1, skipped: 0, failed: 0 });
  const second = await s.latestEmail(LAN);
  assert.match(second.text, /Bạn trống đến 15:00 \(55 phút\)\. Việc này ước tính 45 phút, đủ để làm xong ngay\./);

  // Bấm "Xong rồi".
  s.clock.now = at(20, "14:50");
  assert.match(await (await s.post(second.done[0]!)).text(), /Đã ghi nhận là xong/);
  assert.equal((await s.tasks())[0]!.status, "done");
  assert.deepEqual((await s.events(task.id)).slice(-4), ["nudge_context_changed", "nudged", "nudged", "completed"]);
  assert.deepEqual((await s.nudges(task.id)).map((n) => [n.kind, n.status, n.response]), [
    ["prep", "sent", "done"],
    ["gap", "sent", "done"],
  ]);
  // Bấm lại, hoặc bấm nút của email trước: chỉ thấy trạng thái.
  assert.match(await (await s.post(second.done[0]!)).text(), /Việc này đã xong/);
  assert.match(await (await s.post(first.start[0]!)).text(), /Việc này đã xong/);
  assert.equal((await s.tick(at(20, "16:05"))).emails, 0);
  assert.equal(await s.emailCount(LAN), 2);
});

test("Đang làm: hủy nhắc khoảng trống còn lại", async () => {
  const s = await setup();
  const task = await s.lanCommitsQ4();
  await s.tick(at(20, "10:35"));
  const mail = await s.latestEmail(LAN);

  s.clock.now = at(20, "10:40");
  assert.match(await s.page(mail.start[0]!), /Bạn đang làm việc này\?/);
  assert.match(await (await s.post(mail.start[0]!)).text(), /Đã ghi nhận bạn đang làm/);
  assert.equal((await s.tasks())[0]!.status, "in_progress");
  assert.deepEqual(await s.brief(task.id), []);
  assert.deepEqual((await s.nudges(task.id)).map((n) => [n.kind, n.status, n.response]), [
    ["prep", "sent", "started"],
    ["gap", "cancelled", null],
  ]);
  assert.equal((await s.tick(at(20, "14:05"))).emails, 0);
  // Nút hoãn của email cũ không còn tác dụng với task đang làm.
  assert.match(await (await s.post(mail.snooze[0]!)).text(), /Bạn đang làm việc này/);
});

test("Nhắc ở khoảng trống sau: dời sang khoảng kế tiếp; hoãn hai lần thì hỏi dời hạn thay vì nhắc tiếp", async () => {
  const s = await setup();
  const task = await s.lanCommitsQ4();
  await s.tick(at(20, "10:35"));
  const first = await s.latestEmail(LAN);

  // Hoãn lần 1, giữa khoảng trống 10:35–11:00 → khoảng kế tiếp là 14:05.
  s.clock.now = at(20, "10:40");
  const snoozed = await (await s.post(first.snooze[0]!)).text();
  assert.match(snoozed, /Đã hoãn/);
  assert.match(snoozed, /Thứ Sáu 20\/11, 14:05/);
  assert.deepEqual(await s.brief(task.id), ["gap Fri 14:05"]);
  assert.match(await (await s.post(first.snooze[0]!)).text(), /Bạn đã hoãn lời nhắc này/, "liên kết hoãn chỉ dùng một lần");

  // Hoãn lần 2 ở 14:05 → không nhắc tiếp, hỏi dời hạn.
  assert.equal((await s.tick(at(20, "14:05"))).emails, 1);
  const second = await s.latestEmail(LAN);
  s.clock.now = at(20, "14:10");
  const asked = await (await s.post(second.snooze[0]!)).text();
  assert.match(asked, /Bạn đã hoãn việc này hai lần/);
  assert.deepEqual(await s.brief(task.id), []);
  const form = /<form method="post" action="(\/a\/[^"]+)"/.exec(asked)?.[1];
  assert.ok(form, "trang hỏi dời hạn có form trỏ tới liên kết dời hạn mới");

  // Dời hạn sang thứ Hai 23/11, 17:00.
  const bad = await s.post(form, { due_at: "2026-11-01T09:00" });
  assert.equal(bad.status, 400);
  assert.match(await (await s.post(form, { due_at: "2026-11-23T17:00" })).text(), /Đã dời hạn/);
  const row = (await s.tasks())[0]!;
  assert.equal(row.due_at?.toISOString(), at(23, "17:00").toISOString());
  assert.deepEqual((await s.events(task.id)).filter((e) => e !== "nudged").slice(-3), ["snoozed", "snoozed", "due_changed"]);
  assert.equal((await s.db.one<{ n: number }>(`SELECT nudge_snooze_count AS n FROM tasks WHERE id = $1`, [task.id]))!.n, 0);

  // Weekly Sales qua rồi thì mốc là hạn mới: nhắc chuẩn bị thứ Hai 15:00, nhắc khoảng trống thứ Hai 09:00.
  s.clock.now = at(20, "16:30");
  await replanAll(s.db, s.clock.now);
  assert.deepEqual(await s.brief(task.id), ["gap Mon 09:00", "prep Mon 15:00"]);
});

test("lịch thay đổi thì lập lịch lại; cuộc họp mới thêm ngay trước giờ gửi thì không gửi vào lúc bận", async () => {
  const s = await setup();
  const task = await s.lanCommitsQ4();

  // Thêm cuộc họp 10:30–11:00 thứ Sáu trên trang Lịch thử: khoảng trống trước 13:00 biến mất,
  // nhắc chuẩn bị lùi về khoảng trống cuối của ngày làm việc trước đó (thứ Năm trống cả ngày).
  s.clock.now = at(17, "09:00");
  const added = await s.post(`/calendar/${encodeURIComponent(LAN)}/blocks`, { starts_at: "2026-11-20T10:30", ends_at: "2026-11-20T11:00", kind: "meeting" });
  assert.equal(added.status, 303);
  assert.deepEqual(await s.brief(task.id), ["prep Thu 09:00", "gap Fri 14:05"]);

  // Sáng thứ Năm có cuộc họp vừa được thêm mà chưa kịp lập lịch lại (webhook đến trễ):
  // kiểm tra ngay trước khi gửi phát hiện Lan đang bận → không gửi, dời sang khoảng trống sau cuộc họp đó.
  await addBusyBlock(s.db, LAN, { start: at(19, "08:30"), end: at(19, "10:00"), kind: "meeting" });
  assert.deepEqual(await s.tick(at(19, "09:00")), { emails: 0, nudges: 0, skipped: 1, failed: 0 });
  assert.deepEqual(await s.brief(task.id), ["prep Thu 10:05", "gap Fri 14:05"]);
  assert.equal((await s.tick(at(19, "10:05"))).emails, 1);
  assert.match((await s.latestEmail(LAN)).text, /Weekly Sales bắt đầu lúc 15:00 ngày mai/);

  // Xóa dữ liệu lịch: chuyển sang nhắc theo hạn, không còn nhắc khoảng trống.
  await s.post(`/calendar/${encodeURIComponent(LAN)}/disconnect`);
  assert.deepEqual(await s.brief(task.id), ["deadline Fri 13:00"]);
});

test("đổi hạn và hủy task thì lời nhắc được tính lại hoặc hủy", async () => {
  const s = await setup();
  const task = await s.lanCommitsQ4();
  // Bỏ cuộc họp liên quan: mốc là hạn thứ Sáu 17:00 → T = 15:00 đang họp Weekly → 14:05; nhắc khoảng trống 16:05.
  await s.post(`/t/${task.id}/nudge-context`, { related_meeting_title: "", related_meeting_at: "", effort_minutes: "45" });
  assert.deepEqual(await s.brief(task.id), ["prep Fri 14:05", "gap Fri 16:05"]);
  // Việc 3 tiếng: báo trước 6 tiếng → T = 11:00 đang họp → 10:35. Thứ Sáu không khoảng trống nào đủ
  // 3 tiếng, nên nhắc khoảng trống chọn thứ Năm (trống cả ngày, làm xong được) thay vì khoảng sát hạn.
  await s.post(`/t/${task.id}/nudge-context`, { related_meeting_title: "", related_meeting_at: "", effort_minutes: "180" });
  assert.deepEqual(await s.brief(task.id), ["gap Thu 09:00", "prep Fri 10:35"]);

  await s.post(`/t/${task.id}/cancel`);
  assert.deepEqual(await s.brief(task.id), []);
  assert.ok((await s.nudges(task.id)).every((n) => n.status === "cancelled"));
  assert.equal((await s.tick(at(20, "10:35"))).emails, 0);
});

test("gom nhiều task vào một email; hai lần nhắc cách nhau ít nhất 90 phút", async () => {
  const s = await setup();
  await syncCalendar(s.db, staticCalendarSource({ [LAN]: LAN_CALENDAR }), LAN, s.clock.now);
  await s.db.query(`UPDATE tasks SET status = 'cancelled' WHERE status = 'proposed'`); // chỉ xét các việc dựng dưới đây
  // Hai việc cùng hạn thứ Sáu 17:00 → cùng được nhắc chuẩn bị lúc 14:05.
  const a = await s.addCommitted(LAN, "Việc A", at(20, "17:00"));
  const b = await s.addCommitted(LAN, "Việc B", at(20, "17:00"));
  // Việc C cần cho cuộc họp 16:30 → T = 14:30, đang trống → nhắc đúng 14:30, chỉ 25 phút sau email trước.
  const c = await s.addCommitted(LAN, "Việc C", at(20, "16:30"), 15);
  await replanPerson(s.db, LAN, s.clock.now);
  assert.deepEqual(await s.brief(a), ["prep Fri 14:05", "gap Fri 16:05"]);
  assert.deepEqual((await s.brief(c)).filter((n) => n.startsWith("prep")), ["prep Fri 14:30"]);

  // Test nhảy thẳng tới thứ Sáu: bỏ các nhắc khoảng trống của thứ Năm, bước gửi sẽ tính lại cho thứ Sáu.
  await s.db.query(`UPDATE nudges SET status = 'cancelled' WHERE kind = 'gap'`);
  assert.deepEqual(await s.tick(at(20, "14:05")), { emails: 1, nudges: 2, skipped: 0, failed: 0 });
  const mail = await s.latestEmail(LAN);
  assert.equal(mail.subject, "Nhắc việc: 2 việc bạn đã nhận");
  assert.equal(mail.done.length, 2);
  assert.match(mail.text, /1\. Việc A[\s\S]*2\. Việc B/);

  // 14:30: mới 25 phút sau lần nhắc trước → bỏ lời nhắc chuẩn bị của việc C, không dời muộn.
  assert.deepEqual(await s.tick(at(20, "14:30")), { emails: 0, nudges: 0, skipped: 1, failed: 0 });
  const prepC = (await s.nudges(c)).find((n) => n.kind === "prep")!;
  assert.deepEqual([prepC.status, prepC.reason.closed], ["skipped", "rate_limited"]);
  assert.equal(await s.emailCount(LAN), 1);

  // Nhắc khoảng trống thì được dời: không sớm hơn 15:35 (14:05 + 90 phút) → khoảng 16:05.
  assert.deepEqual(await s.brief(b), ["gap Fri 16:05"]);
  assert.deepEqual(await s.tick(at(20, "16:05")), { emails: 1, nudges: 3, skipped: 0, failed: 0 });
  assert.equal((await s.latestEmail(LAN)).subject, "Nhắc việc: 3 việc bạn đã nhận");
});

test("tối đa 3 lần nhắc mỗi người mỗi ngày; người chưa có lịch được nhắc theo hạn trong giờ làm việc", async () => {
  const s = await setup();
  // Hùng chưa có dữ liệu lịch. Bốn việc hạn 11:30, 13:30, 15:30, 17:30 thứ Sáu → nhắc theo hạn trước 2 tiếng.
  const ids: string[] = [];
  for (const due of ["11:30", "13:30", "15:30", "17:30"]) ids.push(await s.addCommitted(HUNG, `Việc hạn ${due}`, at(20, due)));
  // Việc hạn 09:00 thứ Hai: T = 07:00 ngoài giờ làm việc → dịch sớm về đầu ngày làm việc trước đó.
  const early = await s.addCommitted(HUNG, "Việc đầu tuần", at(23, "09:00"));
  await replanAll(s.db, s.clock.now);
  assert.deepEqual(await s.brief(ids[0]!), ["deadline Fri 09:30"]);
  assert.deepEqual(await s.brief(early), ["deadline Fri 08:30"]);

  // 08:30 thứ Sáu là lần nhắc đầu trong ngày. 09:30 chỉ cách 60 phút → bỏ.
  assert.equal((await s.tick(at(20, "08:30"))).emails, 1);
  const mail = await s.latestEmail(HUNG);
  assert.match(mail.text, /Hạn của việc này là Thứ Hai 23\/11, 09:00\./);
  assert.equal(mail.snooze.length, 0, "không có lịch thì không có nút Nhắc ở khoảng trống sau");
  assert.deepEqual([mail.done.length, mail.start.length, mail.reschedule.length], [1, 1, 1]);
  assert.deepEqual(await s.tick(at(20, "09:30")), { emails: 0, nudges: 0, skipped: 1, failed: 0 });
  // 11:30 và 13:30 là lần 2 và 3. 15:30 là lần thứ 4 trong ngày → bỏ.
  assert.equal((await s.tick(at(20, "11:30"))).emails, 1);
  assert.match((await s.latestEmail(HUNG)).text, /Hạn của việc này là 13:30 hôm nay\./);
  assert.equal((await s.tick(at(20, "13:30"))).emails, 1);
  assert.deepEqual(await s.tick(at(20, "15:30")), { emails: 0, nudges: 0, skipped: 1, failed: 0 });
  assert.equal(await s.emailCount(HUNG), 3);
  const last = (await s.nudges(ids[3]!))[0]!;
  assert.deepEqual([last.status, last.reason.closed], ["skipped", "rate_limited"]);
});

test("nhắc xác nhận: người có lịch được nhắc ở khoảng trống đầu tiên sau 4 giờ, người chưa có vẫn theo mốc 4 giờ", async () => {
  const s = await setup();
  // Lan bận 13:00–15:00 thứ Hai. Yêu cầu xác nhận gửi lúc 10:00 → sau 14:00, khoảng trống đầu tiên là 15:05.
  const monday: CalendarSnapshot = { hours: HOURS, blocks: [{ start: at(16, "13:00"), end: at(16, "15:00"), kind: "meeting" }] };
  await syncCalendar(s.db, staticCalendarSource({ [LAN]: monday }), LAN, s.clock.now);
  await replanAll(s.db, s.clock.now);
  const lanTasks = (await s.tasks()).filter((t) => t.owner === LAN);
  assert.deepEqual(await s.brief(lanTasks[0]!.id), ["confirm_reminder Mon 15:05"]);

  // 14:30: sweeper chỉ nhắc Hùng (chưa có lịch); Lan đang họp nên chưa bị nhắc.
  s.clock.now = at(16, "14:30");
  assert.deepEqual(await runSweep(s.db, outboxMailer, s.clock.now), { expired: 0, reminded: 1 });
  assert.equal((await s.tick(at(16, "14:30"))).emails, 0);
  assert.equal(await s.emailCount(LAN, "confirm_reminder"), 0);

  // 15:05: một email nhắc lại gom cả hai task của Lan.
  assert.deepEqual(await s.tick(at(16, "15:05")), { emails: 1, nudges: 2, skipped: 0, failed: 0 });
  const mail = await s.latestEmail(LAN);
  assert.equal(mail.subject, 'Nhắc lại: Xác nhận 2 task từ buổi "Họp nhóm Sales"');
  assert.equal(mail.confirm.length, 2);

  // Chỉ nhắc một lần, kể cả khi sweeper chạy lại.
  s.clock.now = at(17, "10:00");
  assert.deepEqual(await runSweep(s.db, outboxMailer, s.clock.now), { expired: 0, reminded: 0 });
  await replanAll(s.db, s.clock.now);
  assert.equal((await s.tick(at(17, "10:00"))).emails, 0);
  assert.equal(await s.emailCount(LAN, "confirm_reminder"), 1);

  // Xác nhận xong thì vào lịch nhắc việc: hạn thứ Sáu 17:00, Lan trống cả ngày → nhắc chuẩn bị 15:00.
  await s.post(mail.confirm[0]!);
  assert.deepEqual((await s.brief(lanTasks[0]!.id)).filter((n) => n.startsWith("prep")), ["prep Fri 15:00"]);
});

test("gửi email lỗi: lời nhắc vẫn chờ và được thử lại; hết khoảng trống thì thôi", async () => {
  let fail = true;
  const flaky: Mailer = {
    outboxOnly: false,
    async send() {
      if (fail) throw new Error("SMTP từ chối kết nối");
    },
  };
  const s = await setup({ mailer: flaky });
  await syncCalendar(s.db, staticCalendarSource({ [LAN]: LAN_CALENDAR }), LAN, s.clock.now);
  const id = await s.addCommitted(LAN, "Việc A", at(20, "15:00"), 45);
  await replanPerson(s.db, LAN, s.clock.now);
  assert.deepEqual(await s.brief(id), ["prep Fri 10:35", "gap Fri 14:05"]);

  assert.deepEqual(await s.tick(at(20, "10:35")), { emails: 0, nudges: 0, skipped: 0, failed: 1 });
  assert.deepEqual(await s.brief(id), ["prep Fri 10:35", "gap Fri 14:05"]);
  fail = false;
  assert.deepEqual(await s.tick(at(20, "10:36")), { emails: 1, nudges: 1, skipped: 0, failed: 0 });
  // Email lỗi không tính vào giới hạn, và gửi thật thì không lưu nội dung.
  const rows = await s.db.query<{ error: string | null; body_text: string | null }>(`SELECT error, body_text FROM notifications WHERE kind = 'nudge' ORDER BY sent_at`);
  assert.deepEqual(rows.map((r) => [r.error, r.body_text]), [["SMTP từ chối kết nối", null], [null, null]]);
});

test("trang Lịch thử: lưu giờ làm việc, điền lịch mẫu, báo lỗi đầu vào, chạy lượt nhắc", async () => {
  const s = await setup();
  const base = `/calendar/${encodeURIComponent(LAN)}`;
  assert.match(await s.page("/calendar"), /chưa có, nhắc theo hạn/);
  assert.match(await s.page(base), /chưa có dữ liệu lịch/);

  const bad = await s.post(`${base}/hours`, { work_start: "18:00", work_end: "09:00", timezone: TZ, day_1: "on" });
  assert.match(bad.headers.get("location")!, /msg=invalid/);
  const ok = await s.post(`${base}/hours`, { work_start: "09:00", work_end: "18:00", timezone: TZ, day_1: "on", day_2: "on", day_3: "on", day_4: "on", day_5: "on" });
  assert.match(ok.headers.get("location")!, /msg=saved/);
  await s.post(`${base}/sample`, { date: "2026-11-20" });
  const page = await s.page(base);
  assert.match(page, /Khung giờ bận sắp tới \(5\)/);
  assert.match(page, /Thứ Sáu 20\/11, 09:00/);
  assert.match(await s.page("/calendar"), /Nhập tay/);

  // Xóa một khung bận rồi chạy lượt nhắc từ nút trên trang.
  const blockId = /blocks\/([0-9a-f-]{36})\/delete/.exec(page)![1]!;
  await s.post(`${base}/blocks/${blockId}/delete`);
  assert.match(await s.page(base), /Khung giờ bận sắp tới \(4\)/);
  const ran = await s.post("/nudges/run");
  assert.match(ran.headers.get("location")!, /msg=ran&emails=0/);
});
