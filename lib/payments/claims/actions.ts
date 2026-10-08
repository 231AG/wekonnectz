"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireMember } from "@/lib/auth/session";
import { checkLiberianPhone } from "@/lib/domain/phone";
import { cancelClaim, evidenceUploadUrl, replyToClaim, submitClaim, type ClaimError } from "@/lib/storage/payments";
import { claimSchema, replySchema } from "@/lib/validation/payments";

/**
 * Mobile money claims (spec §16). The member id comes from the session; submit_payment_claim()
 * re-checks everything (account, plan, wallet, format, duplicates, pending limit, BR-41). Phone
 * numbers and transaction IDs are never logged.
 */

export type ClaimFormState = { error?: string; field?: string };

const MESSAGES: Record<string, string> = {
  ACCOUNT_CANNOT_PAY: "Your account can’t buy a pass right now.",
  PLAN_NOT_AVAILABLE: "That plan isn’t available any more. Choose another.",
  PROVIDER_NOT_AVAILABLE: "Payments with that wallet aren’t available right now.",
  CARD_SUBSCRIPTION_ACTIVE: "You already have an active card subscription.",
  TOO_MANY_PENDING: "You already have payments waiting for review. Wait for them to be checked first.",
  INVALID_TRANSACTION_ID:
    "That doesn’t look like a transaction ID from this wallet. Copy it exactly from your payment message.",
  INVALID_SENDER: "Enter the Liberian number you paid from.",
  INVALID_PAID_AT: "Enter when you paid.",
  EVIDENCE_REQUIRED: "Add a screenshot of your payment.",
  TRANSACTION_ALREADY_CLAIMED: "This transaction ID has already been submitted.",
  CLAIM_NOT_OPEN: "This payment has already been reviewed.",
  REPLY_REQUIRED: "Write an answer or add a new screenshot.",
  NOTE_TOO_LONG: "Use 500 characters or fewer.",
  NOT_AN_IMAGE: "That screenshot isn’t an image we can use. Use a JPG, PNG or WebP screenshot.",
  TOO_LARGE: "That screenshot is too big. Use one under 10 MB.",
  TOO_SMALL: "That screenshot is too small to read. Take a full-screen screenshot.",
  storage: "The screenshot didn’t upload. Check your connection and try again.",
};
const GENERIC = "Something went wrong. Try again.";

function messageFor(e: ClaimError): string {
  if (e.kind === "rejected") return MESSAGES[e.reason] ?? GENERIC;
  if (e.kind === "storage") return MESSAGES.storage;
  return MESSAGES[e.code] ?? GENERIC;
}

/** A one-off upload URL for the payment screenshot. */
export async function prepareEvidenceUpload(): Promise<{ evidenceId?: string; uploadUrl?: string; error?: string }> {
  const member = await requireMember();
  const slot = await evidenceUploadUrl(member.id);
  return slot ? { evidenceId: slot.evidenceId, uploadUrl: slot.url } : { error: MESSAGES.storage };
}

export async function submitPaymentClaim(
  input: Record<keyof z.input<typeof claimSchema>, string>,
): Promise<ClaimFormState> {
  const member = await requireMember();
  const parsed = claimSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue?.message ?? GENERIC, field: String(issue?.path[0] ?? "") };
  }
  const phone = checkLiberianPhone(parsed.data.senderPhone);
  if (!phone.ok) return { error: MESSAGES.INVALID_SENDER, field: "senderPhone" };
  const result = await submitClaim(member.id, {
    ...parsed.data,
    senderPhone: phone.e164,
    paidAt: new Date(`${parsed.data.paidAt}:00Z`).toISOString(),
  });
  if ("error" in result) return { error: messageFor(result.error) };
  revalidatePath("/me/payments");
  redirect("/me/payments?submitted=1");
}

export async function replyToPaymentClaim(input: z.input<typeof replySchema>): Promise<ClaimFormState> {
  const member = await requireMember();
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? GENERIC };
  const error = await replyToClaim(
    member.id,
    parsed.data.claimId,
    parsed.data.note || null,
    parsed.data.evidenceId ?? null,
  );
  if (error) return { error: messageFor(error) };
  revalidatePath("/me/payments");
  return {};
}

export async function cancelPaymentClaim(formData: FormData): Promise<void> {
  const member = await requireMember();
  const parsed = z.uuid().safeParse(formData.get("claimId"));
  if (!parsed.success) return;
  await cancelClaim(member.id, parsed.data);
  revalidatePath("/me/payments");
}
