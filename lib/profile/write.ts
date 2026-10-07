import "server-only";

import { getDetectionTerms } from "@/lib/content/terms";
import { CONTACT_OR_PRICE_MESSAGE, detect, type DetectionMode } from "@/lib/domain/detection";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The ONLY way to write member profile text (spec §17, BR-31). Every field is checked by the
 * detection engine before the service-role database function runs, so no caller (onboarding now,
 * profile editing and admin tools later) can store unchecked text by forgetting a step.
 */

export type ProfileWriteError =
  | { kind: "content"; field: string; message: string }
  | { kind: "unavailable"; message: string }
  | { kind: "db"; code: string };

type Field = { name: string; value: string; mode: Extract<DetectionMode, "profile" | "name"> };

async function checkFields(fields: Field[]): Promise<ProfileWriteError | null> {
  let terms;
  try {
    terms = await getDetectionTerms();
  } catch {
    // Content is never stored unchecked.
    return { kind: "unavailable", message: "We can’t check your text right now. Please try again shortly." };
  }
  for (const f of fields) {
    if (f.value && detect(f.value, f.mode, terms).blocked) {
      return { kind: "content", field: f.name, message: CONTACT_OR_PRICE_MESSAGE };
    }
  }
  return null;
}

const DB_CODES = [
  "ACCOUNT_CANNOT_EDIT",
  "AGE_GATE_REQUIRED",
  "RULES_NOT_ACCEPTED",
  "BASICS_REQUIRED",
  "DOCUMENT_VERSION_MISMATCH",
  "NO_CURRENT_DOCUMENTS",
  "INVALID_AREA",
  "INVALID_DISPLAY_NAME",
  "INVALID_GENDER",
  "INTENT_REQUIRED",
  "INTERESTS_INVALID",
  "BIO_TOO_LONG",
] as const;

function dbError(message: string): ProfileWriteError {
  return { kind: "db", code: DB_CODES.find((c) => message.includes(c)) ?? "UNKNOWN" };
}

export async function writeAcceptedDocuments(userId: string, versions: Record<string, string>) {
  const { error } = await createAdminClient().rpc("accept_current_documents", {
    p_user_id: userId,
    p_versions: versions,
  });
  return error ? dbError(error.message) : null;
}

export async function writeProfileBasics(
  userId: string,
  input: {
    displayName: string;
    gender: "WOMAN" | "MAN";
    seeking: ("WOMAN" | "MAN")[];
    areaId: string;
    intentRelationship: boolean;
    intentCasual: boolean;
  },
): Promise<ProfileWriteError | null> {
  const blocked = await checkFields([{ name: "displayName", value: input.displayName, mode: "name" }]);
  if (blocked) return blocked;
  const { error } = await createAdminClient().rpc("save_profile_basics", {
    p_user_id: userId,
    p_display_name: input.displayName,
    p_gender: input.gender,
    p_seeking_genders: input.seeking,
    p_area_id: input.areaId,
    p_intent_relationship: input.intentRelationship,
    p_intent_casual: input.intentCasual,
  });
  return error ? dbError(error.message) : null;
}

export async function writeInterestsAndBio(
  userId: string,
  input: { interestIds: string[]; bio: string },
): Promise<ProfileWriteError | null> {
  const blocked = await checkFields([{ name: "bio", value: input.bio, mode: "profile" }]);
  if (blocked) return blocked;
  const { error } = await createAdminClient().rpc("save_interests_and_bio", {
    p_user_id: userId,
    p_interest_ids: input.interestIds,
    p_bio: input.bio,
  });
  return error ? dbError(error.message) : null;
}
