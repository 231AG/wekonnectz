import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type AccountStatus = Database["public"]["Enums"]["account_status"];
type UserRole = Database["public"]["Enums"]["user_role"];

export type OnboardingProgress = {
  rulesAccepted: boolean;
  basicsDone: boolean;
  interestsBioDone: boolean;
  /** 3 photos uploaded and none of them rejected (spec §10 step 9). */
  photosDone: boolean;
};

export type Member = {
  id: string;
  role: UserRole;
  /** Effective status: an expired suspension reads as ACTIVE (BR-5). */
  status: AccountStatus;
  hasDateOfBirth: boolean;
  onboarding: OnboardingProgress;
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

  const [{ data: row }, { data: status }, { data: progress }] = await Promise.all([
    supabase.from("users").select("id, role").eq("id", user.id).maybeSingle(),
    supabase.rpc("current_user_status"),
    supabase.rpc("onboarding_progress"),
  ]);
  if (!row || !status) return null;

  const p = (progress ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    role: row.role,
    status,
    hasDateOfBirth: p.has_dob === true,
    onboarding: {
      rulesAccepted: p.rules_accepted === true,
      basicsDone: p.basics_done === true,
      interestsBioDone: p.interests_bio_done === true,
      photosDone: p.photos_done === true,
    },
  };
}

/** For member pages and actions: signed in and allowed a session, or redirected. */
export async function requireMember(): Promise<Member> {
  const member = await getMember();
  if (!member) redirect("/login");
  // Server Components can't change cookies, so the sign-out happens in a route handler.
  if (!canHoldSession(member.status)) redirect("/auth/signout?notice=unavailable");
  // Spec §7: staff use separate accounts and never the member app.
  if (member.role !== "USER") redirect("/admin");
  return member;
}

export const ONBOARDING_STEPS = {
  rules: "/onboarding/rules",
  about: "/onboarding/about",
  interests: "/onboarding/interests",
  photos: "/onboarding/photos",
  verify: "/onboarding/verify",
} as const;

/** Where a signed-in member goes next: the first incomplete step (spec §10: resume where you left off). */
export function nextStepFor(member: Pick<Member, "hasDateOfBirth" | "onboarding"> & { role?: UserRole }): string {
  if (member.role && member.role !== "USER") return "/admin";
  if (!member.hasDateOfBirth) return "/signup";
  if (!member.onboarding.rulesAccepted) return ONBOARDING_STEPS.rules;
  if (!member.onboarding.basicsDone) return ONBOARDING_STEPS.about;
  if (!member.onboarding.interestsBioDone) return ONBOARDING_STEPS.interests;
  if (!member.onboarding.photosDone) return ONBOARDING_STEPS.photos;
  // Selfie and review arrive in Phase 4.
  return ONBOARDING_STEPS.verify;
}

type StepKey = keyof typeof ONBOARDING_STEPS;

/** For a step page: the member may open this step only once every earlier step is done. */
export async function requireOnboardingStep(step: StepKey): Promise<Member> {
  const member = await requireMember();
  const order: StepKey[] = ["rules", "about", "interests", "photos", "verify"];
  const next = nextStepFor(member);
  const nextIndex = next === "/signup" ? -1 : order.findIndex((k) => ONBOARDING_STEPS[k] === next);
  if (nextIndex < order.indexOf(step)) redirect(next);
  return member;
}
