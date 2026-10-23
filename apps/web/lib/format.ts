import type { SlotWindow } from "@/lib/db/repo";

/** Slot dates/times are already in the org's local time; format without shifting. */
export function formatSlotDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatWindow(slot: Pick<SlotWindow, "start_time" | "end_time">): string {
  return `${formatTime(slot.start_time)} – ${formatTime(slot.end_time)}`;
}

export function formatSlot(slot: SlotWindow): string {
  return `${formatSlotDate(slot.slot_date)}, ${formatWindow(slot)}`;
}
