import { z } from "zod";
import { PICKUP_STATUSES } from "@/lib/db/admin";
import { DATE_RE, TIME_RE } from "@/lib/dates";

const date = z.string().regex(DATE_RE, "Use YYYY-MM-DD.");
const time = z.string().regex(TIME_RE, "Use HH:MM.");
const text = (max: number) => z.string().trim().min(1, "Required.").max(max);

export const pickupStatusSchema = z.object({ status: z.enum(PICKUP_STATUSES) });

export const pickupQuerySchema = z.object({
  from: date,
  to: date,
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").filter(Boolean) : []))
    .pipe(z.array(z.enum(PICKUP_STATUSES))),
});

export const createSlotsSchema = z
  .object({
    from: date,
    to: date,
    weekdays: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one weekday."),
    start_time: time,
    end_time: time,
    capacity: z.number().int().min(1).max(500).nullable(),
  })
  .refine((v) => v.to >= v.from, {
    message: "End date must be on or after start date.",
    path: ["to"],
  })
  .refine((v) => v.end_time > v.start_time, {
    message: "End time must be after start time.",
    path: ["end_time"],
  });

export const updateSlotSchema = z.object({
  capacity: z.number().int().min(1).max(500).nullable(),
  active: z.boolean(),
});

export const vehicleSchema = z.object({
  name: text(60),
  type: text(30),
  capacity_books: z.number().int().min(1).max(10_000),
  max_route_min: z.number().int().min(30).max(720),
  default_driver_id: z.uuid().nullable(),
  active: z.boolean(),
});

export const depotSchema = z.object({
  name: text(60),
  address: text(200),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  is_default: z.boolean(),
});

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  full_name: text(100),
  phone: z.string().trim().max(30),
  role: z.enum(["admin", "driver"]),
});

export const updateUserSchema = z.object({
  full_name: text(100),
  phone: z.string().trim().max(30),
  role: z.enum(["admin", "driver"]),
  active: z.boolean(),
});

export const settingsSchema = z.object({
  org_name: text(80),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown timezone."),
  zip_allowlist: z
    .array(z.string().regex(/^\d{5}$/, "ZIPs must be 5 digits."))
    .min(1)
    .max(500),
  booking_cutoff_hours: z.number().int().min(0).max(168),
  email_display_name: text(80),
  reply_to: z.union([z.literal(""), z.email()]).nullable(),
  retention_days: z.number().int().min(7).max(3650),
  service_min_base: z.number().int().min(0).max(60),
  service_min_per_50_books: z.number().int().min(0).max(30),
  default_start_time: time,
});
