import "server-only";

import { formatDayLabel, formatTimeLeft, toLiberiaLocal } from "@/lib/domain/availability";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Availability (spec §12). The member id always comes from the session; the database functions decide
 * eligibility, caps and pool membership. Other members' availability is never read here (BR-19).
 */

export type IneligibleReason = "ACCOUNT" | "NOT_VERIFIED" | "PHOTOS" | "NO_CASUAL_INTENT" | "NO_PASS";

export type MemberAvailability = {
  status: "UNAVAILABLE" | "AVAILABLE" | "PAUSED";
  startAt: string | null;
  endAt: string | null;
  inPool: boolean;
  reasons: IneligibleReason[];
  permission: "ANYONE" | "NOBODY";
  passUntil: string | null;
  maxWindowHours: number | null;
  maxLeadDays: number | null;
  /** The window starts later (Schedule). */
  scheduled: boolean;
  /** Form defaults, computed once on the server (Liberia time): start in an hour, end in 3 hours. */
  suggestedStart: string;
  suggestedEnd: string;
  todayLabel: string;
  /** "5d 4h left" while a pass is active. */
  passTimeLeft: string | null;
};

export async function memberAvailability(userId: string): Promise<MemberAvailability> {
  const { data, error } = await createAdminClient().rpc("member_availability", { p_user: userId });
  if (error || !data) throw new Error("availability unavailable");
  const d = data as {
    status: MemberAvailability["status"];
    start_at: string | null;
    end_at: string | null;
    in_pool: boolean;
    reasons: IneligibleReason[];
    permission: MemberAvailability["permission"];
    pass_until: string | null;
    max_window_hours: number | null;
    max_lead_days: number | null;
  };
  // A window that has ended reads as off, even before the tidy job records it (BR-18).
  const ended = !d.end_at;
  const now = Date.now();
  return {
    scheduled: !ended && d.start_at !== null && new Date(d.start_at).getTime() > now,
    suggestedStart: toLiberiaLocal(new Date(now + 3_600_000)),
    todayLabel: formatDayLabel(new Date(now)),
    passTimeLeft: d.pass_until ? formatTimeLeft(d.pass_until, new Date(now)) : null,
    suggestedEnd: toLiberiaLocal(new Date(now + Math.min(3, d.max_window_hours ?? 3) * 3_600_000)),
    status: ended ? "UNAVAILABLE" : d.status,
    startAt: d.start_at,
    endAt: d.end_at,
    inPool: d.in_pool,
    reasons: d.reasons ?? [],
    permission: d.permission,
    passUntil: d.pass_until,
    maxWindowHours: d.max_window_hours,
    maxLeadDays: d.max_lead_days,
  };
}

const CODES = [
  "NOT_ELIGIBLE",
  "END_REQUIRED",
  "START_IN_PAST",
  "END_BEFORE_START",
  "WINDOW_TOO_LONG",
  "TOO_FAR_AHEAD",
  "NO_WINDOW",
  "PASS_ENDS_FIRST",
  "TOO_MANY_CHANGES",
  "has no value",
] as const;
export type AvailabilityError = (typeof CODES)[number] | "UNKNOWN";

function code(message: string | undefined): AvailabilityError {
  return CODES.find((c) => message?.includes(c)) ?? "UNKNOWN";
}

export async function setWindow(userId: string, start: Date | null, end: Date): Promise<AvailabilityError | null> {
  const { error } = await createAdminClient().rpc("set_availability", {
    p_user: userId,
    p_start: start ? start.toISOString() : (null as unknown as string),
    p_end: end.toISOString(),
  });
  return error ? code(error.message) : null;
}

export async function pauseWindow(userId: string, paused: boolean): Promise<AvailabilityError | null> {
  const { error } = await createAdminClient().rpc("pause_availability", { p_user: userId, p_paused: paused });
  return error ? code(error.message) : null;
}

export async function leavePool(userId: string): Promise<void> {
  const { error } = await createAdminClient().rpc("leave_pool", { p_user: userId });
  if (error) throw new Error("leave pool failed");
}

export async function setRequestPermission(userId: string, permission: "ANYONE" | "NOBODY"): Promise<void> {
  const { error } = await createAdminClient().rpc("set_casual_message_permission", {
    p_user: userId,
    p_permission: permission,
  });
  if (error) throw new Error("permission update failed");
}

/** Daily tidy (cron): what is_in_pool() already enforces, recorded. */
export async function tidyAvailability(): Promise<number> {
  const { data, error } = await createAdminClient().rpc("tidy_availability");
  if (error) throw new Error("availability tidy failed");
  return Number(data ?? 0);
}

/** Daily tidy (cron): request expiry by time is enforced at query time (OD-24); this records it. */
export async function tidyRequests(): Promise<number> {
  const { data, error } = await createAdminClient().rpc("tidy_requests");
  if (error) throw new Error("request tidy failed");
  return Number(data ?? 0);
}
