import "server-only";

import { PhotoRejectedError, processPhoto, type PhotoRejection } from "@/lib/images/process-photo";
import { sweepQuarantine } from "@/lib/storage/photos";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Verification selfies (spec §9, BR-10). Same pipeline as photos: a signed upload into quarantine,
 * then the server validates and re-encodes the file (no metadata) and stores it in the private
 * `verification` bucket. Paths stay in this module; members never receive a selfie URL at all.
 */

const QUARANTINE = "photos-quarantine";
const VERIFICATION = "verification";
export const SELFIE_URL_SECONDS = 120;

export type VerificationError =
  { kind: "rejected"; reason: PhotoRejection } | { kind: "db"; code: string } | { kind: "storage" };

const DB_CODES = [
  "ACCOUNT_CANNOT_EDIT",
  "AGE_GATE_REQUIRED",
  "STAFF_ACCOUNT",
  "PROFILE_INCOMPLETE",
  "PHOTOS_REQUIRED",
  "ALREADY_SUBMITTED",
  "NO_POSE_PROMPTS",
  "VERIFICATION_NOT_FOUND",
] as const;

function dbError(message: string): VerificationError {
  return { kind: "db", code: DB_CODES.find((c) => message.includes(c)) ?? "UNKNOWN" };
}

/** Quarantine object for a selfie; the "v-" prefix keeps it apart from photo uploads. */
export function selfieQuarantinePath(userId: string, verificationId: string): string {
  return `${userId}/v-${verificationId}`;
}

/** Starts or resumes the member's capture: the server chooses the pose (spec §9). */
export async function startVerification(
  userId: string,
): Promise<{ verificationId: string; pose: string } | { error: VerificationError }> {
  const { data, error } = await createAdminClient().rpc("start_verification", { p_user_id: userId });
  const row = data?.[0];
  if (error || !row) return { error: dbError(error?.message ?? "") };
  return { verificationId: row.verification_id, pose: row.pose_prompt };
}

/**
 * A one-off upload URL for the captured selfie (re-taking overwrites the same quarantine file). Only
 * for the member's own open capture, and stray quarantine files are cleared first.
 */
export async function selfieUploadUrl(
  userId: string,
  verificationId: string,
): Promise<{ url: string } | { error: "NO_OPEN_CAPTURE" | "storage" }> {
  const admin = createAdminClient();
  const { data: open } = await admin
    .from("verifications")
    .select("id")
    .eq("id", verificationId)
    .eq("user_id", userId)
    .eq("status", "AWAITING_SELFIE")
    .is("processing_started_at", null)
    .maybeSingle();
  if (!open) return { error: "NO_OPEN_CAPTURE" };
  await sweepQuarantine(userId);
  const { data } = await admin.storage
    .from(QUARANTINE)
    .createSignedUploadUrl(selfieQuarantinePath(userId, verificationId), { upsert: true });
  return data?.signedUrl ? { url: data.signedUrl } : { error: "storage" };
}

/** Processes the uploaded selfie and submits it for human review. */
export async function submitSelfie(userId: string, verificationId: string): Promise<VerificationError | null> {
  const admin = createAdminClient();
  const quarantinePath = selfieQuarantinePath(userId, verificationId);
  const storedPath = `${verificationId}.webp`;

  const { data: claimed, error: claimError } = await admin.rpc("claim_verification_selfie", {
    p_user_id: userId,
    p_verification_id: verificationId,
  });
  if (claimError || !claimed) return { kind: "db", code: "VERIFICATION_NOT_FOUND" };
  const release = () =>
    admin.rpc("release_verification_selfie", { p_user_id: userId, p_verification_id: verificationId });

  try {
    const { data: file, error } = await admin.storage.from(QUARANTINE).download(quarantinePath);
    if (error || !file) {
      await release();
      return { kind: "storage" };
    }
    let processed: Buffer;
    try {
      processed = await processPhoto(new Uint8Array(await file.arrayBuffer()));
    } catch (e) {
      await release();
      return { kind: "rejected", reason: e instanceof PhotoRejectedError ? e.reason : "NOT_AN_IMAGE" };
    }
    const { error: putError } = await admin.storage
      .from(VERIFICATION)
      // No caching: a browser must never show a selfie again without a new (audited) signed URL.
      .upload(storedPath, processed, { contentType: "image/webp", upsert: true, cacheControl: "0" });
    if (putError) {
      await release();
      return { kind: "storage" };
    }
    const { error: dbErr } = await admin.rpc("submit_verification", {
      p_user_id: userId,
      p_verification_id: verificationId,
      p_storage_path: storedPath,
    });
    if (dbErr) {
      await admin.storage.from(VERIFICATION).remove([storedPath]);
      await release();
      return dbError(dbErr.message);
    }
    return null;
  } finally {
    await admin.storage.from(QUARANTINE).remove([quarantinePath]);
  }
}

