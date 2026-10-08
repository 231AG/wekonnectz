import type { Database } from "@/lib/supabase/database.types";

type ClaimStatus = Database["public"]["Enums"]["claim_status"];
type RejectionReason = Database["public"]["Enums"]["claim_rejection_reason"];

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  PENDING_REVIEW: "Checking",
  NEEDS_INFO: "We need more information",
  APPROVED: "Approved",
  REJECTED: "Not approved",
  CANCELLED: "Withdrawn",
};

/** OD-16 (owner 2026-10-08). */
export const REVIEW_TIME_TEXT = "We usually verify payments within 24 hours.";

/**
 * What the member reads (§17: neutral, never which check failed). OD-17: a wrong amount is refunded
 * manually, so that one case says so.
 */
export function memberRejectionText(reason: RejectionReason | null): string {
  if (reason === "AMOUNT_MISMATCH") {
    return "The amount didn’t match the plan price. We’ll refund it to the number you paid from. Pay the exact amount and submit again.";
  }
  return "We couldn’t verify this payment. Check the transaction ID and screenshot, then submit again — or contact us.";
}

export const REJECTION_REASONS_STAFF: Record<RejectionReason, string> = {
  TRANSACTION_NOT_FOUND: "Not found in the wallet records",
  AMOUNT_MISMATCH: "Wrong amount (refund manually)",
  ALREADY_USED: "Transaction already used",
  DETAILS_DO_NOT_MATCH: "Details don’t match the wallet record",
  EVIDENCE_UNCLEAR: "Screenshot unclear or doesn’t match",
};
