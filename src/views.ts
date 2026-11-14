import { html } from "hono/html";
import { config } from "./config.ts";
import type { BusyBlockRow } from "./domain/calendar.ts";
import type { TaskRow, TaskStatus } from "./domain/tasks.ts";
import type { TokenAction } from "./domain/tokens.ts";
import type { BusyKind, WorkHours } from "./nudge/gaps.ts";
import { fmtDate, fmtDateTime, fmtOffset, fmtTime, minuteToClock, toLocalInput } from "./time.ts";

type H = ReturnType<typeof html>;

export type TaskView = TaskRow & {
  owner_name: string | null;
  speaker: string | null;
  at_seconds: number | null;
  decline_note?: string | null;
  declined_by?: string | null;
  nudges_scheduled?: number;
  nudges_sent?: number;
};
export type ParticipantView = { id: string; display_name: string; email: string; is_organizer: boolean };
export type MeetingView = {
  id: string;
  title: string;
  started_at: Date;
  status: "processing" | "ready" | "failed";
  error: string | null;
  extractor: string | null;
  next_occurrence_at?: Date | null;
};

function layout(title: string, body: H, opts: { narrow?: boolean; refresh?: number; nav?: boolean; outbox?: boolean } = {}): H {
  return html`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  ${opts.refresh ? html`<meta http-equiv="refresh" content="${opts.refresh}">` : ""}
  <title>${title}</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div class="wrap ${opts.narrow ? "narrow" : ""}">
    ${opts.nav === false
      ? ""
      : html`<header class="topbar">
          <a class="brand" href="/">Cam kết sau họp</a>
          <nav>
            <a href="/">Cuộc họp</a>
            <a href="/meetings/new">Cuộc họp mới</a>
            <a href="/calendar">Lịch thử</a>
            ${opts.outbox ? html`<a href="/outbox">Hộp thư thử</a>` : ""}
          </nav>
        </header>`}
    ${body}
  </div>
</body>
</html>`;
}

// ---------- Trang của người chủ trì ----------

export type MeetingListItem = MeetingView & { total: number; confirmed: number; pending: number };

export function homePage(meetings: MeetingListItem[], outbox: boolean): H {
  const body = html`
    <h1>Cuộc họp</h1>
    <p class="muted">Dán phiên âm một buổi họp để AI trích ra các task và gửi cho từng người xác nhận.</p>
    <p><a class="button primary" href="/meetings/new">Cuộc họp mới</a></p>
    ${meetings.length === 0
      ? html`<div class="card empty">Chưa có cuộc họp nào.</div>`
      : html`<div class="card scroll"><table class="list">
          <thead><tr><th>Cuộc họp</th><th>Ngày</th><th>Đã xác nhận</th><th>Đang chờ</th></tr></thead>
          <tbody>
            ${meetings.map(
              (m) => html`<tr>
                <td><a href="/m/${m.id}">${m.title}</a>${m.status === "failed" ? html` <span class="tag">lỗi</span>` : ""}${m.status === "processing" ? html` <span class="tag">đang xử lý</span>` : ""}</td>
                <td>${fmtDate(m.started_at)}</td>
                <td>${m.confirmed} / ${m.total}</td>
                <td>${m.pending}</td>
              </tr>`,
            )}
          </tbody>
        </table></div>`}`;
  return layout("Cuộc họp", body, { outbox });
}

export type NewMeetingValues = {
  title: string;
  started_at: string;
  next_occurrence_at: string;
  participants: string;
  transcript: string;
  auto_send: boolean;
};

