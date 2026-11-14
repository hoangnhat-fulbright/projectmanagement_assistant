import { fmtDate, fmtDateTime, fmtOffset } from "./time.ts";

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export type EmailTask = {
  title: string;
  dueAt: Date | null;
  dueIsInferred: boolean;
  quote: string;
  speaker: string | null;
  atSeconds: number | null;
  uncertainOwner: boolean;
  links: { confirm: string; amend: string; decline: string };
};

export type ConfirmEmailInput = {
  kind: "confirm_request" | "confirm_reminder";
  recipientName: string;
  meetingTitle: string;
  meetingStartedAt: Date;
  organizerName: string | null;
  organizerEmail: string | null;
  tasks: EmailTask[];
  confirmAllLink: string | null;
};

const BTN =
  "display:inline-block;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin:0 8px 8px 0;";
const PRIMARY = `${BTN}background:#1f5f4a;color:#ffffff;`;
const SECONDARY = `${BTN}background:#ffffff;color:#1c2a26;border:1px solid #c9d3cf;`;

function dueLine(t: EmailTask): string {
  if (!t.dueAt) return "Chưa có hạn. Bạn sẽ chọn hạn khi xác nhận.";
  return `${fmtDateTime(t.dueAt)}${t.dueIsInferred ? " (AI đoán từ cuộc họp, bạn sửa được)" : ""}`;
}

function sourceLine(t: EmailTask): string {
  const who = t.speaker ? `${t.speaker}: ` : "";
  const at = t.atSeconds !== null ? ` (${fmtOffset(t.atSeconds)})` : "";
  return `${who}"${t.quote}"${at}`;
}

