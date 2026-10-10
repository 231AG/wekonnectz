import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { PhotoRejectedError, processPhoto, RECEIPT_OPTIONS, type PhotoRejection } from "@/lib/images/process-photo";
import { sweepQuarantine } from "@/lib/storage/photos";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Payment claims (spec §16). Screenshots go through the same pipeline as photos (magic bytes, size
 * cap, re-encode, no metadata) into the private payment-evidence bucket; the SHA-256 of the uploaded
 * file is stored so a reused screenshot is flagged. Paths stay in this module (BR-11).
 */

const QUARANTINE = "photos-quarantine";
const EVIDENCE = "payment-evidence";
export const EVIDENCE_URL_SECONDS = 120;

export type Provider = "ORANGE_MONEY" | "MTN_MOMO";
type ClaimStatus = Database["public"]["Enums"]["claim_status"];
type RejectionReason = Database["public"]["Enums"]["claim_rejection_reason"];

export type ClaimError =
  { kind: "rejected"; reason: PhotoRejection } | { kind: "db"; code: string } | { kind: "storage" };

const DB_CODES = [
  "ACCOUNT_CANNOT_PAY",
  "PLAN_NOT_AVAILABLE",
  "PROVIDER_NOT_AVAILABLE",
  "CARD_SUBSCRIPTION_ACTIVE",
  "TOO_MANY_PENDING",
  "INVALID_TRANSACTION_ID",
  "INVALID_SENDER",
  "INVALID_PAID_AT",
  "EVIDENCE_REQUIRED",
  "TRANSACTION_ALREADY_CLAIMED",
  "CLAIM_NOT_OPEN",
  "REPLY_REQUIRED",
  "NOTE_TOO_LONG",
] as const;

function dbError(message: string): ClaimError {
  return { kind: "db", code: DB_CODES.find((c) => message.includes(c)) ?? "UNKNOWN" };
}

const evidenceQuarantinePath = (userId: string, evidenceId: string) => `${userId}/e-${evidenceId}`;

/** A one-off upload URL for a payment screenshot (into quarantine). */
export async function evidenceUploadUrl(userId: string): Promise<{ evidenceId: string; url: string } | null> {
  await sweepQuarantine(userId);
  const evidenceId = randomUUID();
  const { data } = await createAdminClient()
    .storage.from(QUARANTINE)
    .createSignedUploadUrl(evidenceQuarantinePath(userId, evidenceId));
  return data?.signedUrl ? { evidenceId, url: data.signedUrl } : null;
}

/** Validates, hashes and stores an uploaded screenshot. The quarantine copy is always removed. */
async function storeEvidence(
  userId: string,
  evidenceId: string,
): Promise<{ path: string; sha256: string } | { error: ClaimError }> {
  const admin = createAdminClient();
  const quarantinePath = evidenceQuarantinePath(userId, evidenceId);
  try {
    const { data: file, error } = await admin.storage.from(QUARANTINE).download(quarantinePath);
    if (error || !file) return { error: { kind: "storage" } };
    const bytes = new Uint8Array(await file.arrayBuffer());
    let processed: Buffer;
    try {
      processed = await processPhoto(bytes, RECEIPT_OPTIONS);
    } catch (e) {
      return { error: { kind: "rejected", reason: e instanceof PhotoRejectedError ? e.reason : "NOT_AN_IMAGE" } };
    }
    const path = `${evidenceId}.webp`;
    const { error: putError } = await admin.storage
      .from(EVIDENCE)
      .upload(path, processed, { contentType: "image/webp", upsert: false, cacheControl: "0" });
    if (putError) return { error: { kind: "storage" } };
    return { path, sha256: createHash("sha256").update(bytes).digest("hex") };
  } finally {
    await admin.storage.from(QUARANTINE).remove([quarantinePath]);
  }
}

export type ClaimInput = {
  planId: string;
  provider: Provider;
  transactionId: string;
  senderPhone: string;
  paidAt: string;
  evidenceId: string;
};

export async function submitClaim(
  userId: string,
  input: ClaimInput,
): Promise<{ claimId: string } | { error: ClaimError }> {
  const stored = await storeEvidence(userId, input.evidenceId);
  if ("error" in stored) return stored;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("submit_payment_claim", {
    p_user: userId,
    p_plan_id: input.planId,
    p_provider: input.provider,
    p_transaction_id: input.transactionId,
    p_sender_phone: input.senderPhone,
    p_paid_at: input.paidAt,
    p_evidence_path: stored.path,
    p_evidence_sha256: stored.sha256,
  });
  if (error || !data) {
    await admin.storage.from(EVIDENCE).remove([stored.path]);
    return { error: dbError(error?.message ?? "") };
  }
  return { claimId: data };
}

export async function replyToClaim(
  userId: string,
  claimId: string,
  note: string | null,
  evidenceId: string | null,
): Promise<ClaimError | null> {
  const admin = createAdminClient();
  let stored: { path: string; sha256: string } | null = null;
  if (evidenceId) {
    const r = await storeEvidence(userId, evidenceId);
    if ("error" in r) return r.error;
    stored = r;
  }
  const { error } = await admin.rpc("reply_payment_claim", {
    p_user: userId,
    p_claim: claimId,
    p_note: note ?? "",
    p_evidence_path: stored?.path,
    p_evidence_sha256: stored?.sha256,
  });
  if (error) {
    if (stored) await admin.storage.from(EVIDENCE).remove([stored.path]);
    return dbError(error.message);
  }
  return null;
}