export function newMeetingPage(values: NewMeetingValues, error: string | null, opts: { outbox: boolean; demo: boolean }): H {
  const body = html`
    <h1>Cuộc họp mới</h1>
    ${opts.demo
      ? html`<div class="banner warn">Đang chạy <b>chế độ demo</b> vì chưa có khóa Claude: task được trích bằng vài luật từ khóa đơn giản, chỉ để thử luồng. Đặt <code>ANTHROPIC_API_KEY</code> trong file <code>.env</code> để dùng cho cuộc họp thật. <a href="/meetings/new?sample=1">Điền ví dụ mẫu</a></div>`
      : html`<p class="small muted"><a href="/meetings/new?sample=1">Điền ví dụ mẫu</a></p>`}
    ${error ? html`<div class="banner danger" role="alert">${error}</div>` : ""}
    <form method="post" action="/meetings" class="card">
      <div class="row">
        <div class="field">
          <label for="title">Tên cuộc họp</label>
          <input type="text" id="title" name="title" required maxlength="200" value="${values.title}">
        </div>
        <div class="field">
          <label for="started_at">Thời điểm họp</label>
          <input type="datetime-local" id="started_at" name="started_at" required value="${values.started_at}">
        </div>
      </div>
      <div class="field">
        <label for="next_occurrence_at">Buổi họp kế tiếp của chuỗi này (không bắt buộc)</label>
        <input type="datetime-local" id="next_occurrence_at" name="next_occurrence_at" value="${values.next_occurrence_at}">
        <p class="hint">Dùng để nhắc chuẩn bị: người nhận task được nhắc trước buổi kế tiếp, vào lúc họ rảnh.</p>
      </div>
      <div class="field">
        <label for="participants">Người tham gia</label>
        <textarea id="participants" name="participants" required placeholder="Trần Minh &lt;minh@example.com&gt;">${values.participants}</textarea>
        <p class="hint">Mỗi dòng một người, dạng <code>Tên &lt;email&gt;</code>. Dòng đầu tiên là người chủ trì. Tên nên giống cách gọi trong phiên âm.</p>
      </div>
      <div class="field">
        <label for="transcript">Phiên âm</label>
        <textarea id="transcript" name="transcript" class="tall" required placeholder="[00:12] Lan: Để em gửi báo cáo trước thứ Sáu.">${values.transcript}</textarea>
        <p class="hint">Mỗi dòng một lượt nói, dạng <code>[mm:ss] Tên: nội dung</code>. Mốc thời gian không bắt buộc.</p>
      </div>
      <div class="field">
        <label class="check"><input type="checkbox" name="auto_send" ${values.auto_send ? "checked" : ""}>
          <span>Gửi yêu cầu xác nhận ngay khi trích xuất xong. Task AI không chắc vẫn chờ bạn duyệt. Bỏ chọn nếu bạn muốn xem hết trước khi gửi.</span></label>
      </div>
      <button class="primary" type="submit">Trích xuất task</button>
    </form>`;
  return layout("Cuộc họp mới", body, { outbox: opts.outbox });
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  proposed: "Chờ xác nhận",
  committed: "Đã cam kết",
  in_progress: "Đang làm",
  done: "Đã xong",
  declined: "Bị từ chối",
  expired: "Hết hạn chờ",
  cancelled: "Đã bỏ",
};
const STATUS_CLASS: Record<TaskStatus, string> = {
  proposed: "wait",
  committed: "ok",
  in_progress: "ok",
  done: "ok",
  declined: "danger",
  expired: "warn",
  cancelled: "",
};

function dueText(t: Pick<TaskRow, "due_at" | "due_is_inferred">): H {
  if (!t.due_at) return html`<span class="muted">chưa có</span>`;
  return html`${fmtDateTime(t.due_at)}${t.due_is_inferred ? html`<span class="tag">AI đoán</span>` : ""}`;
}

function quoteBlock(t: Pick<TaskView, "source_quote" | "speaker" | "at_seconds">): H {
  return html`<blockquote>${t.speaker ? `${t.speaker}: ` : ""}“${t.source_quote}”${t.at_seconds !== null ? ` (${fmtOffset(t.at_seconds)})` : ""}</blockquote>`;
}

function assignForm(t: TaskView, participants: ParticipantView[], submitLabel: string): H {
  return html`<form method="post" action="/t/${t.id}/assign">
    <div class="field">
      <label for="title-${t.id}">Việc cần làm</label>
      <input type="text" id="title-${t.id}" name="title" required maxlength="200" value="${t.title}">
    </div>
    <div class="row">
      <div class="field">
        <label for="owner-${t.id}">Người làm</label>
        <select id="owner-${t.id}" name="owner_id" required>
          <option value="">Chọn người làm</option>
          ${participants.map((p) => html`<option value="${p.id}" ${p.id === t.owner_participant_id ? "selected" : ""}>${p.display_name}</option>`)}
        </select>
      </div>
      <div class="field">
        <label for="due-${t.id}">Hạn</label>
        <input type="datetime-local" id="due-${t.id}" name="due_at" value="${t.due_at ? toLocalInput(t.due_at) : ""}">
      </div>
    </div>
    <button class="primary" type="submit">${submitLabel}</button>
  </form>`;
}

const EFFORT_CHOICES = [15, 30, 45, 60, 90, 120, 180, 240, 480];
const effortLabel = (m: number) => (m < 60 ? `${m} phút` : `${Math.floor(m / 60)} giờ${m % 60 ? ` ${m % 60} phút` : ""}`);

