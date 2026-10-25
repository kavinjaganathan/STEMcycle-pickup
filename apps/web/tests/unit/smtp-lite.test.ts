import { describe, expect, it } from "vitest";
import { address, buildMime, sendSmtp, SmtpError, type SmtpSocket } from "@/lib/email/smtp-lite";

/** A scripted SMTP server: answers each client line with the next reply. */
function fakeServer(replies: Record<string, string>, greeting = "220 ready\r\n") {
  const received: string[] = [];
  let push!: (s: string) => void;
  const readable = new ReadableStream<Uint8Array>({
    start(ctrl) {
      push = (s) => ctrl.enqueue(new TextEncoder().encode(s));
      push(greeting);
    },
  });
  let pending = "";
  let inData = false;
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      pending += new TextDecoder().decode(chunk);
      if (inData) {
        if (pending.endsWith("\r\n.\r\n")) {
          received.push(pending);
          pending = "";
          inData = false;
          push("250 queued\r\n");
        }
        return;
      }
      let i: number;
      while ((i = pending.indexOf("\r\n")) !== -1) {
        const line = pending.slice(0, i);
        pending = pending.slice(i + 2);
        received.push(line);
        const key = Object.keys(replies).find((k) => line.startsWith(k));
        const reply = key ? replies[key] : "500 unknown";
        if (line === "DATA" && reply.startsWith("354")) inData = true;
        if (line !== "QUIT") push(`${reply}\r\n`);
      }
    },
  });
  const socket: SmtpSocket = { readable, writable, close: async () => {} };
  return { socket, received };
}

const OK = {
  EHLO: "250-smtp.example\r\n250-AUTH PLAIN\r\n250 SMTPUTF8",
  "AUTH PLAIN": "235 accepted",
  "MAIL FROM": "250 ok",
  "RCPT TO": "250 ok",
  DATA: "354 go ahead",
};
const msg = {
  from: '"StemCycle Pickup" <team@stemcycle.example>',
  to: "ada@example.com",
  replyTo: "help@stemcycle.example",
  subject: "Your pickup: Saturday — Oct 31",
  text: "Hi Ada,\n.leading dot line\nThanks!",
  html: "<p>Hi Ada</p>",
};
const cfg = {
  host: "smtp.example",
  port: 465,
  user: "team@stemcycle.example",
  pass: "app-password",
};

describe("SMTP client for Cloudflare Workers", () => {
  it("authenticates and sends one message with dot-stuffing", async () => {
    const { socket, received } = fakeServer(OK);
    await sendSmtp(() => socket, cfg, msg);
    expect(received[0]).toBe("EHLO stemcycle");
    expect(Buffer.from(received[1].replace("AUTH PLAIN ", ""), "base64").toString()).toBe(
      "\0team@stemcycle.example\0app-password",
    );
    expect(received.slice(2, 5)).toEqual([
      "MAIL FROM:<team@stemcycle.example>",
      "RCPT TO:<ada@example.com>",
      "DATA",
    ]);
    const data = received[5];
    expect(data).toContain("Subject: =?UTF-8?B?");
    expect(data).toContain("Reply-To: <help@stemcycle.example>");
    expect(data.endsWith("\r\n.\r\n")).toBe(true);
    expect(received.at(-1)).toBe("QUIT");
  });

  it("reports which step failed, without leaking details", async () => {
    const { socket } = fakeServer({
      ...OK,
      "AUTH PLAIN": "535 5.7.8 Username and Password not accepted",
    });
    const err = await sendSmtp(() => socket, cfg, msg).catch((e) => e);
    expect(err).toBeInstanceOf(SmtpError);
    expect(err.message).toBe("smtp auth failed (535)");
  });

  it("builds a valid MIME message whose bodies decode back exactly", () => {
    const mime = buildMime(msg, new Date("2026-10-25T12:00:00Z"));
    expect(mime).toMatch(/^From: "?StemCycle Pickup"? <team@stemcycle\.example>\r\n/);
    expect(mime).toContain("Date: Sun, 25 Oct 2026 12:00:00 +0000");
    const parts = [...mime.matchAll(/base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/g)].map((m) =>
      Buffer.from(m[1].replace(/\r\n/g, ""), "base64").toString(),
    );
    expect(parts).toEqual([msg.text, msg.html]);
    expect(mime.split("\r\n").every((l) => l.length <= 998)).toBe(true);
  });

  it("refuses addresses that could inject SMTP commands", () => {
    expect(address('"X" <a@b.co>')).toBe("a@b.co");
    expect(() => address("a@b.co>\r\nRCPT TO:<evil@x.co")).toThrow(SmtpError);
    expect(() => address("not an address")).toThrow(SmtpError);
  });
});