/** Email gom mọi task của một người từ một buổi họp, mỗi task có ba nút hành động. */
export function renderConfirmEmail(input: ConfirmEmailInput): { subject: string; html: string; text: string } {
  const n = input.tasks.length;
  const prefix = input.kind === "confirm_reminder" ? "Nhắc lại: " : "";
  const subject = `${prefix}Xác nhận ${n} task từ buổi "${input.meetingTitle}"`;
  const intro =
    input.kind === "confirm_reminder"
      ? `Bạn còn ${n} task từ buổi họp này chưa xác nhận.`
      : `Sau buổi họp, có ${n} task được ghi nhận là của bạn. Bạn xác nhận giúp nhé.`;
  const meetingLine = `${input.meetingTitle} · ${fmtDate(input.meetingStartedAt)}`;
  const contact = input.organizerName
    ? `${input.organizerName}${input.organizerEmail ? ` (${input.organizerEmail})` : ""}`
    : "người chủ trì cuộc họp";
  const notice =
    `Cuộc họp này đã được phiên âm và các task được AI trích ra từ bản phiên âm, nên có thể sai. ` +
    `Nếu bạn muốn xóa phần phiên âm liên quan đến mình, hãy liên hệ ${contact}. ` +
    `Các liên kết trong email này chỉ dành cho bạn, đừng chuyển tiếp.`;

  const cards = input.tasks
    .map(
      (t) => `
    <div style="border:1px solid #dde4e1;border-radius:12px;padding:16px;margin:0 0 14px;background:#ffffff;">
      <div style="font-size:16px;font-weight:600;color:#1c2a26;margin:0 0 8px;">${esc(t.title)}</div>
      <div style="font-size:14px;color:#3d4d48;margin:0 0 4px;"><strong>Hạn:</strong> ${esc(dueLine(t))}</div>
      <div style="font-size:13px;color:#5d6d68;margin:0 0 12px;"><strong>Từ cuộc họp:</strong> ${esc(sourceLine(t))}</div>
      ${t.uncertainOwner ? `<div style="font-size:13px;color:#8a5a00;margin:0 0 12px;">AI không chắc việc này là của bạn.</div>` : ""}
      <a href="${esc(t.links.confirm)}" style="${PRIMARY}">Xác nhận</a>
      <a href="${esc(t.links.amend)}" style="${SECONDARY}">Sửa</a>
      <a href="${esc(t.links.decline)}" style="${SECONDARY}">Không phải của tôi</a>
    </div>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:24px 16px;background:#f3f6f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c2a26;">
  <div style="max-width:560px;margin:0 auto;">
    <p style="font-size:13px;color:#5d6d68;margin:0 0 4px;">${esc(meetingLine)}</p>
    <h1 style="font-size:20px;margin:0 0 12px;">Chào ${esc(input.recipientName)},</h1>
    <p style="font-size:15px;line-height:1.5;margin:0 0 18px;">${esc(intro)}</p>
    ${cards}
    ${input.confirmAllLink ? `<p style="margin:4px 0 18px;"><a href="${esc(input.confirmAllLink)}" style="${PRIMARY}">Xác nhận tất cả ${n} task</a></p>` : ""}
    <p style="font-size:12px;line-height:1.5;color:#6b7a75;margin:18px 0 0;">${esc(notice)}</p>
  </div>
</body></html>`;

  const text = [
    `Chào ${input.recipientName},`,
    "",
    intro,
    `Cuộc họp: ${meetingLine}`,
    "",
    ...input.tasks.flatMap((t, i) => [
      `${i + 1}. ${t.title}`,
      `   Hạn: ${dueLine(t)}`,
      `   Từ cuộc họp: ${sourceLine(t)}`,
      `   Xác nhận: ${t.links.confirm}`,
      `   Sửa: ${t.links.amend}`,
      `   Không phải của tôi: ${t.links.decline}`,
      "",
    ]),
    ...(input.confirmAllLink ? [`Xác nhận tất cả: ${input.confirmAllLink}`, ""] : []),
    notice,
  ].join("\n");

  return { subject, html, text };
}

// ---------- Email nhắc việc (nudge) ----------

export type NudgeEmailTask = {
  title: string;
  meetingTitle: string;
  dueAt: Date | null;
  /** Lý do về thời điểm, mỗi phần tử một câu: "Bạn trống đến 15:00 (55 phút)…" */
  lines: string[];
  links: {
    done: string;
    /** null khi task đã ở trạng thái Đang làm. */
    start: string | null;
    /** null khi người nhận chưa có dữ liệu lịch (không biết khoảng trống sau là khi nào). */
    snooze: string | null;
    reschedule: string;
  };
};

export type NudgeEmailInput = {
  recipientName: string;
  tasks: NudgeEmailTask[];
  /** true nếu thời điểm nhắc được chọn theo lịch bận/rảnh của người nhận. */
  usesCalendar: boolean;
  /** Múi giờ để hiển thị hạn. */
  timezone: string;
};

/** Email gom mọi task đến giờ nhắc của một người, mỗi task có các nút Xong rồi, Đang làm, Nhắc ở khoảng trống sau, Dời hạn. */
export function renderNudgeEmail(input: NudgeEmailInput): { subject: string; html: string; text: string } {
  const n = input.tasks.length;
  const subject = n === 1 ? `Nhắc việc: ${input.tasks[0]!.title}` : `Nhắc việc: ${n} việc bạn đã nhận`;
  const notice =
    (input.usesCalendar
      ? "Thời điểm nhắc được chọn theo lịch bận/rảnh của bạn. Lịch của bạn không hiển thị cho người khác. "
      : "Bạn chưa có dữ liệu lịch nên lời nhắc này dựa theo hạn của việc. ") +
    "Các liên kết trong email này chỉ dành cho bạn, đừng chuyển tiếp.";
  const due = (t: NudgeEmailTask) => (t.dueAt ? fmtDateTime(t.dueAt, input.timezone) : "chưa có");

  const cards = input.tasks
    .map(
      (t) => `
    <div style="border:1px solid #dde4e1;border-radius:12px;padding:16px;margin:0 0 14px;background:#ffffff;">
      <div style="font-size:16px;font-weight:600;color:#1c2a26;margin:0 0 8px;">${esc(t.title)}</div>
      ${t.lines.map((line) => `<div style="font-size:14px;line-height:1.5;color:#1c2a26;margin:0 0 6px;">${esc(line)}</div>`).join("")}
      <div style="font-size:13px;color:#5d6d68;margin:6px 0 12px;"><strong>Hạn:</strong> ${esc(due(t))} · Từ buổi "${esc(t.meetingTitle)}"</div>
      <a href="${esc(t.links.done)}" style="${PRIMARY}">Xong rồi</a>
      ${t.links.start ? `<a href="${esc(t.links.start)}" style="${SECONDARY}">Đang làm</a>` : ""}
      ${t.links.snooze ? `<a href="${esc(t.links.snooze)}" style="${SECONDARY}">Nhắc ở khoảng trống sau</a>` : ""}
      <a href="${esc(t.links.reschedule)}" style="${SECONDARY}">Dời hạn</a>
    </div>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:24px 16px;background:#f3f6f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c2a26;">
  <div style="max-width:560px;margin:0 auto;">
    <h1 style="font-size:20px;margin:0 0 12px;">Chào ${esc(input.recipientName)},</h1>
    <p style="font-size:15px;line-height:1.5;margin:0 0 18px;">${n === 1 ? "Nhắc bạn một việc đã nhận sau cuộc họp." : `Nhắc bạn ${n} việc đã nhận sau cuộc họp.`}</p>
    ${cards}
    <p style="font-size:12px;line-height:1.5;color:#6b7a75;margin:18px 0 0;">${esc(notice)}</p>
  </div>
</body></html>`;

  const text = [
    `Chào ${input.recipientName},`,
    "",
    ...input.tasks.flatMap((t, i) => [
      `${i + 1}. ${t.title}`,
      ...t.lines.map((line) => `   ${line}`),
      `   Hạn: ${due(t)} · Từ buổi "${t.meetingTitle}"`,
      `   Xong rồi: ${t.links.done}`,
      ...(t.links.start ? [`   Đang làm: ${t.links.start}`] : []),
      ...(t.links.snooze ? [`   Nhắc ở khoảng trống sau: ${t.links.snooze}`] : []),
      `   Dời hạn: ${t.links.reschedule}`,
      "",
    ]),
    notice,
  ].join("\n");

  return { subject, html, text };
}