/** Dữ liệu dùng để chọn giờ nhắc. Thời điểm nhắc cụ thể không hiện ở đây: nó để lộ lịch của người làm. */
function nudgeContextForm(t: TaskView): H {
  const efforts = EFFORT_CHOICES.includes(t.effort_minutes) ? EFFORT_CHOICES : [...EFFORT_CHOICES, t.effort_minutes].sort((a, b) => a - b);
  const counts = [
    t.nudges_scheduled ? `${t.nudges_scheduled} lời nhắc đang chờ gửi` : "",
    t.nudges_sent ? `${t.nudges_sent} lời nhắc đã gửi` : "",
  ].filter(Boolean);
  return html`<details class="edit"><summary>Nhắc việc${counts.length ? ` · ${counts.join(", ")}` : ""}</summary>
    <p class="small muted">App tự chọn lúc nhắc theo lịch bận/rảnh của người làm, nên thời điểm nhắc không hiển thị ở đây.</p>
    <form method="post" action="/t/${t.id}/nudge-context">
      <div class="row">
        <div class="field">
          <label for="rel-title-${t.id}">Cuộc họp liên quan</label>
          <input type="text" id="rel-title-${t.id}" name="related_meeting_title" maxlength="200" placeholder="Weekly Sales" value="${t.related_meeting_title ?? ""}">
        </div>
        <div class="field">
          <label for="rel-at-${t.id}">Bắt đầu lúc</label>
          <input type="datetime-local" id="rel-at-${t.id}" name="related_meeting_at" value="${t.related_meeting_at ? toLocalInput(t.related_meeting_at) : ""}">
        </div>
      </div>
      <div class="field">
        <label for="effort-${t.id}">Công sức ước tính</label>
        <select id="effort-${t.id}" name="effort_minutes">
          ${efforts.map((m) => html`<option value="${m}" ${m === t.effort_minutes ? "selected" : ""}>${effortLabel(m)}</option>`)}
        </select>
        <p class="hint">Người làm được nhắc chuẩn bị trước cuộc họp liên quan 2 tiếng (hoặc 2 lần công sức nếu lớn hơn). Để trống thì nhắc theo hạn hoặc theo buổi kế tiếp của chuỗi họp.</p>
      </div>
      <button type="submit">Lưu</button>
    </form>
  </details>`;
}

const postButton = (action: string, label: string, cls = ""): H =>
  html`<form method="post" action="${action}"><button type="submit" class="${cls}">${label}</button></form>`;

function taskCard(t: TaskView, participants: ParticipantView[]): H {
  const unsent = t.status === "proposed" && !t.sent_at;
  const needsOrganizer = unsent || t.status === "declined" || t.status === "expired";
  const label = unsent ? "Chờ gửi" : STATUS_LABEL[t.status];
  const cls = unsent ? "warn" : STATUS_CLASS[t.status];
  return html`<article class="card">
    <div class="task-head"><h3>${t.title}</h3><span class="badge ${cls}">${label}</span></div>
    <div class="meta">
      <span><b>Người làm:</b> ${t.owner_name ?? html`<span class="muted">chưa có người nhận</span>`}</span>
      <span><b>Hạn:</b> ${dueText(t)}</span>
    </div>
    ${quoteBlock(t)}
    ${unsent && t.needs_review ? html`<p class="small" style="margin-top:8px"><span class="tag" style="margin-left:0">AI không chắc</span> Xem lại người làm và nội dung rồi mới gửi.</p>` : ""}
    ${t.status === "declined"
      ? html`<p class="small" style="margin-top:8px">${t.declined_by ?? "Người được gán"} báo đây không phải việc của họ${t.decline_note ? html`: “${t.decline_note}”` : "."}</p>`
      : ""}
    ${needsOrganizer
      ? html`<div style="margin-top:14px">${assignForm(t, participants, "Lưu và gửi yêu cầu xác nhận")}</div>
          <div class="actions">${postButton(`/t/${t.id}/cancel`, "Bỏ task này", "danger")}</div>`
      : ""}
    ${t.status === "proposed" && t.sent_at
      ? html`<p class="small muted" style="margin-top:8px">Đã gửi ${fmtDateTime(t.sent_at)}${t.reminder_sent_at ? `, đã nhắc lại ${fmtDateTime(t.reminder_sent_at)}` : ""}.</p>
          <div class="actions">${postButton(`/t/${t.id}/resend`, "Gửi lại")}${postButton(`/t/${t.id}/cancel`, "Bỏ task này", "danger")}</div>
          <details class="edit"><summary>Sửa hoặc đổi người làm</summary>${assignForm(t, participants, "Lưu và gửi lại")}</details>`
      : ""}
    ${t.status === "committed" || t.status === "in_progress"
      ? html`<p class="small muted" style="margin-top:8px">Xác nhận ${t.committed_at ? fmtDateTime(t.committed_at) : ""}.</p>
          <div class="actions">${postButton(`/t/${t.id}/done`, "Đánh dấu đã xong")}${postButton(`/t/${t.id}/cancel`, "Hủy task", "danger")}</div>
          ${nudgeContextForm(t)}`
      : ""}
  </article>`;
}

