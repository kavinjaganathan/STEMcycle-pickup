/** Types and constants shared by the browser and the server. */

/** A 1-hour pickup slot on a Saturday or Sunday, in the org's local time. */
export type Slot = {
  slot_date: string; // YYYY-MM-DD
  hour: number; // 0-23; the slot runs hour:00 - hour+1:00
};

export type AvailableSlot = Slot & { remaining: number };

export const TEXTBOOK_TYPES = [
  "elementary",
  "middle_school",
  "high_school",
  "college",
  "other",
] as const;
export type TextbookType = (typeof TEXTBOOK_TYPES)[number];

export type PickupStatus = "pending" | "scheduled" | "picked_up" | "cancelled";
export type GeocodeStatus = "pending" | "ok" | "needs_review" | "failed";
export const PICKUP_STATUSES: PickupStatus[] = ["pending", "scheduled", "picked_up", "cancelled"];
