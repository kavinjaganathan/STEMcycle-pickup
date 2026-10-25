import { z } from "zod";
import { TEXTBOOK_TYPES } from "@/lib/shared";

/** Shared by the browser form and the API, so both enforce the same rules. */

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const singleLine = (min: number, max: number, label: string) =>
  z
    .string()
    .transform((s) => s.replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .min(min, `Please enter your ${label}.`)
        .max(max, `${capitalize(label)} must be ${max} characters or fewer.`),
    );

/** Accepts common US formats; returns 10 digits. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(ten) ? ten : null;
}

export function formatPhone(tenDigits: string): string {
  return `(${tenDigits.slice(0, 3)}) ${tenDigits.slice(3, 6)}-${tenDigits.slice(6)}`;
}

export const pickupFormSchema = z.object({
  name: singleLine(2, 100, "name"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Please enter a valid email address.").max(254)),
  phone: z.string().transform((s, ctx) => {
    const p = normalizePhone(s);
    if (!p) {
      ctx.addIssue({ code: "custom", message: "Please enter a valid 10-digit US phone number." });
      return z.NEVER;
    }
    return p;
  }),
  address_line: singleLine(5, 200, "street address"),
  city: singleLine(2, 60, "city"),
  zip: z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/, "Please enter a 5-digit ZIP code.")
    .transform((s) => s.slice(0, 5)),
  textbook_type: z.enum(TEXTBOOK_TYPES, { error: "Please choose the type of textbooks." }),
  book_count: z.coerce
    .number({ error: "Please enter the approximate number of books." })
    .int("Please enter a whole number.")
    .min(1, "Please enter at least 1 book.")
    .max(2000, "For more than 2,000 books, please contact us directly."),
  // "YYYY-MM-DDTHH": one value per radio button in the slot picker.
  slot: z
    .string({ error: "Please choose a pickup time." })
    .regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3])$/, "Please choose a pickup time.")
    .transform((s) => ({ slot_date: s.slice(0, 10), slot_hour: Number(s.slice(11)) })),
  notes: z
    .string()
    .max(500, "Notes must be 500 characters or fewer.")
    .optional()
    .transform((s) => {
      const v = (s ?? "").replace(CONTROL_CHARS, "").trim();
      return v === "" ? null : v;
    }),
  // Honeypot: hidden from people; bots tend to fill it.
  website: z.string().max(200).optional(),
  turnstileToken: z.string().max(4096).optional(),
});

export type PickupFormInput = z.input<typeof pickupFormSchema>;
export type PickupFormData = z.output<typeof pickupFormSchema>;
export type FieldErrors = Partial<Record<keyof PickupFormInput, string>>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof PickupFormInput | undefined;
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

export const OUT_OF_AREA_MESSAGE =
  "Sorry, we only pick up in Frisco, Plano, McKinney and nearby cities right now.";

export const cancelRequestSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  action: z.enum(["lookup", "cancel"]),
});

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function slotValue(slot: { slot_date: string; hour: number }): string {
  return `${slot.slot_date}T${String(slot.hour).padStart(2, "0")}`;
}

const password = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200, "Use 200 characters or fewer.");

export const driverProfileSchema = z.object({
  full_name: singleLine(2, 100, "name"),
  phone: z.string().transform((s, ctx) => {
    const p = normalizePhone(s);
    if (!p) {
      ctx.addIssue({ code: "custom", message: "Please enter a valid 10-digit US phone number." });
      return z.NEVER;
    }
    return p;
  }),
  capacity_boxes: z.coerce
    .number({ error: "Please enter how many boxes your vehicle holds." })
    .int("Please enter a whole number.")
    .min(1, "Please enter at least 1 box.")
    .max(200, "Please enter 200 boxes or fewer."),
});

export const driverSignupSchema = driverProfileSchema.extend({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Please enter a valid email address.").max(254)),
  password,
  website: z.string().max(200).optional(),
  turnstileToken: z.string().max(4096).optional(),
});

export const newPasswordSchema = z.object({ password });
