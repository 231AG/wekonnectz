"use server";

import { redirect } from "next/navigation";

import { currentRequestCountry, currentRequestIp } from "@/lib/auth/request-context";
import { otpAttemptAllowed } from "@/lib/auth/otp-guard";
import { canHoldSession, getMember, nextStepFor } from "@/lib/auth/session";
import type { PhoneStepState } from "@/lib/auth/actions/types";
import { isAllowedCountry } from "@/lib/domain/geo";
import { checkLiberianPhone, maskPhone } from "@/lib/domain/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { pushEndpointSchema } from "@/lib/validation/notifications";

const GENERIC_SENT = "If this number has an account, we've sent it a code. No code? Wait a minute and resend.";

/**
 * Login code. Existing members are not re-checked for location (§3 rule 6) unless the owner
 * switches geo.enforcement_mode to EVERY_SESSION. The response never reveals whether a number
 * has an account.
 */
export async function sendLoginCode(_prev: PhoneStepState, formData: FormData): Promise<PhoneStepState> {
  const raw = String(formData.get("phone") ?? "");
  const phone = checkLiberianPhone(raw);
  if (!phone.ok) return { stage: "phone", phone: raw, error: "Enter your +231 mobile number." };

  const admin = createAdminClient();
  const [{ data: mode }, { data: ipAllowed }] = await Promise.all([
    admin.rpc("get_setting", { p_key: "geo.enforcement_mode" }),
    admin.rpc("otp_ip_allowed", { p_ip: await currentRequestIp() }),
  ]);
  if (ipAllowed === null)
    return { stage: "phone", phone: raw, error: "Sign-in is temporarily unavailable. Try again later." };
  if (!ipAllowed) return { stage: "phone", phone: raw, error: "Too many attempts. Try again later." };
  if (mode === "EVERY_SESSION" && !isAllowedCountry(await currentRequestCountry())) redirect("/region-blocked");

  const supabase = await createClient();
  // Every outcome (sent, unknown number, per-number limit, resend too soon) gets the same screen,
  // so the response never reveals whether a number has an account.
  await supabase.auth.signInWithOtp({ phone: phone.e164, options: { shouldCreateUser: false, channel: "sms" } });

  return {
    stage: "code",
    phone: phone.e164,
    maskedPhone: maskPhone(phone.e164),
    sentAt: Date.now(),
    notice: GENERIC_SENT,
  };
}

export async function verifyLoginCode(prev: PhoneStepState, formData: FormData): Promise<PhoneStepState> {
  const phone = checkLiberianPhone(String(formData.get("phone") ?? ""));
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (!phone.ok) return { stage: "phone", error: "Enter your +231 mobile number." };
  const codeState = {
    stage: "code" as const,
    phone: phone.e164,
    maskedPhone: maskPhone(phone.e164),
    sentAt: prev.stage === "code" ? prev.sentAt : Date.now(),
  };
  if (code.length !== 6) return { ...codeState, error: "That code is wrong or has expired." };
  if (!(await otpAttemptAllowed(phone.e164))) return { ...codeState, error: "Too many attempts. Try again later." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ phone: phone.e164, token: code, type: "sms" });
  // A banned account is refused by Supabase Auth itself (BR-6); show the same neutral message.
  if (error) return { ...codeState, error: "That code is wrong or has expired." };

  const member = await getMember();
  if (!member || !canHoldSession(member.status)) {
    await supabase.auth.signOut();
    return { stage: "phone", error: "This account isn't available." };
  }
  redirect(nextStepFor(member));
}

export async function signOut(formData?: FormData) {
  const supabase = await createClient();
  // This phone stops getting the member's notifications (a shared phone must not show them to the next
  // person). The endpoint comes from <PushEndpointField> in the form.
  const endpoint = pushEndpointSchema.safeParse(formData?.get("pushEndpoint"));
  if (endpoint.success) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await createAdminClient().rpc("delete_push_subscription", { p_user: user.id, p_endpoint: endpoint.data });
    }
  }
  await supabase.auth.signOut();
  redirect("/");
}

/** Single entry point for the login screen: `intent` = "send" (or resend) | "verify" | "change". */
export async function loginPhoneStep(prev: PhoneStepState, formData: FormData): Promise<PhoneStepState> {
  const intent = formData.get("intent");
  if (intent === "change") return { stage: "phone" };
  return intent === "verify" ? verifyLoginCode(prev, formData) : sendLoginCode(prev, formData);
}
