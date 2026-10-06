import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type AccountStatus = Database["public"]["Enums"]["account_status"];
type UserRole = Database["public"]["Enums"]["user_role"];

export type Member = {
  id: string;
  role: UserRole;
  /** Effective status: an expired suspension reads as ACTIVE (BR-5). */
  status: AccountStatus;
  hasDateOfBirth: boolean;
};

/** Statuses that may hold a session at all (BR-6, BR-7). */
export function canHoldSession(status: AccountStatus): boolean {
  return status !== "BANNED" && status !== "DELETED";
}

/**
 * The signed-in member, read from the database on every call (BR-30) — never from client state.
 * Returns null when signed out or when the auth user has no users row.
 */
export async function getMember(): Promise<Member | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: row }, { data: status }, { count }] = await Promise.all([
    supabase.from("users").select("id, role").eq("id", user.id).maybeSingle(),
    supabase.rpc("current_user_status"),
    supabase.from("profiles").select("user_id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  if (!row || !status) return null;

  return { id: row.id, role: row.role, status, hasDateOfBirth: (count ?? 0) > 0 };
}

/** For member pages and actions: signed in and allowed a session, or redirected. */
export async function requireMember(): Promise<Member> {
  const member = await getMember();
  if (!member) redirect("/login");
  // Server Components can't change cookies, so the sign-out happens in a route handler.
  if (!canHoldSession(member.status)) redirect("/auth/signout?notice=unavailable");
  return member;
}

/** Where a signed-in member goes next. Onboarding steps 4+ arrive in Phase 2. */
export function nextStepFor(member: Member): string {
  if (!member.hasDateOfBirth) return "/signup";
  return "/onboarding";
}
