"use server";

import { z } from "zod";

import { requireMember } from "@/lib/auth/session";
import { getDetectionTerms } from "@/lib/content/terms";
import { containsLink, detect } from "@/lib/domain/detection";
import { conversationView, type ChatMessage } from "@/lib/storage/relationship";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ReportCategory } from "@/lib/safety/categories";
import { conversationReportSchema, messageSchema } from "@/lib/validation/messages";

/**
 * Messaging (spec §14). Text only and no links (a send rule). The detection engine runs in
 * conversation mode (OD-31): prices, payment terms and money requests are delivered and flagged for
 * review; phone numbers and handles are not flagged. Message text is never logged (§6 rule 7).
 */

export type SendResult = { message?: ChatMessage; error?: string };

const SEND_MESSAGES: Record<string, string> = {
  CANNOT_SEND: "You can’t send messages in this conversation right now.",
  CONVERSATION_NOT_FOUND: "This conversation has ended.",
  RATE_LIMITED: "You’re sending messages too quickly. Wait a moment and try again.",
  INVALID_MESSAGE: "Messages can be 1 to 1000 characters.",
};
const GENERIC = "Something went wrong. Try again.";

export async function sendMessage(conversationId: string, body: string): Promise<SendResult> {
  const member = await requireMember();
  const parsed = messageSchema.safeParse({ conversationId, body });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? GENERIC };
  if (containsLink(parsed.data.body)) return { error: "Links can’t be sent in chat." };

  let flagged = false;
  let categories: string[] = [];
  try {
    const result = detect(parsed.data.body, "conversation", await getDetectionTerms());
    flagged = result.flagged;
    categories = result.categories;
  } catch {
    // The text can't be checked right now: don't deliver it unchecked.
    return { error: "We can’t send messages right now. Please try again shortly." };
  }

  const { data, error } = await createAdminClient().rpc("send_message", {
    p_viewer: member.id,
    p_conversation: parsed.data.conversationId,
    p_body: parsed.data.body,
    p_flagged: flagged,
    p_categories: categories,
  });
  if (error) {
    const code = Object.keys(SEND_MESSAGES).find((c) => error.message.includes(c));
    return { error: code ? SEND_MESSAGES[code] : GENERIC };
  }
  const m = data as { id: string; body: string; created_at: string };
  return { message: { id: m.id, mine: true, body: m.body, createdAt: m.created_at, readAt: null } };
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const member = await requireMember();
  const parsed = z.uuid().safeParse(conversationId);
  if (!parsed.success) return;
  await createAdminClient().rpc("mark_conversation_read", { p_viewer: member.id, p_conversation: parsed.data });
}

export type ConversationReportState = { error?: string; done?: boolean };

const REPORT_MESSAGES: Record<string, string> = {
  RATE_LIMITED: "You’ve sent a lot of reports today. Try again tomorrow, or block this member now.",
  ALREADY_REPORTED: "You’ve already reported this for this member. A moderator will review it.",
  ACCOUNT_CANNOT_ACT: "Your account can’t send reports right now.",
  CONVERSATION_NOT_FOUND: "This conversation isn’t available any more.",
};

/** Report from a conversation (§17): the recent messages go with it for the moderator (OD-26). */
export async function reportConversation(
  _prev: ConversationReportState,
  formData: FormData,
): Promise<ConversationReportState> {
  const member = await requireMember();
  const parsed = conversationReportSchema.safeParse({
    conversationId: formData.get("conversationId"),
    category: formData.get("category") || undefined,
    details: formData.get("details") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? GENERIC };
  const { error } = await createAdminClient().rpc("submit_conversation_report", {
    p_reporter: member.id,
    p_conversation: parsed.data.conversationId,
    p_category: parsed.data.category as ReportCategory,
    p_description: parsed.data.details || undefined,
  });
  if (error) {
    const code = Object.keys(REPORT_MESSAGES).find((c) => error.message.includes(c));
    return { error: code ? REPORT_MESSAGES[code] : GENERIC };
  }
  return { done: true };
}

/** The latest messages of a conversation, to catch up after the live channel (re)connects. */
export async function loadMessages(conversationId: string): Promise<ChatMessage[] | null> {
  const member = await requireMember();
  const parsed = z.uuid().safeParse(conversationId);
  if (!parsed.success) return null;
  const view = await conversationView(member.id, parsed.data);
  return view ? view.messages : null;
}