export async function cancelClaim(userId: string, claimId: string): Promise<ClaimError | null> {
  const { error } = await createAdminClient().rpc("cancel_payment_claim", { p_user: userId, p_claim: claimId });
  return error ? dbError(error.message) : null;
}

type Plan = { id: string; code: string; name: string; durationHours: number; price: number; currency: string };
type PlanRow = { id: string; code: string; name: string; duration_hours: number; price: number; currency: string };
const toPlan = (p: PlanRow): Plan => ({
  id: p.id,
  code: p.code,
  name: p.name,
  durationHours: p.duration_hours,
  price: Number(p.price),
  currency: p.currency,
});

export type PaymentOptions = {
  plans: Plan[];
  cardPlans: Plan[];
  wallets: { provider: Provider; displayName: string; numberOrCode: string }[];
  referenceCode: string;
  accessUntil: string | null;
  cardActive: boolean;
  mobileMoneyActive: boolean;
  pendingClaims: number;
  maxPending: number;
};

export async function paymentOptions(userId: string): Promise<PaymentOptions> {
  const { data, error } = await createAdminClient().rpc("member_payment_options", { p_user: userId });
  if (error || !data) throw new Error("payment options unavailable");
  const d = data as {
    plans: PlanRow[];
    card_plans: PlanRow[];
    wallets: { provider: Provider; display_name: string; number_or_code: string }[];
    reference_code: string;
    access_until: string | null;
    card_active: boolean;
    mobile_money_active: boolean;
    pending_claims: number;
    max_pending: number;
  };
  return {
    plans: d.plans.map(toPlan),
    cardPlans: d.card_plans.map(toPlan),
    wallets: d.wallets.map((w) => ({
      provider: w.provider,
      displayName: w.display_name,
      numberOrCode: w.number_or_code,
    })),
    referenceCode: d.reference_code,
    accessUntil: d.access_until,
    cardActive: d.card_active,
    mobileMoneyActive: d.mobile_money_active,
    pendingClaims: Number(d.pending_claims),
    maxPending: Number(d.max_pending),
  };
}

export type MemberClaim = {
  id: string;
  planName: string;
  provider: Provider;
  amount: number;
  currency: string;
  transactionId: string;
  status: ClaimStatus;
  rejectionReason: RejectionReason | null;
  staffQuestion: string | null;
  createdAt: string;
};

export async function memberClaims(userId: string): Promise<MemberClaim[]> {
  const { data, error } = await createAdminClient().rpc("member_claims", { p_user: userId });
  if (error) throw new Error("claims unavailable");
  return (data ?? []).map((c) => ({
    id: c.claim_id,
    planName: c.plan_name,
    provider: c.provider as Provider,
    amount: Number(c.amount),
    currency: c.currency,
    transactionId: c.transaction_id,
    status: c.status,
    rejectionReason: c.rejection_reason,
    staffQuestion: c.staff_question,
    createdAt: c.created_at,
  }));
}

export async function memberPasses(userId: string) {
  const { data, error } = await createAdminClient().rpc("member_passes", { p_user: userId });
  if (error) throw new Error("passes unavailable");
  return (data ?? []).map((p) => ({
    planName: p.plan_name,
    source: p.source,
    startsAt: p.starts_at,
    expiresAt: p.expires_at,
    amount: p.amount === null ? null : Number(p.amount),
    currency: p.currency,
    provider: p.provider,
    transactionId: p.transaction_id,
    paymentStatus: p.payment_status,
  }));
}

export async function publicPlans() {
  const { data, error } = await createAdminClient().rpc("public_plans");
  if (error) throw new Error("plans unavailable");
  return (data ?? []).map((p) => ({ ...p, price: Number(p.price) }));
}

/** Signed URL for a screenshot. The caller must have called log_evidence_view() as the admin first. */
export async function signEvidence(claimId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: path } = await admin.rpc("claim_evidence_path", { p_claim: claimId });
  if (!path) return null;
  const { data } = await admin.storage.from(EVIDENCE).createSignedUrl(path, EVIDENCE_URL_SECONDS);
  return data?.signedUrl ?? null;
}

/** Daily job: record ended passes and delete screenshots past retention (OD-18). Records stay. */
export async function paymentHousekeeping(): Promise<{ expired: number; evidenceDeleted: number }> {
  const admin = createAdminClient();
  const { data: expired, error: expireError } = await admin.rpc("expire_subscriptions");
  if (expireError) throw new Error("expiry job failed");
  const { data: due, error } = await admin.rpc("evidence_due_for_deletion", { p_limit: 200 });
  if (error) throw new Error("retention query failed");
  let evidenceDeleted = 0;
  if (due?.length) {
    const { error: removeError } = await admin.storage.from(EVIDENCE).remove(due.map((r) => r.evidence_path));
    if (removeError) throw new Error("evidence removal failed");
    const { data: marked } = await admin.rpc("mark_evidence_deleted", {
      p_evidence_ids: due.map((r) => r.evidence_id),
    });
    evidenceDeleted = Number(marked ?? 0);
  }
  return { expired: Number(expired ?? 0), evidenceDeleted };
}
