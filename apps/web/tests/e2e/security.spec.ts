import { expect, test } from "./fixtures";

test.describe("hardening", () => {
  test("pages send security headers", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("https://challenges.cloudflare.com");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("cross-site API writes are blocked", async ({ request }) => {
    const res = await request.post("/api/cancel", {
      headers: { Origin: "https://evil.example" },
      data: { token: "x".repeat(43), action: "lookup" },
    });
    expect(res.status()).toBe(403);
  });

  test("the daily job requires the cron secret", async ({ request }) => {
    expect((await request.get("/api/cron/daily")).status()).toBe(401);
    expect(
      (
        await request.get("/api/cron/daily", { headers: { Authorization: "Bearer wrong" } })
      ).status(),
    ).toBe(401);
    const ok = await request.get("/api/cron/daily", {
      headers: { Authorization: "Bearer e2e-cron-secret-0123456789" },
    });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, anonymized: expect.any(Number) });
  });

  test("health check reports the database is reachable", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("unknown pages show a friendly 404", async ({ page }) => {
    const res = await page.goto("/no-such-page");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });
});
