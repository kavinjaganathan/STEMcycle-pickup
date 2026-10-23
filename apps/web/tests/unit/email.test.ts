import { afterEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn(async () => ({}));
vi.mock("nodemailer", () => ({ createTransport: vi.fn(() => ({ sendMail })) }));

afterEach(() => {
  vi.unstubAllEnvs();
  sendMail.mockClear();
});

describe("sendEmail", () => {
  it("uses EMAIL_FROM and the configured display name, so the sender is config-only", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "smtp");
    vi.stubEnv("EMAIL_FROM", "first@example.org");
    const { sendEmail } = await import("@/lib/email");
    const msg = { to: "r@example.com", subject: "s", text: "t", html: "h" };
    await sendEmail(msg, { displayName: "StemCycle" });
    vi.stubEnv("EMAIL_FROM", "second@example.org");
    await sendEmail(msg, { displayName: "StemCycle" });
    const froms = sendMail.mock.calls.map((c) => (c as unknown as [{ from: string }])[0].from);
    expect(froms).toEqual(['"StemCycle" <first@example.org>', '"StemCycle" <second@example.org>']);
  });

  it("strips quotes and newlines from the display name", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "smtp");
    vi.stubEnv("EMAIL_FROM", "a@example.org");
    const { sendEmail } = await import("@/lib/email");
    await sendEmail(
      { to: "r@example.com", subject: "s", text: "t", html: "h" },
      { displayName: 'Bad"\r\nBcc: x' },
    );
    expect((sendMail.mock.calls[0] as unknown as [{ from: string }])[0].from).toBe(
      '"BadBcc: x" <a@example.org>',
    );
  });
});
