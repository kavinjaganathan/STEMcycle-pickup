/**
 * Minimal SMTP client for Cloudflare Workers, where nodemailer can't open TCP
 * sockets. Uses the Workers socket API (cloudflare:sockets): implicit TLS on
 * port 465, or STARTTLS on 587; AUTH PLAIN; one message per connection.
 * The protocol logic takes any socket-like object, so it's unit-tested in Node.
 */

export type SmtpSocket = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close: () => Promise<void>;
  startTls?: () => SmtpSocket;
};

export type SmtpConfig = { host: string; port: number; user: string; pass: string };
export type MailMessage = {
  from: string; // already formatted, e.g. "Name" <a@b.c>
  to: string;
  replyTo?: string | null;
  subject: string;
  text: string;
  html: string;
};

const enc = new TextEncoder();
const dec = new TextDecoder();

export class SmtpError extends Error {
  constructor(
    readonly stage: string,
    readonly reply: string,
  ) {
    // Only the SMTP status code goes in the message (never addresses or content).
    super(`smtp ${stage} failed (${reply.slice(0, 3)})`);
  }
}

class Conn {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private buf = "";
  constructor(readonly socket: SmtpSocket) {
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
  }
  /** Reads one (possibly multi-line) reply, e.g. "250-..." lines then "250 ...". */
  async reply(): Promise<string> {
    const lines: string[] = [];
    for (;;) {
      let i: number;
      while ((i = this.buf.indexOf("\r\n")) === -1) {
        const { value, done } = await this.reader.read();
        if (done) throw new SmtpError("read", "000 connection closed");
        this.buf += dec.decode(value, { stream: true });
      }
      const line = this.buf.slice(0, i);
      this.buf = this.buf.slice(i + 2);
      lines.push(line);
      if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) return lines.join("\n");
    }
  }
  async send(data: string) {
    await this.writer.write(enc.encode(data));
  }
  async cmd(line: string, expect: string, stage: string) {
    await this.send(`${line}\r\n`);
    const r = await this.reply();
    if (!r.startsWith(expect)) throw new SmtpError(stage, r);
    return r;
  }
  release() {
    this.reader.releaseLock();
    this.writer.releaseLock();
  }
}

export async function sendSmtp(
  open: (cfg: SmtpConfig) => SmtpSocket,
  cfg: SmtpConfig,
  msg: MailMessage,
  now = new Date(),
): Promise<void> {
  let socket = open(cfg);
  let c = new Conn(socket);
  try {
    const hello = await c.reply();
    if (!hello.startsWith("220")) throw new SmtpError("greeting", hello);
    const ehlo = "EHLO stemcycle";
    await c.cmd(ehlo, "250", "ehlo");
    if (cfg.port !== 465) {
      await c.cmd("STARTTLS", "220", "starttls");
      if (!socket.startTls) throw new SmtpError("starttls", "000 not supported");
      c.release();
      socket = socket.startTls();
      c = new Conn(socket);
      await c.cmd(ehlo, "250", "ehlo");
    }
    const auth = btoa(String.fromCharCode(...enc.encode(`\0${cfg.user}\0${cfg.pass}`)));
    await c.cmd(`AUTH PLAIN ${auth}`, "235", "auth");
    await c.cmd(`MAIL FROM:<${address(msg.from)}>`, "250", "mail-from");
    await c.cmd(`RCPT TO:<${address(msg.to)}>`, "25", "rcpt-to");
    await c.cmd("DATA", "354", "data");
    await c.send(dotStuff(buildMime(msg, now)) + "\r\n.\r\n");
    const r = await c.reply();
    if (!r.startsWith("250")) throw new SmtpError("message", r);
    await c.send("QUIT\r\n");
  } finally {
    await socket.close().catch(() => {});
  }
}

/** The bare address from `"Name" <a@b.c>` or `a@b.c`; rejects anything that could inject commands. */
export function address(s: string): string {
  const m = s.match(/<([^<>\s]+)>\s*$/);
  const a = (m ? m[1] : s).trim();
  if (!/^[^\s<>@,;:"\r\n]+@[^\s<>@,;:"\r\n]+$/.test(a))
    throw new SmtpError("address", "000 invalid address");
  return a;
}

const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

/** RFC 2047 encoded-word for non-ASCII header text. */
function headerText(s: string): string {
  const v = clean(s);
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`;
}

function b64(s: string): string {
  const bytes = enc.encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

const wrap76 = (s: string) => s.replace(/.{1,76}/g, "$&\r\n").trimEnd();

/** multipart/alternative message with base64 bodies (safe for any UTF-8 text). */
export function buildMime(msg: MailMessage, now = new Date()): string {
  const boundary = `sc-${crypto.randomUUID()}`;
  const fromAddr = address(msg.from);
  const name = msg.from.match(/^\s*"([^"]*)"\s*</)?.[1];
  const headers = [
    `From: ${name ? `${headerText(name)} <${fromAddr}>` : fromAddr}`,
    `To: <${address(msg.to)}>`,
    ...(msg.replyTo ? [`Reply-To: <${address(msg.replyTo)}>`] : []),
    `Subject: ${headerText(msg.subject)}`,
    `Date: ${now.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${crypto.randomUUID()}@${fromAddr.split("@")[1]}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const part = (type: string, body: string) =>
    [
      `--${boundary}`,
      `Content-Type: ${type}; charset=utf-8`,
      "Content-Transfer-Encoding: base64",
      "",
      wrap76(b64(body)),
    ].join("\r\n");
  return [
    ...headers,
    "",
    part("text/plain", msg.text),
    part("text/html", msg.html),
    `--${boundary}--`,
  ].join("\r\n");
}

/** Lines starting with "." get an extra "." (RFC 5321 4.5.2). */
function dotStuff(s: string): string {
  return s.replace(/(^|\r\n)\./g, "$1..");
}
