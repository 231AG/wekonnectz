"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaff } from "@/lib/auth/staff";
import { REJECTION_REASON_KEYS } from "@/lib/photos/reasons";
import { createClient } from "@/lib/supabase/server";

export type ReviewState = { error?: string; done?: "approved" | "rejected" };

const schema = z.discriminatedUnion("decision", [
  z.object({ photoId: z.uuid(), decision: z.literal("approve") }),
  z.object({ photoId: z.uuid(), decision: z.literal("reject"), reason: z.enum(REJECTION_REASON_KEYS) }),
]);

/**
 * Photo queue decision (spec §21). Runs as the staff member's own session: review_photo() checks
 * is_staff() (role + aal2), refuses photos already decided, and writes the audit row in the same
 * transaction (BR-34).
 */
export async function reviewPhotoAction(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  await requireStaff();
  const parsed = schema.safeParse({
    photoId: formData.get("photoId"),
    decision: formData.get("decision"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) {
    return { error: formData.get("decision") === "reject" ? "Choose a reason to reject." : "Something went wrong." };
  }

  const { error } = await (
    await createClient()
  ).rpc("review_photo", {
    p_photo_id: parsed.data.photoId,
    p_approve: parsed.data.decision === "approve",
    p_reason: parsed.data.decision === "reject" ? parsed.data.reason : undefined,
  });
  if (error) {
    return {
      error: error.message.includes("PHOTO_NOT_PENDING")
        ? "Already decided by someone else."
        : "Couldn’t save. Try again.",
    };
  }
  revalidatePath("/admin/photos");
  revalidatePath("/admin");
  return { done: parsed.data.decision === "approve" ? "approved" : "rejected" };
}