export function meetingPage(
  meeting: MeetingView,
  participants: ParticipantView[],
  tasks: TaskView[],
  opts: { outbox: boolean; notice: string | null },
): H {
  const title = meeting.title;
  const header = html`<p class="eyebrow">${fmtDateTime(meeting.started_at)} · ${participants.length} người tham gia${meeting.next_occurrence_at ? ` · buổi kế tiếp ${fmtDateTime(meeting.next_occurrence_at)}` : ""}</p><h1>${title}</h1>`;

  if (meeting.status === "processing") {
    return layout(title, html`${header}<div class="card empty">Đang trích xuất task từ phiên âm… Trang sẽ tự tải lại.</div>`, { refresh: 2, outbox: opts.outbox });
  }
  if (meeting.status === "failed") {
    const body = html`${header}
      <div class="banner danger" role="alert"><b>Trích xuất thất bại.</b> ${meeting.error ?? ""}</div>
      ${postButton(`/m/${meeting.id}/retry`, "Thử lại", "primary")}`;
    return layout(title, body, { outbox: opts.outbox });
  }

  const active = tasks.filter((t) => t.status !== "cancelled");
  const confirmed = active.filter((t) => ["committed", "in_progress", "done"].includes(t.status));
  const waiting = active.filter((t) => t.status === "proposed" && t.sent_at);
  const attention = active.filter((t) => (t.status === "proposed" && !t.sent_at) || t.status === "declined" || t.status === "expired");
  const cancelled = tasks.filter((t) => t.status === "cancelled");
  const sendable = attention.filter((t) => t.status === "proposed" && t.owner_participant_id);
  const section = (heading: string, list: TaskView[]) =>
    list.length ? html`<h2>${heading} (${list.length})</h2>${list.map((t) => taskCard(t, participants))}` : "";

  const body = html`${header}
    ${meeting.extractor === "demo" ? html`<div class="banner warn">Task ở đây do <b>bộ trích xuất demo</b> tạo ra (luật từ khóa đơn giản), không phải Claude.</div>` : ""}
    ${opts.notice ? html`<div class="banner ok" role="status">${opts.notice}</div>` : ""}
    <div class="stats">
      <div class="stat"><b>${confirmed.length} / ${active.length}</b><span>đã xác nhận</span></div>
      <div class="stat"><b>${waiting.length}</b><span>đang chờ xác nhận</span></div>
      <div class="stat"><b>${attention.length}</b><span>cần bạn xử lý</span></div>
    </div>
    ${tasks.length === 0 ? html`<div class="card empty">Không tìm thấy task nào trong phiên âm này.</div>` : ""}
    ${sendable.length
      ? html`<div class="actions" style="margin-top:16px">${postButton(`/m/${meeting.id}/send`, `Gửi ${sendable.length} task chưa gửi cho người làm`, "primary")}</div>`
      : ""}
    ${section("Cần bạn xử lý", attention)}
    ${section("Đang chờ xác nhận", waiting)}
    ${section("Đã cam kết", confirmed.filter((t) => t.status !== "done"))}
    ${section("Đã xong", confirmed.filter((t) => t.status === "done"))}
    ${section("Đã bỏ", cancelled)}`;
  return layout(title, body, { outbox: opts.outbox });
}

export type OutboxItem = { id: string; subject: string; sent_at: Date; kind: string; recipient: string; email: string; meeting_title: string };

