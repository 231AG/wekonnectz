"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireMember } from "@/lib/auth/session";
import { getDetectionTerms } from "@/lib/content/terms";
import { detect } from "@/lib/domain/detection";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestSchema } from "@/lib/validation/requests";

/**
 * Casual requests and saved profiles (spec §13, §14). The member id comes from the session; the
 * database re-checks the pass, the pool, blocks, one pending request, the cool-down and the daily cap.
 * BR-31: the detection engine runs in "profile" mode — contact details and prices are refused. Request
 * text is never logged.
 */

export type RequestFormState = { error?: string; sent?: boolean };

const MESSAGES: Record<string, string> = {
  NOT_ELIGIBLE: "You need an active pass to send requests.",
  MEMBER_NOT_AVAILABLE: "This member isn’t available right now.",
  INVALID_REQUEST: "Requests can be 1 to 300 characters.",
  ALREADY_CONNECTED: "You already have a conversation with this member.",
  REQUEST_PENDING: "You’ve already sent this member a request.",
  REQUEST_RECEIVED: "This member has already sent you a request. Answer it in Messages → Requests.",
  REQUEST_LIMIT: "You’ve sent today’s requests. Try again tomorrow.",
  REQUEST_NOT_OPEN: "This request isn’t open any more.",
  "has no value": "Requests aren’t open yet. Please try again later.",
};
const GENERIC = "Something went wrong. Try again.";

function messageFor(error: { message: string }): string {
  const code = Object.keys(MESSAGES).find((c) => error.message.includes(c));
  return code ? MESSAGES[code] : GENERIC;
}

export async function sendRequest(_prev: RequestFormState, formData: FormData): Promise<RequestFormState> {
  const member = await requireMember();
  const parsed = requestSchema.safeParse({ recipientId: formData.get("recipientId"), body: formData.get("body") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? GENERIC };
  // BR-31 / OD-31: requests are first contact, so the profile rules apply.
  if (detect(parsed.data.body, "profile", await getDetectionTerms()).blocked) {
    return { error: "Contact details and prices aren’t allowed." };
  }
  const { error } = await createAdminClient().rpc("send_message_request", {
    p_viewer: member.id,
    p_recipient: parsed.data.recipientId,
    p_body: parsed.data.body,
  });
  if (error) return { error: messageFor(error) };
  revalidatePath(`/casual/m/${parsed.data.recipientId}`);
  return { sent: true };
}

const respondSchema = z.object({
  requestId: z.uuid(),
  action: z.enum(["ACCEPT", "DECLINE", "BLOCK"]),
});

export async function respondToRequest(formData: FormData): Promise<void> {
  const member = await requireMember();
  const parsed = respondSchema.safeParse({ requestId: formData.get("requestId"), action: formData.get("action") });
  if (!parsed.success) redirect("/messages/requests?error=1");
  const { data, error } = await createAdminClient().rpc("respond_to_request", {
    p_viewer: member.id,
    p_request: parsed.data.requestId,
    p_action: parsed.data.action,
  });
  revalidatePath("/messages", "layout");
  if (error) {
    redirect(`/messages/requests?error=${error.message.includes("NOT_ELIGIBLE") ? "pass" : "closed"}`);
  }
  if (parsed.data.action === "ACCEPT" && data) redirect(`/messages/${data}`);
  redirect(`/messages/requests?done=${parsed.data.action.toLowerCase()}`);
}

export async function toggleSaved(formData: FormData): Promise<void> {
  const member = await requireMember();
  const parsed = z
    .object({ ownerId: z.uuid(), saved: z.enum(["1", "0"]) })
    .safeParse({ ownerId: formData.get("ownerId"), saved: formData.get("saved") });
  if (!parsed.success) return;
  await createAdminClient().rpc("save_profile", {
    p_viewer: member.id,
    p_owner: parsed.data.ownerId,
    p_saved: parsed.data.saved === "1",
  });
  revalidatePath(`/casual/m/${parsed.data.ownerId}`);
  revalidatePath("/casual/saved");
}
