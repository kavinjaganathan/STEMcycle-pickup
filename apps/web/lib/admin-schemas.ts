import { z } from "zod";
import { PICKUP_STATUSES } from "@/lib/shared";
import { DATE_RE, TIME_RE } from "@/lib/dates";

const date = z.string().regex(DATE_RE, "Use YYYY-MM-DD.");
const text = (max: number) => z.string().trim().min(1, "Required.").max(max);
const int = (min: number, max: number) => z.number().int().min(min).max(max);

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

export const updateDriverSchema = z.object({
  status: z.enum(["pending", "active", "disabled"]),
  capacity_boxes: int(1, 200),
});

export const settingsSchema = z
  .object({
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
    email_display_name: text(80),
    reply_to: z.union([z.literal(""), z.email()]).nullable(),
    retention_days: int(7, 3650),
    booking_weekends: int(1, 12),
    sat_hours: z.array(int(0, 23)).max(24),
    sun_hours: z.array(int(0, 23)).max(24),
    slot_limit: int(1, 100),
    lock_time: z.string().regex(TIME_RE, "Use HH:MM."),
    books_per_box: int(1, 200),
    service_min_base: int(0, 60),
    service_min_per_50_books: int(0, 30),
    max_route_min: int(30, 720),
    return_buffer_min: int(0, 180),
    depot_name: text(60),
    depot_address: z.string().trim().max(200),
    depot_lat: z.number().min(-90).max(90).nullable(),
    depot_lng: z.number().min(-180).max(180).nullable(),
  })
  .refine((s) => s.sat_hours.length + s.sun_hours.length > 0, {
    message: "Choose at least one pickup time.",
    path: ["sat_hours"],
  });

/** A weekend is identified by its Saturday. */
export const weekendParam = z
  .string()
  .regex(DATE_RE)
  .refine((d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 6, "Must be a Saturday.");
