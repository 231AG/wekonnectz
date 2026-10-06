/**
 * Age rules (BR-4). Pure: no Next.js or Supabase imports.
 * Dates are calendar dates (YYYY-MM-DD). Liberia is UTC+0, so "today" is taken in UTC.
 */

export const MINIMUM_AGE = 18;

export type CalendarDate = { year: number; month: number; day: number };

/** Parses day/month/year form fields into a real calendar date, or null if it doesn't exist. */
export function parseDateParts(day: string, month: string, year: string): CalendarDate | null {
  if (!/^\d{1,2}$/.test(day.trim()) || !/^\d{1,2}$/.test(month.trim()) || !/^\d{4}$/.test(year.trim())) return null;
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (m < 1 || m > 12 || d < 1) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return { year: y, month: m, day: d };
}

export function todayUtc(now: Date = new Date()): CalendarDate {
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() };
}

/** Whole years between `dob` and `on`. A 29 February birthday turns a year older on 1 March in non-leap years. */
export function ageOn(dob: CalendarDate, on: CalendarDate): number {
  let age = on.year - dob.year;
  if (on.month < dob.month || (on.month === dob.month && on.day < dob.day)) age -= 1;
  return age;
}

export type AgeCheck =
  { ok: true; dob: CalendarDate } | { ok: false; reason: "INVALID_DATE" | "UNDER_18" | "IMPLAUSIBLE" };

/** BR-4: 18 or older. Also refuses future dates and ages over 120 (typos). */
export function checkAdult(day: string, month: string, year: string, now: Date = new Date()): AgeCheck {
  const dob = parseDateParts(day, month, year);
  if (!dob) return { ok: false, reason: "INVALID_DATE" };
  const age = ageOn(dob, todayUtc(now));
  if (age < 0 || age > 120) return { ok: false, reason: age < 0 ? "UNDER_18" : "IMPLAUSIBLE" };
  if (age < MINIMUM_AGE) return { ok: false, reason: "UNDER_18" };
  return { ok: true, dob };
}

export function toIsoDate(d: CalendarDate): string {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}
