import { describe, expect, it } from "vitest";
import { confirmationEmail } from "@/lib/email/templates";

describe("confirmationEmail", () => {
  const msg = confirmationEmail({
    orgName: "StemCycle",
    name: "<script>alert(1)</script>",
    bookCount: 20,
    addressLine: "1 Main St, Frisco 75033",
    slot: { slot_date: "2026-10-31", start_time: "09:00:00", end_time: "12:00:00" },
    cancelUrl: "https://example.org/cancel/abc",
  });

  it("formats the slot in local time", () => {
    expect(msg.subject).toBe("Your StemCycle book pickup: Saturday, October 31");
    expect(msg.text).toContain("Saturday, October 31, 9 AM – 12 PM");
  });

  it("escapes user input in HTML and includes the cancel link", () => {
    expect(msg.html).not.toContain("<script>");
    expect(msg.html).toContain("https://example.org/cancel/abc");
    expect(msg.text).toContain("https://example.org/cancel/abc");
  });
});
