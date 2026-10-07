"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { nextStepFor, requireMember } from "@/lib/auth/session";
import {
  deleteOwnPhoto,
  finishPhotoUpload,
  listOwnPhotos,
  makePrimaryPhoto,
  reservePhotoUpload,
  type OwnPhoto,
  type PhotoError,
} from "@/lib/storage/photos";

/**
 * Photo actions (spec §11). Each: authenticate → validate → lib/storage/photos with the member id
 * from the session. Clients only ever receive photo ids and short-lived signed URLs.
 */

export type PhotosResult = { photos: OwnPhoto[]; error?: string };
export type UploadSlot = { photoId: string; uploadUrl: string } | { error: string };

const photoId = z.uuid();

const MESSAGES: Record<string, string> = {
  TOO_LARGE: "That photo is too big. Choose one under 10 MB.",
  NOT_AN_IMAGE: "That file isn’t a photo we can use. Choose a JPG, PNG or WebP photo.",
  TOO_SMALL: "That photo is too small. Choose a larger, clearer one.",
  PHOTO_LIMIT_REACHED: "You’ve reached the photo limit. Remove one to add another.",
  RATE_LIMITED: "You’ve added a lot of photos in a short time. Please try again later.",
  ACCOUNT_CANNOT_EDIT: "Your account is restricted right now, so your photos can’t be changed.",
  PHOTO_NOT_FOUND: "That photo was already changed. The page has been updated.",
  storage: "The upload didn’t finish. Check your connection and try again.",
};
const GENERIC = "Something went wrong. Try again.";

function messageFor(error: PhotoError): string {
  if (error.kind === "rejected") return MESSAGES[error.reason];
  if (error.kind === "storage") return MESSAGES.storage;
  return MESSAGES[error.code] ?? GENERIC;
}

/** Earlier steps unfinished, or a staff account: send the member where they belong. */
async function redirectIfOutOfOrder(error: PhotoError): Promise<void> {
  if (error.kind === "db" && ["PROFILE_INCOMPLETE", "AGE_GATE_REQUIRED"].includes(error.code)) {
    redirect(nextStepFor(await requireMember()));
  }
}

async function withList(userId: string, error: PhotoError | null): Promise<PhotosResult> {
  if (error) await redirectIfOutOfOrder(error);
  return { photos: await listOwnPhotos(userId), error: error ? messageFor(error) : undefined };
}

/** Step 1: reserve a slot; the browser then uploads the file straight to quarantine. */
export async function requestPhotoUpload(): Promise<UploadSlot> {
  const member = await requireMember();
  const slot = await reservePhotoUpload(member.id);
  if ("error" in slot) {
    await redirectIfOutOfOrder(slot.error);
    return { error: messageFor(slot.error) };
  }
  return slot;
}

/** Step 2: the file is in quarantine; process it and store it for review. */
export async function completePhotoUpload(id: string): Promise<PhotosResult> {
  const member = await requireMember();
  const parsed = photoId.safeParse(id);
  if (!parsed.success) return withList(member.id, { kind: "db", code: "PHOTO_NOT_FOUND" });
  return withList(member.id, await finishPhotoUpload(member.id, parsed.data));
}

export async function makeMainPhoto(id: string): Promise<PhotosResult> {
  const member = await requireMember();
  const parsed = photoId.safeParse(id);
  if (!parsed.success) return withList(member.id, { kind: "db", code: "PHOTO_NOT_FOUND" });
  return withList(member.id, await makePrimaryPhoto(member.id, parsed.data));
}

export async function removePhoto(id: string): Promise<PhotosResult> {
  const member = await requireMember();
  const parsed = photoId.safeParse(id);
  if (!parsed.success) return withList(member.id, { kind: "db", code: "PHOTO_NOT_FOUND" });
  return withList(member.id, await deleteOwnPhoto(member.id, parsed.data));
}

/** Fresh signed URLs (they last 120 s), e.g. when the page comes back into view. */
export async function refreshPhotos(): Promise<PhotosResult> {
  const member = await requireMember();
  return { photos: await listOwnPhotos(member.id) };
}

/** Continue: the database decides whether the photo step is done (3 photos, none rejected). */
export async function continueFromPhotos(): Promise<{ error: string }> {
  const member = await requireMember();
  if (!member.onboarding.photosDone) return { error: "Add at least 3 photos to continue." };
  redirect(nextStepFor(member));
}