export function outboxPage(items: OutboxItem[]): H {
  const body = html`
    <h1>Hộp thư thử</h1>
    <p class="muted">Chưa cấu hình SMTP nên email không được gửi đi. Mở từng email ở đây để bấm thử như người nhận.</p>
    ${items.length === 0
      ? html`<div class="card empty">Chưa có email nào.</div>`
      : html`<div class="card scroll"><table class="list">
          <thead><tr><th>Gửi lúc</th><th>Người nhận</th><th>Tiêu đề</th></tr></thead>
          <tbody>${items.map(
            (m) => html`<tr><td>${fmtDateTime(m.sent_at)}</td><td>${m.recipient}<br><span class="muted small">${m.email}</span></td><td><a href="/outbox/${m.id}">${m.subject}</a></td></tr>`,
          )}</tbody>
        </table></div>`}`;
  return layout("Hộp thư thử", body, { outbox: true });
}

// ---------- Trang công khai cho người nhận (mở từ liên kết trong email) ----------

export type ActionContext = {
  meeting: { title: string; started_at: Date };
  participant: { id: string; display_name: string; email: string };
};

function recipientShell(ctx: ActionContext | null, title: string, content: H): H {
  const body = html`
    ${ctx ? html`<p class="eyebrow">${ctx.meeting.title} · ${fmtDate(ctx.meeting.started_at)}</p>` : ""}
    ${content}
    <p class="small muted" style="margin-top:24px">${ctx ? `Trang này dành cho ${ctx.participant.display_name}. ` : ""}Task được AI trích từ bản phiên âm cuộc họp nên có thể sai.</p>`;
  return layout(title, body, { narrow: true, nav: false });
}

function recipientTaskCard(t: TaskView): H {
  return html`<div class="card">
    <h3>${t.title}</h3>
    <div class="meta"><span><b>Hạn:</b> ${dueText(t)}</span></div>
    ${quoteBlock(t)}
  </div>`;
}

const dueField = (name: string, value: Date | null, label: string): H => html`<div class="field">
    <label for="${name}">${label}</label>
    <input type="datetime-local" id="${name}" name="${name}" required value="${value ? toLocalInput(value) : ""}">
  </div>`;

export function messagePage(ctx: ActionContext | null, heading: string, message: string, opts: { ok?: boolean; task?: TaskView } = {}): H {
  return recipientShell(
    ctx,
    heading,
    html`${opts.ok ? html`<p class="done-mark" aria-hidden="true">✓</p>` : ""}
      <h1>${heading}</h1>
      <p>${message}</p>
      ${opts.task ? recipientTaskCard(opts.task) : ""}`,
  );
}

export function actionPage(
  ctx: ActionContext,
  action: TokenAction,
  tasks: TaskView[],
  others: ParticipantView[],
  error: string | null,
): H {
  const alert = error ? html`<div class="banner danger" role="alert">${error}</div>` : "";
  const task = tasks[0]!;

  if (action === "confirm") {
    return recipientShell(
      ctx,
      "Xác nhận task",
      html`<h1>Việc này của bạn chứ?</h1>${alert}${recipientTaskCard(task)}
        <form method="post">
          ${task.due_at ? "" : dueField("due_at", null, "Chưa ai nêu hạn. Bạn chọn hạn nhé")}
          <button class="primary big" type="submit">Xác nhận</button>
        </form>`,
    );
  }

  if (action === "amend") {
    return recipientShell(
      ctx,
      "Sửa task",
      html`<h1>Sửa rồi xác nhận</h1>${alert}
        <div class="card">${quoteBlock(task)}</div>
        <form method="post">
          <div class="field">
            <label for="title">Việc cần làm</label>
            <input type="text" id="title" name="title" required maxlength="200" value="${task.title}">
          </div>
          ${dueField("due_at", task.due_at, "Hạn")}
          <button class="primary big" type="submit">Lưu và xác nhận</button>
        </form>`,
    );
  }

  if (action === "done") {
    return recipientShell(
      ctx,
      "Xong rồi",
      html`<h1>Việc này xong rồi chứ?</h1>${alert}${recipientTaskCard(task)}
        <form method="post"><button class="primary big" type="submit">Xong rồi</button></form>`,
    );
  }

  if (action === "start") {
    return recipientShell(
      ctx,
      "Đang làm",
      html`<h1>Bạn đang làm việc này?</h1>${alert}${recipientTaskCard(task)}
        <p class="small muted">Chúng tôi sẽ không nhắc việc này ở các khoảng trống nữa.</p>
        <form method="post"><button class="primary big" type="submit">Đang làm</button></form>`,
    );
  }

  if (action === "snooze") {
    return recipientShell(
      ctx,
      "Nhắc ở khoảng trống sau",
      html`<h1>Nhắc lại ở khoảng trống sau?</h1>${alert}${recipientTaskCard(task)}
        <p class="small muted">Lời nhắc kế tiếp sẽ đến vào đầu khoảng trống kế tiếp trong lịch của bạn, trước hạn.</p>
        <form method="post"><button class="primary big" type="submit">Nhắc ở khoảng trống sau</button></form>`,
    );
  }

  if (action === "reschedule") {
    return reschedulePage(ctx, task, { heading: "Dời hạn", intro: "Chọn hạn mới cho việc này. Lời nhắc sẽ được tính lại theo hạn mới.", error });
  }

  if (action === "decline") {
    return recipientShell(
      ctx,
      "Không phải của tôi",
      html`<h1>Việc này không phải của bạn?</h1>${alert}${recipientTaskCard(task)}
        <form method="post">
          <div class="field">
            <label for="reassign_to">Chuyển cho</label>
            <select id="reassign_to" name="reassign_to">
              <option value="">Để người chủ trì quyết định</option>
              ${others.map((p) => html`<option value="${p.id}">${p.display_name}</option>`)}
            </select>
          </div>
          <div class="field">
            <label for="note">Ghi chú (không bắt buộc)</label>
            <textarea id="note" name="note" maxlength="500"></textarea>
          </div>
          <button class="primary big" type="submit">Không phải của tôi</button>
        </form>`,
    );
  }

  return recipientShell(
    ctx,
    "Xác nhận tất cả",
    html`<h1>Xác nhận ${tasks.length} task</h1>${alert}
      <form method="post">
        ${tasks.map(
          (t) => html`${recipientTaskCard(t)}${t.due_at ? "" : dueField(`due_${t.id}`, null, "Chưa ai nêu hạn cho việc trên. Bạn chọn hạn nhé")}`,
        )}
        <button class="primary big" type="submit">Xác nhận tất cả ${tasks.length} task</button>
      </form>`,
  );
}

