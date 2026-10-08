import "server-only";

import { PhotoRejectedError, processPhoto, type PhotoRejection } from "@/lib/images/process-photo";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Photo storage (spec §11, BR-11, BR-12). Storage paths stay inside this module: callers get photo
 * ids and short-lived signed URLs, never a path (spec §6 rule 5). Every function takes the member id
 * from the caller's verified session; the database functions re-check ownership and account state.
 */

export const SIGNED_URL_SECONDS = 120;
const QUARANTINE = "photos-quarantine";
const PHOTOS = "photos";

type PhotoStatus = Database["public"]["Enums"]["photo_status"];
type RejectionReason = Database["public"]["Enums"]["photo_rejection_reason"];

export type OwnPhoto = {
  id: string;
  status: PhotoStatus;
  isPrimary: boolean;
  rejectionReason: RejectionReason | null;
  url: string | null;
};

export type PhotoError =
  { kind: "rejected"; reason: PhotoRejection } | { kind: "db"; code: string } | { kind: "storage" };

const DB_CODES = [
  "ACCOUNT_CANNOT_EDIT",
  "AGE_GATE_REQUIRED",
  "STAFF_ACCOUNT",
  "PROFILE_INCOMPLETE",
  "PHOTO_LIMIT_REACHED",
  "RATE_LIMITED",
  "PHOTO_NOT_FOUND",
  "PHOTO_UNDER_REVIEW",
] as const;

function dbError(message: string): PhotoError {
  return { kind: "db", code: DB_CODES.find((c) => message.includes(c)) ?? "UNKNOWN" };
}

/** Signs photo paths for the server to hand out as URLs; callers must have checked access first (BR-11). */
export async function signPaths(paths: string[]): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  if (paths.length === 0) return signed;
  const { data, error } = await createAdminClient().storage.from(PHOTOS).createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error || !data) return signed;
  for (const item of data) if (item.path && item.signedUrl) signed.set(item.path, item.signedUrl);
  return signed;
}

/** Reserves a slot and returns a signed upload URL into quarantine (spec §11 step 1). */
export async function reservePhotoUpload(
  userId: string,
): Promise<{ photoId: string; uploadUrl: string } | { error: PhotoError }> {
  const admin = createAdminClient();
  const { data: photoId, error } = await admin.rpc("begin_photo_upload", { p_user_id: userId });
  // begin_photo_upload has just cleared this member's abandoned slots; clear their files too.
  await sweepQuarantine(userId);
  if (error || !photoId) return { error: dbError(error?.message ?? "") };

  const { data, error: signError } = await admin.storage.from(QUARANTINE).createSignedUploadUrl(`${userId}/${photoId}`);
  if (signError || !data) {
    await admin.rpc("abort_photo_upload", { p_user_id: userId, p_photo_id: photoId });
    return { error: { kind: "storage" } };
  }
  return { photoId, uploadUrl: data.signedUrl };
}

/**
 * Removes this member's quarantine files that no open upload slot is waiting for: abandoned uploads,
 * and files re-sent with an old upload token after their slot was finished. A project-wide sweep for
 * members who never come back is a scheduled job (Phase 12).
 */
export async function sweepQuarantine(userId: string): Promise<void> {
  const admin = createAdminClient();
  const [{ data: files }, { data: open }, { data: capture }] = await Promise.all([
    admin.storage.from(QUARANTINE).list(userId, { limit: 100 }),
    // Every open slot keeps its file, including one another tab is processing right now.
    admin.from("profile_photos").select("id").eq("user_id", userId).eq("status", "UPLOADING"),
    // …and the member's open selfie capture ("v-<verification id>").
    admin.from("verifications").select("id").eq("user_id", userId).eq("status", "AWAITING_SELFIE"),
  ]);
  const keep = new Set([...(open ?? []).map((r) => r.id), ...(capture ?? []).map((r) => `v-${r.id}`)]);
  // Payment screenshots ("e-<id>", Phase 7) waiting to be submitted keep their file for an hour.
  const recent = (name: string, created?: string | null) =>
    name.startsWith("e-") && Boolean(created) && Date.now() - Date.parse(created!) < 60 * 60 * 1000;
  const stale = (files ?? [])
    .filter((f) => !keep.has(f.name) && !recent(f.name, f.created_at))
    .map((f) => `${userId}/${f.name}`);
  if (stale.length) await admin.storage.from(QUARANTINE).remove(stale);
}

