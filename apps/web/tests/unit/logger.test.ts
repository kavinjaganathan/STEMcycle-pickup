import { afterEach, describe, expect, it, vi } from "vitest";
import { log, scrub } from "@/lib/logger";

afterEach(() => vi.restoreAllMocks());

describe("logger", () => {
  it("redacts PII keys and PII-looking strings but keeps IDs", () => {
    const out = scrub({
      pickup_id: "6f1c1b5e-4a3e-4c7e-9d2a-1b2c3d4e5f60",
      email: "a@b.com",
      addressLine: "1 Main St",
      ip: "1.2.3.4",
      message: "failed for a@b.com at 214-555-0100",
      nested: { phone: "2145550100", count: 3 },
    });
    expect(out).toEqual({
      pickup_id: "6f1c1b5e-4a3e-4c7e-9d2a-1b2c3d4e5f60",
      email: "[redacted]",
      addressLine: "[redacted]",
      ip: "[redacted]",
      message: "failed for [email] at [number]",
      nested: { phone: "[redacted]", count: 3 },
    });
  });

  it("never prints raw PII", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log("error", "x", {
      err: new Error("insert failed: ada@example.com, 1 Main St"),
      to: "ada@example.com",
    });
    const printed = spy.mock.calls.flat().join(" ");
    expect(printed).not.toContain("ada@example.com");
  });
});
