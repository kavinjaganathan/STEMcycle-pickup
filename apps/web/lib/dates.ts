/** Today's date (YYYY-MM-DD) in the given IANA timezone. */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive list of dates whose weekday (0 = Sunday) is in `weekdays`. */
export function datesBetween(from: string, to: string, weekdays: number[]): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (weekdays.includes(new Date(`${d}T00:00:00Z`).getUTCDay())) out.push(d);
  }
  return out;
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/** The Saturday of the weekend to show: today if it's a weekend day, else the next one. */
export function currentWeekend(today: string): string {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  if (dow === 6) return today;
  if (dow === 0) return addDays(today, -1);
  return addDays(today, 6 - dow);
}
