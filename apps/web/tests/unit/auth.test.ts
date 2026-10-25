import { afterEach, describe, expect, it, vi } from "vitest";
import { checkAdminCredentials, isValidAdminCookie, LOCAL_ADMIN_PASSWORD } from "@/lib/auth/admin";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";

afterEach(() => vi.unstubAllEnvs());

describe("passwords", () => {
  it("hashes with a random salt and verifies", async () => {
    const a = await hashPassword("correct horse battery");
    const b = await hashPassword("correct horse battery");
    expect(a).toMatch(/^scrypt:16384:8:1:/);
    expect(a).not.toContain("$");
    expect(a).not.toBe(b);
    expect(await verifyPassword("correct horse battery", a)).toBe(true);
    expect(await verifyPassword("wrong", a)).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });
});

describe("admin login", () => {
  it("uses the dev password locally", async () => {
    expect(await checkAdminCredentials("admin@stemcycle.local", LOCAL_ADMIN_PASSWORD)).toBe(true);
    expect(await checkAdminCredentials("admin@stemcycle.local", "nope")).toBe(false);
  });

  it("checks the email and the hashed password from the environment", async () => {
    vi.stubEnv("ADMIN_EMAIL", "Team@StemCycle.org");
    vi.stubEnv("ADMIN_PASSWORD_HASH", await hashPassword("a long admin password"));
    expect(await checkAdminCredentials("team@stemcycle.org", "a long admin password")).toBe(true);
    expect(await checkAdminCredentials("other@stemcycle.org", "a long admin password")).toBe(false);
    expect(await checkAdminCredentials("team@stemcycle.org", LOCAL_ADMIN_PASSWORD)).toBe(false);
  });

  it("refuses to run hosted without configured credentials", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("ADMIN_EMAIL", "");
    await expect(checkAdminCredentials("a@b.co", "x")).rejects.toThrow(/ADMIN_/);
  });
});

describe("admin session cookie", () => {
  const sign = async () => {
    // Build a cookie the same way startAdminSession does, via the exported checker.
    const { createHmac } = await import("node:crypto");
    return (expires: number, secret: string, binding: string) =>
      `${expires}.${createHmac("sha256", secret).update(`admin|${expires}|${binding}`).digest("base64url")}`;
  };

  it("accepts a valid unexpired cookie and rejects tampering or expiry", async () => {
    const make = await sign();
    const secret = "local-dev-admin-session-secret-not-for-production";
    const binding = "admin@stemcycle.local|local";
    const exp = Date.now() + 60_000;
    expect(isValidAdminCookie(make(exp, secret, binding))).toBe(true);
    expect(isValidAdminCookie(make(exp, "another-secret-of-at-least-32-chars!!", binding))).toBe(
      false,
    );
    expect(isValidAdminCookie(make(Date.now() - 1, secret, binding))).toBe(false);
    expect(isValidAdminCookie(`${exp + 1}.${make(exp, secret, binding).split(".")[1]}`)).toBe(
      false,
    );
    expect(isValidAdminCookie(undefined)).toBe(false);
    expect(isValidAdminCookie("garbage")).toBe(false);
  });

  it("is revoked when the password changes", async () => {
    const make = await sign();
    const exp = Date.now() + 60_000;
    const cookie = make(
      exp,
      "local-dev-admin-session-secret-not-for-production",
      "admin@stemcycle.local|local",
    );
    vi.stubEnv("ADMIN_PASSWORD_HASH", await hashPassword("rotated password!"));
    expect(isValidAdminCookie(cookie)).toBe(false);
  });
});
