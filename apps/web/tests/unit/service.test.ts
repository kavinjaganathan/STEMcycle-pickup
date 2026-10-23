import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createLocalDb } from "@/lib/db/pglite";
import { createRepo, pgRpc } from "@/lib/db/repo";
import { handleCancel, LIMITS, submitPickup, type Deps } from "@/lib/pickups/service";

let db: PGlite;
let deps: Deps;
let sent: { to: string; text: string }[];
let slotId: string;

function form(overrides: Record<string, unknown> = {}) {
  return {
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "214-555-0100",
    address_line: "1 Main St",
    city: "Frisco",
    zip: "75033",
    book_count: "20",
    slot_id: slotId,
    notes: "",
    website: "",
    turnstileToken: "ok",
    ...overrides,
  };
}

beforeEach(async () => {
  db = await createLocalDb();
  const { rows } = await db.query<{ id: string }>(
    "insert into slots (slot_date, start_time, end_time, capacity) values (current_date + 3, '09:00', '12:00', 10) returning id",
  );
  slotId = rows[0].id;
  sent = [];
  deps = {
    repo: createRepo(pgRpc(db)),
    sendEmail: vi.fn(async (msg) => {
      sent.push(msg);
    }),
    verifyTurnstile: vi.fn(async (t) => t === "ok"),
    appUrl: "https://pickup.example.org",
    now: () => new Date(),
  };
});

const pickupCount = async () =>
  (await db.query<{ n: number }>("select count(*)::int as n from pickups")).rows[0].n;

describe("submitPickup", () => {
  it("creates the pickup and emails a working cancel link", async () => {
    const res = await submitPickup(deps, form(), "1.1.1.1");
    expect(res.status).toBe(201);
    expect(await pickupCount()).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("ada@example.com");

    const token = sent[0].text.match(/\/cancel\/([A-Za-z0-9_-]{43})/)?.[1];
    expect(token).toBeDefined();
    // Only the hash is stored.
    const { rows } = await db.query<{ h: string }>("select cancel_token_hash as h from pickups");
    expect(rows[0].h).not.toBe(token);

    const lookup = await handleCancel(deps, { token, action: "lookup" }, "1.1.1.1");
    expect(lookup.body).toMatchObject({ ok: true, state: "pending" });
    expect((await handleCancel(deps, { token, action: "cancel" }, "1.1.1.1")).status).toBe(200);
    expect((await handleCancel(deps, { token, action: "cancel" }, "1.1.1.1")).status).toBe(409);
  });

  it("silently drops honeypot submissions", async () => {
    const res = await submitPickup(deps, form({ website: "http://spam" }), "1.1.1.1");
    expect(res.status).toBe(201);
    expect(await pickupCount()).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("rejects failed Turnstile checks", async () => {
    const res = await submitPickup(deps, form({ turnstileToken: "bad" }), "1.1.1.1");
    expect(res.status).toBe(403);
    expect(await pickupCount()).toBe(0);
  });

  it("returns field errors for invalid input", async () => {
    const res = await submitPickup(deps, form({ email: "nope" }), "1.1.1.1");
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, fieldErrors: { email: expect.any(String) } });
  });

  it("rejects out-of-area ZIPs", async () => {
    const res = await submitPickup(deps, form({ zip: "73301" }), "1.1.1.1");
    expect(res.status).toBe(422);
  });

  it("rate limits by IP", async () => {
    const statuses = [];
    for (let i = 0; i <= LIMITS.submitPerIp.max; i++) {
      statuses.push(
        (await submitPickup(deps, form({ email: `p${i}@example.com` }), "9.9.9.9")).status,
      );
    }
    expect(statuses.at(-1)).toBe(429);
    expect(statuses.slice(0, -1).every((s) => s === 201)).toBe(true);
  });

  it("still books and returns the cancel link if email fails", async () => {
    deps.sendEmail = vi.fn(async () => {
      throw new Error("smtp down");
    });
    const res = await submitPickup(deps, form(), "1.1.1.1");
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      ok: true,
      emailSent: false,
      cancelUrl: expect.stringContaining("/cancel/"),
    });
  });
});

describe("handleCancel", () => {
  it("returns 404 for malformed or unknown tokens", async () => {
    expect((await handleCancel(deps, { token: "short", action: "cancel" }, "1.1.1.1")).status).toBe(
      404,
    );
    expect(
      (await handleCancel(deps, { token: "a".repeat(43), action: "lookup" }, "1.1.1.1")).status,
    ).toBe(404);
  });
});
