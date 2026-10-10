/** Display helpers for plans and payments. Pure: no Next.js or Supabase imports. */

/** OD-2: USD only. "$5.00". */
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** Plan length for people: "24 hours", "7 days", "30 days". */
export function formatDuration(hours: number): string {
  if (hours % 24 !== 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = hours / 24;
  return days === 1 ? "24 hours" : `${days} days`;
}

/** Liberia is on GMT all year, so times are shown and entered in UTC. */
export function formatLiberiaTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}`;
}

/** Card billing period for people: "week", "month", or "10 days". */
export function formatBillingPeriod(hours: number): string {
  if (hours === 168) return "week";
  if (hours === 720) return "month";
  return formatDuration(hours);
}