/** Form dời hạn. `formAction` bỏ trống thì gửi về chính liên kết đang mở. */
export function reschedulePage(
  ctx: ActionContext,
  task: TaskView,
  opts: { heading: string; intro: string; formAction?: string; error: string | null },
): H {
  return recipientShell(
    ctx,
    "Dời hạn",
    html`<h1>${opts.heading}</h1>
      ${opts.error ? html`<div class="banner danger" role="alert">${opts.error}</div>` : ""}
      <p>${opts.intro}</p>
      ${recipientTaskCard(task)}
      <form method="post" action="${opts.formAction ?? ""}">
        ${dueField("due_at", task.due_at, "Hạn mới")}
        <button class="primary big" type="submit">Dời hạn</button>
      </form>`,
  );
}

// ---------- Lịch thử: nguồn lịch nhập tay ----------

export type CalendarListItem = { email: string; name: string | null; source: string | null; scheduled: number };
export type CalendarNudgeItem = {
  id: string;
  kind: "confirm_reminder" | "prep" | "gap" | "deadline";
  scheduled_for: Date;
  status: "scheduled" | "sent" | "cancelled" | "skipped";
  reason: Record<string, unknown>;
  response: string | null;
  task_title: string;
};

const PRIVACY_NOTE =
  "Đây là nguồn lịch nhập tay để thử khi chưa kết nối Google Calendar. Khi kết nối thật, mỗi người tự kết nối lịch của mình và lịch đó không hiển thị cho người khác. App chỉ lưu khung giờ bận và loại, không lưu tiêu đề hay nội dung sự kiện.";

export function calendarListPage(people: CalendarListItem[], opts: { outbox: boolean; notice: string | null }): H {
  const body = html`
    <h1>Lịch thử</h1>
    <p class="muted">${PRIVACY_NOTE}</p>
    ${opts.notice ? html`<div class="banner ok" role="status">${opts.notice}</div>` : ""}
    <div class="actions" style="margin:0 0 16px">${postButton("/nudges/run", "Chạy lượt nhắc ngay")}<span class="small muted">App tự chạy mỗi phút; nút này để khỏi chờ khi thử.</span></div>
    ${people.length === 0
      ? html`<div class="card empty">Chưa có người tham gia nào. Tạo một cuộc họp trước.</div>`
      : html`<div class="card scroll"><table class="list">
          <thead><tr><th>Người</th><th>Dữ liệu lịch</th><th>Lời nhắc đang chờ</th></tr></thead>
          <tbody>${people.map(
            (p) => html`<tr>
              <td><a href="/calendar/${encodeURIComponent(p.email)}">${p.name ?? p.email}</a><br><span class="muted small">${p.email}</span></td>
              <td>${p.source ? (p.source === "manual" ? "Nhập tay" : p.source) : html`<span class="muted">chưa có, nhắc theo hạn</span>`}</td>
              <td>${p.scheduled}</td>
            </tr>`,
          )}</tbody>
        </table></div>`}`;
  return layout("Lịch thử", body, { outbox: opts.outbox });
}

