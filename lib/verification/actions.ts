"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { nextStepFor, requireMember } from "@/lib/auth/session";
import { selfieUploadUrl, submitSelfie, type VerificationError } from "@/lib/storage/verification";

/**
 * Verification selfie (spec §9 layer 3). The pose was fixed by the server when the page loaded
 * (start_verification); these actions only move the captured image through the pipeline.
 */

export type SelfieState = { error?: string };

const id = z.uuid();

const MESSAGES: Record<string, string> = {
  NOT_AN_IMAGE: "That didn’t work as a photo. Please take the selfie again.",
  TOO_SMALL: "That selfie was too small. Please take it again.",
  TOO_LARGE: "That selfie was too big. Please take it again.",
  ACCOUNT_CANNOT_EDIT: "Your account is restricted right now, so you can’t verify.",
  VERIFICATION_NOT_FOUND: "Your selfie is still being processed. Reload the page in a few minutes.",
  storage: "The selfie didn’t upload. Check your connection and try again.",
};
const GENERIC = "Something went wrong. Try again.";

function messageFor(error: VerificationError): string {
  if (error.kind === "rejected") return MESSAGES[error.reason] ?? GENERIC;
  if (error.kind === "storage") return MESSAGES.storage;
  return MESSAGES[error.code] ?? GENERIC;
}

/** A one-off upload URL for the captured selfie of the member's own open verification. */
export async function prepareSelfieUpload(verificationId: string): Promise<{ uploadUrl?: string; error?: string }> {
  const member = await requireMember();
  const parsed = id.safeParse(verificationId);
  if (!parsed.success) return { error: GENERIC };
  const result = await selfieUploadUrl(member.id, parsed.data);
  if ("url" in result) return { uploadUrl: result.url };
  return { error: result.error === "storage" ? MESSAGES.storage : MESSAGES.VERIFICATION_NOT_FOUND };
}

/** The selfie is uploaded: process it and send it for review, then show the Under review screen. */
export async function sendSelfie(verificationId: string): Promise<SelfieState> {
  const member = await requireMember();
  const parsed = id.safeParse(verificationId);
  if (!parsed.success) return { error: GENERIC };
  const error = await submitSelfie(member.id, parsed.data);
  if (error) {
    if (
      error.kind === "db" &&
      ["PHOTOS_REQUIRED", "PROFILE_INCOMPLETE", "ALREADY_SUBMITTED", "ACCOUNT_CANNOT_EDIT"].includes(error.code)
    ) {
      redirect(nextStepFor(await requireMember()));
    }
    return { error: messageFor(error) };
  }
  redirect(nextStepFor(await requireMember()));
}
