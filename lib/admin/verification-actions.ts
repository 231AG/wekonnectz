"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { VERIFICATION_REASON_KEYS } from "@/lib/verification/reasons";

export type VerificationReviewState = { error?: string };

const schema = z.discriminatedUnion("decision", [
  z.object({ verificationId: z.uuid(), decision: z.literal("approve") }),
  z.object({ verificationId: z.uuid(), decision: z.literal("reject"), reason: z.enum(VERIFICATION_REASON_KEYS) }),
]);

const DB_MESSAGES: Record<string, string> = {
  VERIFICATION_NOT_PENDING: "Already decided by someone else.",
  ADMIN_REQUIRED: "This one is escalated: an admin must decide it.",
  OWN_CONTENT: "You can’t review your own account.",
};

/**
 * Verification decision (spec §21). Runs as the staff session: review_verification() checks
 * is_staff() (ADMIN for escalated ones), writes the audit row, notifies the member and recomputes
 * the account in one transaction.
 */
export async function reviewVerificationAction(
  _prev: VerificationReviewState,
  formData: FormData,
): Promise<VerificationReviewState> {
  await requireStaff();
  const parsed = schema.safeParse({
    verificationId: formData.get("verificationId"),
    decision: formData.get("decision"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) {
    return { error: formData.get("decision") === "reject" ? "Choose a reason to reject." : "Something went wrong." };
  }
  const { error } = await (
    await createClient()
  ).rpc("review_verification", {
    p_verification_id: parsed.data.verificationId,
    p_approve: parsed.data.decision === "approve",
    p_reason: parsed.data.decision === "reject" ? parsed.data.reason : undefined,
  });
  if (error) {
    const code = Object.keys(DB_MESSAGES).find((c) => error.message.includes(c));
    return { error: code ? DB_MESSAGES[code] : "Couldn’t save. Try again." };
  }
  revalidatePath("/admin");
  redirect("/admin/verification");
}