const KIND_LABEL: Record<BusyKind, string> = { meeting: "Bận (họp)", focus: "Tập trung", out_of_office: "Nghỉ phép" };
const NUDGE_KIND_LABEL: Record<CalendarNudgeItem["kind"], string> = {
  confirm_reminder: "Nhắc xác nhận",
  prep: "Nhắc chuẩn bị",
  gap: "Nhắc khoảng trống",
  deadline: "Nhắc theo hạn",
};
const NUDGE_STATUS_LABEL: Record<CalendarNudgeItem["status"], string> = { scheduled: "Đang chờ", sent: "Đã gửi", cancelled: "Đã hủy", skipped: "Bỏ qua" };
const RESPONSE_LABEL: Record<string, string> = { done: "xong rồi", started: "đang làm", snoozed: "hoãn", due_changed: "dời hạn" };
const CLOSED_LABEL: Record<string, string> = {
  not_eligible: "không còn áp dụng",
  no_slot: "không còn khoảng trống phù hợp",
  task_closed: "task đã đóng",
  missed: "đến giờ thì người này không rảnh",
  rate_limited: "chạm giới hạn số lần nhắc",
  merged: "gộp vào lời nhắc chuẩn bị",
};
const WEEKDAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/** "Sao nó nhắc lúc này?": diễn giải cột `reason` của một lời nhắc. */
function nudgeReason(n: CalendarNudgeItem, tz: string): string {
  const r = n.reason;
  const time = (v: unknown) => (typeof v === "string" ? fmtTime(new Date(v), tz) : "?");
  const gap = (r.gap ?? null) as { start: string; end: string; minutes: number } | null;
  const span = gap ? `${time(gap.start)}–${time(gap.end)} (${gap.minutes} phút)` : "";
  const parts: string[] = [];
  if (n.kind === "confirm_reminder") parts.push(`Khoảng trống đầu tiên sau ${config.reminderAfterHours} giờ kể từ lúc gửi yêu cầu: ${span}`);
  if (n.kind === "prep" || n.kind === "deadline") {
    const anchor = r.anchor_kind === "meeting" ? `cuộc họp ${typeof r.anchor_title === "string" ? `"${r.anchor_title}" ` : ""}lúc ${time(r.anchor_at)}` : `hạn ${time(r.anchor_at)}`;
    parts.push(`Mốc: ${anchor}, báo trước ${r.lead_minutes} phút → lý tưởng ${time(r.ideal_at)}`);
    parts.push(r.shifted ? `lúc đó bận nên dịch sớm lên đầu khoảng trống ${span}` : "lúc đó đang trống");
  }
  if (n.kind === "gap") {
    parts.push(`Khoảng trống ${span}, điểm ${r.score}${r.fits ? ", đủ để làm xong" : ", đủ để bắt đầu"}`);
    if (r.after_snooze) parts.push("sau khi người làm bấm hoãn");
  }
  if (typeof r.closed === "string") parts.push(CLOSED_LABEL[r.closed] ?? r.closed);
  if (n.response) parts.push(`phản hồi: ${RESPONSE_LABEL[n.response] ?? n.response}`);
  return parts.join("; ");
}

export type CalendarPersonView = {
  email: string;
  name: string | null;
  connected: boolean;
  source: string | null;
  hours: WorkHours;
  blocks: BusyBlockRow[];
  nudges: CalendarNudgeItem[];
  now: Date;
};

