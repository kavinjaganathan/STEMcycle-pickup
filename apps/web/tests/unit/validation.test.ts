import { describe, expect, it } from "vitest";
import { normalizePhone, pickupFormSchema } from "@/lib/validation";

const valid = {
  name: "  Ada   Lovelace ",
  email: " Ada@Example.COM ",
  phone: "(214) 555-0100",
  address_line: "1 Main St",
  city: "Frisco",
  zip: "75033-1234",
  textbook_type: "middle_school",
  book_count: "12",
  slot: "2026-10-31T10",
  notes: "",
};

describe("pickupFormSchema", () => {
  it("normalizes valid input", () => {
    const r = pickupFormSchema.parse(valid);
    expect(r).toMatchObject({
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "2145550100",
      zip: "75033",
      textbook_type: "middle_school",
      book_count: 12,
      slot: { slot_date: "2026-10-31", slot_hour: 10 },
      notes: null,
    });
  });

  it.each([
    ["email", "not-an-email"],
    ["phone", "555-0100"],
    ["zip", "7503"],
    ["book_count", "0"],
    ["book_count", "2.5"],
    ["slot", "abc"],
    ["slot", "2026-10-31T24"],
    ["textbook_type", "comics"],
    ["name", "A"],
    ["notes", "x".repeat(501)],
  ])("rejects bad %s (%s)", (field, value) => {
    const r = pickupFormSchema.safeParse({ ...valid, [field]: value });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path[0]).toBe(field);
  });

  it("strips control characters", () => {
    const r = pickupFormSchema.parse({ ...valid, address_line: "1 Main\u0000 St\u0007" });
    expect(r.address_line).toBe("1 Main St");
  });
});

describe("normalizePhone", () => {
  it.each([
    ["+1 214 555 0100", "2145550100"],
    ["214.555.0100", "2145550100"],
    ["1-214-555-0100", "2145550100"],
    ["114-555-0100", null],
    ["12345", null],
  ])("%s -> %s", (input, out) => expect(normalizePhone(input)).toBe(out));
});
