"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { StaffActionState } from "@/lib/admin/report-actions";
import { requireStaff } from "@/lib/auth/staff";
import { signEvidence } from "@/lib/storage/payments";
import { createClient } from "@/lib/supabase/server";

/**
 * Payment claims queue (spec §16, §21). ADMIN and above, with TOTP; the database checks the same
 * (is_staff('ADMIN')), refuses the reviewer's own account, and writes the audit row in the same
 * transaction. approve_payment_claim() is the only way mobile money access is created (§6 rule 11).
 */

const REASONS = [
  "TRANSACTION_NOT_FOUND",
  "AMOUNT_MISMATCH",
  "ALREADY_USED",
  "DETAILS_DO_NOT_MATCH",
  "EVIDENCE_UNCLEAR",
] as const;

const DB_MESSAGES: Record<string, string> = {
  ADMIN_REQUIRED: "Only an admin can decide payments.",
  OWN_CONTENT: "You can’t review your own account.",
  CLAIM_NOT_FOUND: "This claim doesn’t exist.",
  CLAIM_NOT_PENDING: "This claim was already decided or is waiting for the member.",
  EVIDENCE_NOT_VIEWED: "Open the screenshot before approving.",
  AMOUNT_MISMATCH: "The wallet amount doesn’t equal the price the member was shown. Reject it (refund manually).",
  TRANSACTION_ALREADY_APPROVED: "This transaction ID was already approved.",
  CARD_SUBSCRIPTION_ACTIVE: "The member has an active card subscription.",
  MEMBER_NOT_AVAILABLE: "The member’s account is banned or deleted. Reject and refund.",
  REASON_REQUIRED: "Choose a reason.",
  QUESTION_REQUIRED: "Write a question (up to 300 characters).",
};

function fail(message: string): StaffActionState {
  const code = Object.keys(DB_MESSAGES).find((c) => message.includes(c));
  return { error: code ? DB_MESSAGES[code] : "Couldn’t save. Try again." };
}

function done(ok: string): StaffActionState {
  revalidatePath("/admin", "layout");
  return { ok };
}

/** Records EVIDENCE_VIEWED (audit) and returns a 120-second signed URL for the screenshot. */
export async function openClaimEvidence(claimId: string): Promise<{ url?: string; error?: string }> {
  await requireStaff("ADMIN");
  const parsed = z.uuid().safeParse(claimId);
  if (!parsed.success) return { error: "Not found." };
  const { error } = await (await createClient()).rpc("log_evidence_view", { p_claim: parsed.data });
  if (error) return fail(error.message);
  const url = await signEvidence(parsed.data);
  return url ? { url } : { error: "The screenshot isn’t available." };
}

const CHECKS = ["foundInWallet", "amountMatches", "senderMatches", "timeMatches"] as const;

export async function approveClaimAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  await requireStaff("ADMIN");
  const parsed = z
    .object({ claimId: z.uuid(), walletAmount: z.coerce.number().positive().multipleOf(0.01) })
    .safeParse({ claimId: formData.get("claimId"), walletAmount: formData.get("walletAmount") });
  // BR-38: approve only after finding the transaction in the merchant wallet's own records.
  if (!CHECKS.every((c) => formData.get(c) === "on")) {
    return { error: "Tick every check — approve only after finding the payment in the wallet records." };
  }
  if (!parsed.success) return { error: "Enter the amount shown in the wallet record." };
  const { error } = await (
    await createClient()
  ).rpc("approve_payment_claim", { p_claim: parsed.data.claimId, p_wallet_amount: parsed.data.walletAmount });
  return error ? fail(error.message) : done("Approved. The member’s pass has started.");
}

export async function rejectClaimAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  await requireStaff("ADMIN");
  const parsed = z
    .object({ claimId: z.uuid(), reason: z.enum(REASONS, { error: "Choose a reason." }) })
    .safeParse({ claimId: formData.get("claimId"), reason: formData.get("reason") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Choose a reason." };
  const { error } = await (
    await createClient()
  ).rpc("reject_payment_claim", {
    p_claim: parsed.data.claimId,
    p_reason: parsed.data.reason,
  });
  return error ? fail(error.message) : done("Rejected. The member has been told.");
}

export async function needsInfoAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  await requireStaff("ADMIN");
  const parsed = z
    .object({ claimId: z.uuid(), question: z.string().trim().min(1).max(300) })
    .safeParse({ claimId: formData.get("claimId"), question: formData.get("question") });
  if (!parsed.success) return { error: DB_MESSAGES.QUESTION_REQUIRED };
  const { error } = await (
    await createClient()
  ).rpc("request_claim_info", {
    p_claim: parsed.data.claimId,
    p_question: parsed.data.question,
  });
  return error ? fail(error.message) : done("Question sent to the member.");
}