/**
 * Processes an uploaded file (spec §11 step 3): reads it from quarantine, validates and re-encodes it
 * (magic bytes, size cap, resize, WebP, no EXIF), stores it in photos/ and marks it PENDING_REVIEW.
 * The quarantine copy is always removed.
 */
export async function finishPhotoUpload(userId: string, photoId: string): Promise<PhotoError | null> {
  const admin = createAdminClient();
  const quarantinePath = `${userId}/${photoId}`;
  // Opaque object name: a signed URL never reveals whose photo it is.
  const storedPath = `${photoId}.webp`;
  const abort = () => admin.rpc("abort_photo_upload", { p_user_id: userId, p_photo_id: photoId });

  // Only one "finish" may process a slot (a double click or a retry gets PHOTO_NOT_FOUND and
  // leaves the first one alone).
  const { data: claimed, error: claimError } = await admin.rpc("claim_photo_upload", {
    p_user_id: userId,
    p_photo_id: photoId,
  });
  if (claimError || !claimed) return { kind: "db", code: "PHOTO_NOT_FOUND" };

  try {
    const { data: file, error } = await admin.storage.from(QUARANTINE).download(quarantinePath);
    if (error || !file) {
      await abort();
      return { kind: "storage" };
    }

    let processed: Buffer;
    try {
      processed = await processPhoto(new Uint8Array(await file.arrayBuffer()));
    } catch (e) {
      await abort();
      if (e instanceof PhotoRejectedError) return { kind: "rejected", reason: e.reason };
      return { kind: "rejected", reason: "NOT_AN_IMAGE" };
    }

    const { error: putError } = await admin.storage
      .from(PHOTOS)
      .upload(storedPath, processed, { contentType: "image/webp", upsert: false, cacheControl: "3600" });
    if (putError) {
      await abort();
      return { kind: "storage" };
    }

    const { error: dbErr } = await admin.rpc("complete_photo_upload", {
      p_user_id: userId,
      p_photo_id: photoId,
      p_storage_path: storedPath,
    });
    if (dbErr) {
      await admin.storage.from(PHOTOS).remove([storedPath]);
      await abort();
      return dbError(dbErr.message);
    }
    return null;
  } finally {
    await admin.storage.from(QUARANTINE).remove([quarantinePath]);
  }
}

/** The member's own photos with signed URLs (BR-11: signed after the database access check). */
export async function listOwnPhotos(userId: string): Promise<OwnPhoto[]> {
  const { data, error } = await createAdminClient().rpc("member_photos", { p_user_id: userId });
  if (error || !data) return [];
  const urls = await signPaths(data.map((p) => p.storage_path));
  return data.map((p) => ({
    id: p.id,
    status: p.status,
    isPrimary: p.is_primary,
    rejectionReason: p.rejection_reason,
    url: urls.get(p.storage_path) ?? null,
  }));
}

export async function makePrimaryPhoto(userId: string, photoId: string): Promise<PhotoError | null> {
  const { error } = await createAdminClient().rpc("set_primary_photo", { p_user_id: userId, p_photo_id: photoId });
  return error ? dbError(error.message) : null;
}

export async function deleteOwnPhoto(userId: string, photoId: string): Promise<PhotoError | null> {
  const admin = createAdminClient();
  const { data: path, error } = await admin.rpc("delete_photo", { p_user_id: userId, p_photo_id: photoId });
  if (error) return dbError(error.message);
  if (path) await admin.storage.from(PHOTOS).remove([path]);
  return null;
}

/**
 * Signed URLs for photos in the review queue. The caller must already have checked the staff
 * session (requireStaff); the database only hands out paths of photos still PENDING_REVIEW.
 */
export async function signReviewPhotos(photoIds: string[]): Promise<Map<string, string>> {
  if (photoIds.length === 0) return new Map();
  const { data, error } = await createAdminClient().rpc("review_photo_paths", { p_photo_ids: photoIds });
  if (error || !data) return new Map();
  const urls = await signPaths(data.map((p) => p.storage_path));
  return new Map(data.flatMap((p) => (urls.has(p.storage_path) ? [[p.id, urls.get(p.storage_path)!]] : [])));
}

/** Photo limits from app_settings (spec §10: 3 required, up to 6), so the screen matches the database. */
export async function photoLimits(): Promise<{ required: number; max: number }> {
  const admin = createAdminClient();
  const [required, max] = await Promise.all([
    admin.rpc("get_setting", { p_key: "photos.min_required" }),
    admin.rpc("get_setting", { p_key: "photos.max_per_user" }),
  ]);
  if (required.error || max.error) throw new Error("photo limits unavailable");
  return { required: Number(required.data), max: Number(max.data) };
}
