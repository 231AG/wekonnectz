"use server";

import { revalidatePath } from "next/cache";

import { requireMember } from "@/lib/auth/session";
import { PREF_CATEGORIES } from "@/lib/domain/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushEndpointSchema, pushSubscriptionSchema } from "@/lib/validation/notifications";

export type PrefsState = { ok?: string; error?: string };

/** Notification preferences (§18 user_settings.notification_prefs): one switch per category. */
export async function saveNotificationPrefs(_prev: PrefsState, formData: FormData): Promise<PrefsState> {
  const member = await requireMember();
  const prefs = Object.fromEntries(PREF_CATEGORIES.map((c) => [c.key, formData.get(`pref_${c.key}`) === "on"]));
  const { error } = await createAdminClient().rpc("set_notification_prefs", { p_user: member.id, p_prefs: prefs });
  if (error) return { error: "Couldn’t save. Try again." };
  revalidatePath("/account/notifications");
  return { ok: "Saved." };
}

/** This browser: turn push on (stores its subscription for the signed-in member only). */
export async function savePushSubscription(subscription: unknown): Promise<{ ok: boolean; error?: string }> {
  const member = await requireMember();
  const parsed = pushSubscriptionSchema.safeParse(subscription);
  if (!parsed.success) return { ok: false, error: "This browser can’t receive notifications." };
  const { error } = await createAdminClient().rpc("save_push_subscription", {
    p_user: member.id,
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
  });
  if (error) {
    return {
      ok: false,
      error: error.message.includes("TOO_MANY_DEVICES")
        ? "Turn notifications off on another device first."
        : "Try again.",
    };
  }
  return { ok: true };
}

export async function deletePushSubscription(endpoint: unknown): Promise<void> {
  const member = await requireMember();
  const parsed = pushEndpointSchema.safeParse(endpoint);
  if (!parsed.success) return;
  await createAdminClient().rpc("delete_push_subscription", { p_user: member.id, p_endpoint: parsed.data });
}

/** Is this browser's push address registered to the signed-in member (not someone who used the phone before)? */
export async function pushEndpointIsMine(endpoint: unknown): Promise<boolean> {
  const member = await requireMember();
  const parsed = pushEndpointSchema.safeParse(endpoint);
  if (!parsed.success) return false;
  const { data } = await createAdminClient().rpc("member_push_endpoint_is_mine", {
    p_user: member.id,
    p_endpoint: parsed.data,
  });
  return data === true;
}
