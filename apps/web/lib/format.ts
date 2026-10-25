import type { Slot, TextbookType } from "@/lib/shared";

/** Slot dates/times are already in the org's local time; format without shifting. */
export function formatSlotDate(date: string, weekday: "long" | "short" = "long"): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday,
    month: weekday === "long" ? "long" : "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 && h < 24 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "9 AM" for hour 9, "12 PM" for 12. */
export function formatHour(hour: number): string {
  return formatTime(`${hour}:00`);
}

/** "10 – 11 AM", "11 AM – 12 PM". */
export function formatHourRange(start: number, end = start + 1): string {
  const a = formatHour(start);
  const b = formatHour(end);
  const same = (start < 12) === (end < 12 || end === 24) && end !== 12;
  return same ? `${a.replace(/ (AM|PM)$/, "")} – ${b}` : `${a} – ${b}`;
}

export function formatSlot(slot: Slot): string {
  return `${formatSlotDate(slot.slot_date)}, ${formatHourRange(slot.hour)}`;
}

/** Groups sorted hours into contiguous blocks: [9,10,11,14] -> [[9,12],[14,15]]. */
export function hourBlocks(hours: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const h of [...hours].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && last[1] === h) last[1] = h + 1;
    else out.push([h, h + 1]);
  }
  return out;
}

export function formatBlocks(hours: number[]): string {
  return hourBlocks(hours)
    .map(([a, b]) => formatHourRange(a, b))
    .join(", ");
}

export const TEXTBOOK_LABEL: Record<TextbookType, string> = {
  elementary: "Elementary",
  middle_school: "Middle School",
  high_school: "High School",
  college: "College/University",
  other: "Other",
};
