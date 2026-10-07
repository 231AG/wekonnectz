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
  /** Latest verification selfie (spec §9). */
  verification: VerificationState;
};

export type VerificationState = "NOT_STARTED" | "PENDING" | "VERIFIED" | "REJECTED";

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
      verification: (["PENDING", "VERIFIED", "REJECTED"].includes(String(p.verification))
        ? p.verification
        : "NOT_STARTED") as VerificationState,
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
  review: "/onboarding/review",
} as const;

/** Where ACTIVE members land (Phase 6 replaces it with the real Home). */
export const MEMBER_HOME = "/home";

/** Where a signed-in member goes next: the first incomplete step (spec §10: resume where you left off). */
export function nextStepFor(
  member: Pick<Member, "hasDateOfBirth" | "onboarding"> & { role?: UserRole; status?: AccountStatus },
): string {
  if (member.role && member.role !== "USER") return "/admin";
  if (!member.hasDateOfBirth) return "/signup";
  if (!member.onboarding.rulesAccepted) return ONBOARDING_STEPS.rules;
  if (!member.onboarding.basicsDone) return ONBOARDING_STEPS.about;
  if (!member.onboarding.interestsBioDone) return ONBOARDING_STEPS.interests;
  // ACTIVE = verified with 3 approved photos (spec §10). A rejected photo later doesn't send them back.
  if (member.status === "ACTIVE") return MEMBER_HOME;
  if (!member.onboarding.photosDone) return ONBOARDING_STEPS.photos;
  const v = member.onboarding.verification;
  if (v === "NOT_STARTED" || v === "REJECTED") return ONBOARDING_STEPS.verify;
  return ONBOARDING_STEPS.review;
}

type StepKey = keyof typeof ONBOARDING_STEPS;

/** For a step page: the member may open this step only once every earlier step is done. */
export async function requireOnboardingStep(step: StepKey): Promise<Member> {
  const member = await requireMember();
  const order: StepKey[] = ["rules", "about", "interests", "photos", "verify", "review"];
  const next = nextStepFor(member);
  // ACTIVE members may revisit any step (editing their profile).
  const nextIndex =
    next === "/signup"
      ? -1
      : next === MEMBER_HOME
        ? order.length
        : order.findIndex((k) => ONBOARDING_STEPS[k] === next);
  if (nextIndex < order.indexOf(step)) redirect(next);
  return member;
}
