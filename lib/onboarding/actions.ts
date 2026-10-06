"use server";

import { redirect } from "next/navigation";

import { getDetectionTerms } from "@/lib/content/terms";
import { CONTACT_OR_PRICE_MESSAGE, detect } from "@/lib/domain/detection";
import { nextStepFor, requireMember } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { basicsSchema, fieldErrors, interestsBioSchema, rulesSchema } from "@/lib/validation/onboarding";

/**
 * Onboarding steps 4–8 (spec §10). Each action: authenticate → validate (Zod) → content checks
 * (BR-31) → call a service-role database function with the member's own id. The database
 * re-checks the account and every rule it can. Members cannot call those functions directly.
 */

export type StepState = { errors?: Record<string, string>; values?: Record<string, string | string[]> };

const GENERIC = "Something went wrong. Try again.";

async function goToNextStep(memberId: string) {
  // Re-read progress after the write so the redirect reflects the database.
  const member = await requireMember();
  if (member.id !== memberId) redirect("/login");
  redirect(nextStepFor(member));
}

export async function acceptRules(_prev: StepState, formData: FormData): Promise<StepState> {
  const member = await requireMember();
  const parsed = rulesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { RULES, TERMS, PRIVACY } = parsed.data;
  const { error } = await createAdminClient().rpc("accept_current_documents", {
    p_user_id: member.id,
    p_versions: { RULES, TERMS, PRIVACY },
  });
  if (error) {
    if (error.message.includes("DOCUMENT_VERSION_MISMATCH")) {
      return { errors: { form: "The rules were just updated. Please read them again and agree." } };
    }
    return { errors: { form: GENERIC } };
  }
  await goToNextStep(member.id);
  return {};
}

export async function saveBasics(_prev: StepState, formData: FormData): Promise<StepState> {
  const member = await requireMember();
  const values = {
    displayName: String(formData.get("displayName") ?? ""),
    gender: String(formData.get("gender") ?? ""),
    seeking: formData.getAll("seeking").map(String),
    areaId: String(formData.get("areaId") ?? ""),
    intent: String(formData.get("intent") ?? ""),
  };
  const parsed = basicsSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  // BR-31: no contact details or prices in the display name either.
  if (detect(parsed.data.displayName, "profile", await getDetectionTerms()).blocked) {
    return { errors: { displayName: CONTACT_OR_PRICE_MESSAGE }, values };
  }

  const { intent } = parsed.data;
  const { error } = await createAdminClient().rpc("save_profile_basics", {
    p_user_id: member.id,
    p_display_name: parsed.data.displayName,
    p_gender: parsed.data.gender,
    p_seeking_genders: parsed.data.seeking,
    p_area_id: parsed.data.areaId,
    p_intent_relationship: intent === "RELATIONSHIP" || intent === "BOTH",
    p_intent_casual: intent === "CASUAL" || intent === "BOTH",
  });
  if (error) {
    if (error.message.includes("INVALID_AREA")) return { errors: { areaId: "Choose your community." }, values };
    if (error.message.includes("RULES_NOT_ACCEPTED")) redirect(nextStepFor(member));
    return { errors: { form: GENERIC }, values };
  }
  await goToNextStep(member.id);
  return {};
}

export async function saveInterestsBio(_prev: StepState, formData: FormData): Promise<StepState> {
  const member = await requireMember();
  const values = {
    interestIds: formData.getAll("interestIds").map(String),
    bio: String(formData.get("bio") ?? ""),
  };
  const parsed = interestsBioSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  // BR-31: bios containing contact details or prices are rejected with a neutral message (§17).
  if (detect(parsed.data.bio, "profile", await getDetectionTerms()).blocked) {
    return { errors: { bio: CONTACT_OR_PRICE_MESSAGE }, values };
  }

  const { error } = await createAdminClient().rpc("save_interests_and_bio", {
    p_user_id: member.id,
    p_interest_ids: parsed.data.interestIds,
    p_bio: parsed.data.bio,
  });
  if (error) {
    if (error.message.includes("INTERESTS_INVALID")) {
      return { errors: { interestIds: "Choose at least 3 interests from the list." }, values };
    }
    if (error.message.includes("BASICS_REQUIRED")) redirect(nextStepFor(member));
    return { errors: { form: GENERIC }, values };
  }
  await goToNextStep(member.id);
  return {};
}
