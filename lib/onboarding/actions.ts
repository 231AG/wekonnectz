"use server";

import { redirect } from "next/navigation";

import { nextStepFor, requireMember } from "@/lib/auth/session";
import type { StepState } from "@/lib/onboarding/types";
import {
  type ProfileWriteError,
  writeAcceptedDocuments,
  writeInterestsAndBio,
  writeProfileBasics,
} from "@/lib/profile/write";
import { basicsSchema, fieldErrors, interestsBioSchema, rulesSchema } from "@/lib/validation/onboarding";

/**
 * Onboarding steps 4–8 (spec §10). Each action: authenticate → validate (Zod) → write through
 * lib/profile/write (content checks, BR-31) → a service-role database function with the member's
 * own id from the session. The database re-checks the account and every rule it can.
 */

const MESSAGES: Record<string, string> = {
  ACCOUNT_CANNOT_EDIT: "Your account is restricted right now, so your profile can’t be changed.",
  DOCUMENT_VERSION_MISMATCH: "The rules were just updated. Please read them again and agree.",
  NO_CURRENT_DOCUMENTS: "The rules aren’t published yet. Please try again later.",
  INVALID_AREA: "Choose your community.",
  INTERESTS_INVALID: "Choose at least 3 interests from the list.",
};
const GENERIC = "Something went wrong. Try again.";

async function goToNextStep(memberId: string): Promise<never> {
  // Re-read progress after the write so the redirect reflects the database.
  const member = await requireMember();
  if (member.id !== memberId) redirect("/login");
  redirect(nextStepFor(member));
}

/** Maps a write error to form errors; step-order errors send the member to the right step. */
async function handleWriteError(error: ProfileWriteError, values?: StepState["values"]): Promise<StepState> {
  if (error.kind === "content") return { errors: { [error.field]: error.message }, values };
  if (error.kind === "unavailable") return { errors: { form: error.message }, values };
  if (["RULES_NOT_ACCEPTED", "BASICS_REQUIRED", "AGE_GATE_REQUIRED"].includes(error.code)) {
    redirect(nextStepFor(await requireMember()));
  }
  const field = error.code === "INVALID_AREA" ? "areaId" : error.code === "INTERESTS_INVALID" ? "interestIds" : "form";
  return { errors: { [field]: MESSAGES[error.code] ?? GENERIC }, values };
}

export async function acceptRules(_prev: StepState, formData: FormData): Promise<StepState> {
  const member = await requireMember();
  const parsed = rulesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    // Missing or altered hidden version fields: reload the page with the current rules.
    if (!errors.agree) return { errors: { form: MESSAGES.DOCUMENT_VERSION_MISMATCH } };
    return { errors: { agree: errors.agree } };
  }

  const { RULES, TERMS, PRIVACY } = parsed.data;
  const error = await writeAcceptedDocuments(member.id, { RULES, TERMS, PRIVACY });
  if (error) return handleWriteError(error);
  return goToNextStep(member.id);
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

  const { intent } = parsed.data;
  const error = await writeProfileBasics(member.id, {
    displayName: parsed.data.displayName,
    gender: parsed.data.gender,
    seeking: parsed.data.seeking,
    areaId: parsed.data.areaId,
    intentRelationship: intent === "RELATIONSHIP" || intent === "BOTH",
    intentCasual: intent === "CASUAL" || intent === "BOTH",
  });
  if (error) return handleWriteError(error, values);
  return goToNextStep(member.id);
}

export async function saveInterestsBio(_prev: StepState, formData: FormData): Promise<StepState> {
  const member = await requireMember();
  const values = {
    interestIds: formData.getAll("interestIds").map(String),
    bio: String(formData.get("bio") ?? ""),
  };
  const parsed = interestsBioSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const error = await writeInterestsAndBio(member.id, parsed.data);
  if (error) return handleWriteError(error, values);
  return goToNextStep(member.id);
}
