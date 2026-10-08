"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { MEMBER_HOME, requireMember } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportSchema } from "@/lib/validation/safety";

/**
 * Member safety tools (spec §17): report and block. The member id always comes from the session;
 * the database functions decide who may report or block whom and apply the automatic actions.
 */

export type ReportState = { error?: string; done?: boolean };

const REPORT_MESSAGES: Record<string, string> = {
  RATE_LIMITED: "You’ve sent a lot of reports today. Try again tomorrow, or block this member now.",
  PHOTO_REQUIRED: "Choose the photo you’re reporting.",
  MEMBER_NOT_FOUND: "This profile isn’t available any more.",
  ACCOUNT_CANNOT_ACT: "Your account can’t send reports right now.",
  ALREADY_REPORTED: "You’ve already reported this for this member. A moderator will review it.",
};
const GENERIC = "Something went wrong. Try again.";

export async function reportMember(_prev: ReportState, formData: FormData): Promise<ReportState> {
  const member = await requireMember();
  const parsed = reportSchema.safeParse({
    targetId: formData.get("targetId"),
    category: formData.get("category") || undefined,
    details: formData.get("details") || undefined,
    photoId: formData.get("photoId") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? GENERIC };
  const { targetId, category, details, photoId } = parsed.data;
  const { error } = await createAdminClient().rpc("submit_report", {
    p_reporter: member.id,
    p_target: targetId,
    p_category: category,
    p_description: details || undefined,
    p_photo_id: category === "INAPPROPRIATE_PHOTO" ? photoId : undefined,
  });
  if (error) {
    const code = Object.keys(REPORT_MESSAGES).find((c) => error.message.includes(c));
    return { error: code ? REPORT_MESSAGES[code] : GENERIC };
  }
  return { done: true };
}

/** BR-24: block silently, then leave the profile (it is no longer visible either way). */
export async function blockMember(targetId: string): Promise<{ error?: string }> {
  const member = await requireMember();
  const parsed = z.uuid().safeParse(targetId);
  if (!parsed.success) return { error: GENERIC };
  const { error } = await createAdminClient().rpc("block_user", { p_user_id: member.id, p_target: parsed.data });
  if (error)
    return { error: error.message.includes("ACCOUNT_CANNOT_ACT") ? REPORT_MESSAGES.ACCOUNT_CANNOT_ACT : GENERIC };
  redirect(`${MEMBER_HOME}?blocked=1`);
}

export async function unblockMember(formData: FormData): Promise<void> {
  const member = await requireMember();
  const parsed = z.uuid().safeParse(formData.get("userId"));
  if (!parsed.success) return;
  await createAdminClient().rpc("unblock_user", { p_user_id: member.id, p_target: parsed.data });
  revalidatePath("/account/blocked");
}
