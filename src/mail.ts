import nodemailer from "nodemailer";
import { config } from "./config.ts";

export type Mail = { to: string; toName: string; subject: string; html: string; text: string };

export interface Mailer {
  /**
   * true = không gửi đi đâu cả; nội dung email được lưu vào database để xem ở /outbox.
   * false = gửi thật; nội dung không được lưu, vì nó chứa các liên kết còn hiệu lực.
   */
  readonly outboxOnly: boolean;
  send(mail: Mail): Promise<void>;
}

/** Chế độ thử trên máy: không gửi gì, email đọc ở trang /outbox. */
export const outboxMailer: Mailer = {
  outboxOnly: true,
  async send() {},
};

export function smtpMailer(url: string): Mailer {
  const transport = nodemailer.createTransport(url);
  return {
    outboxOnly: false,
    async send(mail) {
      await transport.sendMail({
        from: config.mailFrom,
        to: { name: mail.toName, address: mail.to },
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
    },
  };
}

export function createMailer(): Mailer {
  return config.smtpUrl ? smtpMailer(config.smtpUrl) : outboxMailer;
}
