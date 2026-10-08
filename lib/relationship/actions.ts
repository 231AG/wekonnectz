"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireMember } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Relationship actions (spec §15). The member id comes from the session; like_user() decides
 * eligibility, the daily cap (OD-10) and the match atomically.
 */

export type LikeResult = { matched?: boolean; conversationId?: string; error?: string };

const MESSAGES: Record<string, string> = {
  NOT_ELIGIBLE: "Relationship isn’t available on your account right now.",
  LIKE_LIMIT: "You’ve used today’s likes. Come back tomorrow for more.",
  MEMBER_NOT_FOUND: "This profile isn’t available any more.",
};
const GENERIC = "Something went wrong. Try again.";

function messageFor(error: { message: string }): string {
  const code = Object.keys(MESSAGES).find((c) => error.message.includes(c));
  return code ? MESSAGES[code] : GENERIC;
}

export async function likeMember(targetId: string): Promise<LikeResult> {
  const member = await requireMember();
  const parsed = z.uuid().safeParse(targetId);
  if (!parsed.success) return { error: GENERIC };
  const { data, error } = await createAdminClient().rpc("like_user", { p_viewer: member.id, p_target: parsed.data });
  if (error) return { error: messageFor(error) };
  revalidatePath("/relationship", "layout");
  const d = data as { matched: boolean; conversation_id?: string };
  return { matched: d.matched, conversationId: d.conversation_id };
}

export async function passMember(targetId: string): Promise<{ error?: string }> {
  const member = await requireMember();
  const parsed = z.uuid().safeParse(targetId);
  if (!parsed.success) return { error: GENERIC };
  const { error } = await createAdminClient().rpc("pass_user", { p_viewer: member.id, p_target: parsed.data });
  if (error) return { error: messageFor(error) };
  revalidatePath("/relationship", "layout");
  return {};
}

/** Unmatching closes the conversation for both (§15) and returns to Matches. */
export async function unmatchMember(matchId: string): Promise<{ error?: string }> {
  const member = await requireMember();
  const parsed = z.uuid().safeParse(matchId);
  if (!parsed.success) return { error: GENERIC };
  const { error } = await createAdminClient().rpc("unmatch", { p_viewer: member.id, p_match_id: parsed.data });
  if (error) return { error: error.message.includes("MATCH_NOT_FOUND") ? "This match has already ended." : GENERIC };
  redirect("/relationship/matches");
}
