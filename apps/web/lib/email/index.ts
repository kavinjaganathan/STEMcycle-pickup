import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string | null;
};

export type SendEmail = (msg: EmailMessage, opts: { displayName: string }) => Promise<void>;

/**
 * Provider is chosen by EMAIL_PROVIDER:
 *  - smtp   (default in production) — e.g. Gmail with an app password
 *  - resend — Resend HTTP API, for when the org has its own domain
 *  - file   (default locally) — writes messages to .data/outbox for inspection
 * The sender address always comes from EMAIL_FROM, so switching accounts is a
 * config change only.
 */
export const sendEmail: SendEmail = async (msg, { displayName }) => {
  const provider = env.emailProvider;
  if (provider === "file") return writeToOutbox(msg);

  const from = `"${displayName.replace(/["\\\r\n]/g, "")}" <${env.emailFrom()}>`;
  if (provider === "resend") return sendViaResend(msg, from);
  return sendViaSmtp(msg, from);
};

async function sendViaSmtp(msg: EmailMessage, from: string) {
  const nodemailer = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER ?? env.emailFrom(), pass: process.env.SMTP_PASS },
    connectionTimeout: 10_000,
  });
  await transport.sendMail({
    from,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
    replyTo: msg.replyTo ?? undefined,
  });
}

async function sendViaResend(msg: EmailMessage, from: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      reply_to: msg.replyTo ?? undefined,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`resend responded ${res.status}`);
}

async function writeToOutbox(msg: EmailMessage) {
  if (env.isHosted) throw new Error("file email provider is for local development only");
  const dir = process.env.OUTBOX_DIR ?? path.resolve(process.cwd(), ".data/outbox");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
  await fs.writeFile(file, JSON.stringify(msg, null, 2));
}