export type ReviewStatus = {
  verification: "NOT_STARTED" | "PENDING" | "VERIFIED" | "REJECTED";
  rejectionReason: Database["public"]["Enums"]["verification_rejection_reason"] | null;
  photosApproved: number;
  photosInReview: number;
  photosRejected: number;
  photosRequired: number;
};

/** What the Under review screen shows (spec §10 step 11). */
export async function reviewStatus(userId: string): Promise<ReviewStatus> {
  const { data, error } = await createAdminClient().rpc("member_review_status", { p_user_id: userId });
  if (error || !data) throw new Error("review status unavailable");
  const d = data as Record<string, unknown>;
  return {
    verification: d.verification as ReviewStatus["verification"],
    rejectionReason: (d.rejection_reason as ReviewStatus["rejectionReason"]) ?? null,
    photosApproved: Number(d.photos_approved),
    photosInReview: Number(d.photos_in_review),
    photosRejected: Number(d.photos_rejected),
    photosRequired: Number(d.photos_required),
  };
}

/**
 * Signed URLs for one verification in the queue: the selfie and the member's photos. The caller must
 * have checked the staff session (requireStaff) and recorded the view with log_selfie_view() first.
 */
export async function signVerificationReview(
  verificationId: string,
): Promise<{ selfie: string | null; photos: { id: string; url: string; isPrimary: boolean; status: string }[] }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("verification_review_paths", { p_verification_id: verificationId });
  if (error || !data) return { selfie: null, photos: [] };
  const selfieRow = data.find((r) => r.kind === "selfie");
  const photoRows = data.filter((r) => r.kind === "photo");
  const [selfieSigned, photosSigned] = await Promise.all([
    selfieRow
      ? admin.storage.from(VERIFICATION).createSignedUrl(selfieRow.storage_path, SELFIE_URL_SECONDS)
      : Promise.resolve({ data: null }),
    photoRows.length
      ? admin.storage.from("photos").createSignedUrls(
          photoRows.map((r) => r.storage_path),
          SELFIE_URL_SECONDS,
        )
      : Promise.resolve({ data: [] }),
  ]);
  const byPath = new Map((photosSigned.data ?? []).map((s) => [s.path, s.signedUrl]));
  return {
    selfie: selfieSigned.data?.signedUrl ?? null,
    photos: photoRows.flatMap((r) =>
      byPath.get(r.storage_path)
        ? [{ id: r.id, url: byPath.get(r.storage_path)!, isPrimary: r.is_primary, status: String(r.status) }]
        : [],
    ),
  };
}

/** OD-6 retention job: deletes selfie images past the retention period; decision records stay. */
export async function purgeExpiredSelfies(): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("selfies_due_for_deletion", { p_limit: 200 });
  if (error) throw new Error("retention query failed");
  if (!data?.length) return 0;
  const { error: removeError } = await admin.storage.from(VERIFICATION).remove(data.map((r) => r.storage_path));
  if (removeError) throw new Error("selfie removal failed");
  const { data: marked, error: markError } = await admin.rpc("mark_selfies_deleted", {
    p_verification_ids: data.map((r) => r.verification_id),
  });
  if (markError) throw new Error("retention update failed");
  return Number(marked ?? 0);
}
