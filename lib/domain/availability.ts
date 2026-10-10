/**
 * Availability windows (spec §12). Pure: no Next.js or Supabase imports. The database
 * (set_availability) is the final gate; these mirror its checks so the form can explain problems.
 */

export type WindowError = "END_REQUIRED" | "START_IN_PAST" | "END_BEFORE_START" | "WINDOW_TOO_LONG" | "TOO_FAR_AHEAD";

/** Liberia is on GMT all year: a `datetime-local` value ("2026-10-10T21:30") is read as UTC. */
export function parseLiberiaLocal(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The `datetime-local` value for a time, in Liberia (GMT). */
export function toLiberiaLocal(d: Date): string {
  return d.toISOString().slice(0, 16);
}

/** BR-18 / OD-8: same rules as set_availability(). Caps null = not set yet (the server refuses). */
export function checkWindow(
  start: Date | null,
  end: Date | null,
  now: Date,
  caps: { maxWindowHours: number | null; maxLeadDays: number | null },
): WindowError | null {
  if (!end) return "END_REQUIRED";
  const from = start ?? now;
  if (from.getTime() < now.getTime() - 5 * 60_000) return "START_IN_PAST";
  const effective = from.getTime() < now.getTime() ? now : from;
  if (end.getTime() <= effective.getTime()) return "END_BEFORE_START";
  if (caps.maxWindowHours !== null && end.getTime() - effective.getTime() > caps.maxWindowHours * 3_600_000) {
    return "WINDOW_TOO_LONG";
  }
  if (caps.maxLeadDays !== null && effective.getTime() > now.getTime() + caps.maxLeadDays * 86_400_000) {
    return "TOO_FAR_AHEAD";
  }
  return null;
}

/** "11:00 PM" today, or "Sat 10 Oct, 11:00 PM" on another day (GMT). */
export function formatWindowTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  if (d.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)) return time;
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${day}, ${time}`;
}

/** "12 hours", "1 hour", "90 minutes". */
export function formatHours(hours: number): string {
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/** "Sat 10 Oct" (GMT), as in the mock-up's "Today, Sun 4 Oct". */
export function formatDayLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * "Available now … until 11:00 PM": the next time that clock time comes round (later today, or
 * tomorrow if it has already passed), Liberia time. Null for a time that passed in the last 5 minutes.
 */
export function endFromClockTime(value: string | null | undefined, now: Date): Date | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value ?? "");
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  const end = new Date(now);
  end.setUTCHours(Number(m[1]), Number(m[2]), 0, 0);
  // A time that passed only moments ago (the form was open a while) is a mistake, not "tomorrow".
  if (end.getTime() <= now.getTime() && now.getTime() - end.getTime() <= 5 * 60_000) return null;
  if (end.getTime() <= now.getTime()) end.setUTCDate(end.getUTCDate() + 1);
  return end;
}

/** Available Now "window" filter (§13): members available until at least this time. */
export function windowFilterUntil(choice: "any" | "2h" | "tonight" | undefined, now: Date): Date | undefined {
  if (choice === "2h") return new Date(now.getTime() + 2 * 3_600_000);
  if (choice === "tonight") {
    const tonight = new Date(now);
    tonight.setUTCHours(22, 0, 0, 0);
    return tonight.getTime() > now.getTime() ? tonight : new Date(now.getTime() + 3_600_000);
  }
  return undefined;
}

/** "5d 4h left", "3h 20m left", "12m left". */
export function formatTimeLeft(untilIso: string, now: Date): string {
  const mins = Math.max(0, Math.floor((new Date(untilIso).getTime() - now.getTime()) / 60_000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}