export function calendarPersonPage(v: CalendarPersonView, opts: { outbox: boolean; notice: string | null }): H {
  const tz = v.hours.timezone;
  const base = `/calendar/${encodeURIComponent(v.email)}`;
  const today = toLocalInput(v.now, tz).slice(0, 10);
  const body = html`
    <p class="eyebrow"><a href="/calendar">Lịch thử</a> · ${v.email}</p>
    <h1>${v.name ?? v.email}</h1>
    <p class="muted small">${PRIVACY_NOTE}</p>
    ${opts.notice ? html`<div class="banner ok" role="status">${opts.notice}</div>` : ""}
    ${v.connected
      ? ""
      : html`<div class="banner warn">Người này chưa có dữ liệu lịch nên chỉ được nhắc theo hạn. Lưu giờ làm việc hoặc thêm một khung bận để bật nhắc theo lịch.</div>`}

    <h2>Giờ làm việc</h2>
    <form method="post" action="${base}/hours" class="card">
      <div class="row">
        <div class="field"><label for="work_start">Bắt đầu</label><input type="time" id="work_start" name="work_start" required value="${minuteToClock(v.hours.startMinute)}"></div>
        <div class="field"><label for="work_end">Kết thúc</label><input type="time" id="work_end" name="work_end" required value="${minuteToClock(v.hours.endMinute)}"></div>
      </div>
      <div class="field"><label for="timezone">Múi giờ</label><input type="text" id="timezone" name="timezone" required value="${tz}"></div>
      <fieldset class="field days"><legend>Ngày làm việc</legend>
        ${[1, 2, 3, 4, 5, 6, 0].map(
          (d) => html`<label class="check"><input type="checkbox" name="day_${d}" ${v.hours.days.includes(d) ? "checked" : ""}><span>${WEEKDAY_SHORT[d]}</span></label>`,
        )}
      </fieldset>
      <button class="primary" type="submit">Lưu giờ làm việc</button>
    </form>

    <h2>Khung giờ bận sắp tới (${v.blocks.length})</h2>
    ${v.blocks.length === 0
      ? html`<div class="card empty">Chưa có khung giờ bận nào.</div>`
      : html`<div class="card scroll"><table class="list">
          <thead><tr><th>Từ</th><th>Đến</th><th>Loại</th><th></th></tr></thead>
          <tbody>${v.blocks.map(
            (b) => html`<tr><td>${fmtDateTime(b.starts_at, tz)}</td><td>${fmtDateTime(b.ends_at, tz)}</td><td>${KIND_LABEL[b.kind]}</td>
              <td>${postButton(`${base}/blocks/${b.id}/delete`, "Xóa")}</td></tr>`,
          )}</tbody>
        </table></div>`}
    <form method="post" action="${base}/blocks" class="card">
      <div class="row">
        <div class="field"><label for="starts_at">Bận từ</label><input type="datetime-local" id="starts_at" name="starts_at" required></div>
        <div class="field"><label for="ends_at">Đến</label><input type="datetime-local" id="ends_at" name="ends_at" required></div>
      </div>
      <div class="field"><label for="kind">Loại</label>
        <select id="kind" name="kind">${(Object.keys(KIND_LABEL) as BusyKind[]).map((k) => html`<option value="${k}">${KIND_LABEL[k]}</option>`)}</select>
        <p class="hint">Giờ tính theo múi giờ ${tz}. Không có ô tiêu đề: app chỉ cần biết bận hay rảnh.</p>
      </div>
      <button type="submit">Thêm khung giờ bận</button>
    </form>
    <form method="post" action="${base}/sample" class="card">
      <div class="field"><label for="date">Điền lịch mẫu cho ngày</label>
        <input type="date" id="date" name="date" required value="${today}">
        <p class="hint">Lịch thứ Sáu của Lan trong tài liệu thiết kế: bận 09:00–10:30, 11:00–14:00, 15:00–16:00. Thay cho mọi khung bận của ngày đó.</p>
      </div>
      <button type="submit">Điền lịch mẫu</button>
    </form>

    <h2>Lời nhắc (${v.nudges.length})</h2>
    ${v.nudges.length === 0
      ? html`<div class="card empty">Chưa có lời nhắc nào cho người này.</div>`
      : html`<div class="card scroll"><table class="list">
          <thead><tr><th>Lúc</th><th>Loại</th><th>Task</th><th>Vì sao</th></tr></thead>
          <tbody>${v.nudges.map(
            (n) => html`<tr>
              <td>${fmtDateTime(n.scheduled_for, tz)}<br><span class="badge ${n.status === "sent" ? "ok" : n.status === "scheduled" ? "wait" : ""}">${NUDGE_STATUS_LABEL[n.status]}</span></td>
              <td>${NUDGE_KIND_LABEL[n.kind]}</td>
              <td>${n.task_title}</td>
              <td class="small">${nudgeReason(n, tz)}</td>
            </tr>`,
          )}</tbody>
        </table></div>`}

    ${v.connected
      ? html`<div class="actions" style="margin-top:24px">${postButton(`${base}/disconnect`, "Xóa dữ liệu lịch của người này", "danger")}</div>`
      : ""}`;
  return layout(`Lịch thử · ${v.name ?? v.email}`, body, { outbox: opts.outbox });
}

export const demoMode = () => config.extractor === "demo";
