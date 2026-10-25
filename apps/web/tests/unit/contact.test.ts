import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalDb } from "@/lib/db/pglite";
import { createRepo, pgRpc } from "@/lib/db/repo";
import { submitContact } from "@/lib/contact-service";
import type { EmailMessage } from "@/lib/email";

let sent: EmailMessage[];
let deps: Parameters<typeof submitContact>[0];
const good = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  message: "Do you pick up in Allen? I have about 60 books.",
  turnstileToken: "ok",
};

beforeEach(async () => {
  vi.stubEnv("CONTACT_EMAIL", "team@stemcycle.example");
  sent = [];
  deps = {
    repo: createRepo(pgRpc(await createLocalDb())),
    sendEmail: vi.fn(async (m) => {
      sent.push(m);
    }),
    verifyTurnstile: vi.fn(async (t) => t === "ok"),
  };
});
afterEach(() => vi.unstubAllEnvs());

describe("Contact Us", () => {
  it("emails the organization with the sender as reply-to", async () => {
    const res = await submitContact(deps, good, "1.2.3.4");
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "team@stemcycle.example", replyTo: "ada@example.com" });
    expect(sent[0].text).toContain("Do you pick up in Allen?");
  });

  it("never reports success when the email couldn't be sent", async () => {
    deps.sendEmail = vi.fn(async () => {
      throw new Error("smtp down");
    });
    const res = await submitContact(deps, good, "1.2.3.4");
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({
      ok: false,
      error: expect.stringContaining("team@stemcycle.example"),
    });
  });

  it("validates, checks Turnstile, drops honeypot bots and rate limits", async () => {
    const bad = await submitContact(deps, { ...good, email: "nope", message: "hi" }, "1.1.1.1");
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({
      fieldErrors: { email: expect.any(String), message: expect.any(String) },
    });
    expect((await submitContact(deps, { ...good, turnstileToken: "x" }, "1.1.1.2")).status).toBe(
      403,
    );
    expect(
      (await submitContact(deps, { ...good, website: "spam.example" }, "1.1.1.3")).status,
    ).toBe(200);
    expect(sent).toHaveLength(0);
    const statuses = [];
    for (let i = 0; i < 6; i++)
      statuses.push(
        (await submitContact(deps, { ...good, email: `p${i}@example.com` }, "9.9.9.9")).status,
      );
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });
});
