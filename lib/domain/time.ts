/** "just now", "12 min ago", "3 h ago", "2 days ago" — for queues (oldest first). */
export function timeAgo(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "";
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

/** True while now is within [startsAt, expiresAt). */
export function isRunningNow(startsAt: string, expiresAt: string, now: Date = new Date()): boolean {
  return new Date(startsAt) <= now && new Date(expiresAt) > now;
}
