import { NextResponse } from "next/server";

import { verifyStandardWebhook } from "@/lib/auth/webhook-signature";
import { checkLiberianPhone } from "@/lib/domain/phone";
import { serverEnv } from "@/lib/env.server";
import { getSmsProvider } from "@/lib/sms/provider";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Supabase Auth Send-SMS hook (plan §1.5). Auth calls this for every OTP SMS.
 * 1. Verify the Standard Webhooks signature (only Supabase Auth can call it).
 * 2. +231 only (BR-2), per-phone hourly limit (§22).
 * 3. Deliver through the SMS provider adapter.
 * Never logs the phone number or the code (§6 rule 7).
 */

type HookPayload = { user?: { phone?: string }; sms?: { otp?: string } };

function hookError(status: number, message: string) {
  return NextResponse.json({ error: { http_code: status, message } }, { status });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const valid = verifyStandardWebhook(
    serverEnv().SEND_SMS_HOOK_SECRET,
    {
      id: request.headers.get("webhook-id"),
      timestamp: request.headers.get("webhook-timestamp"),
      signature: request.headers.get("webhook-signature"),
    },
    rawBody,
  );
  if (!valid) return hookError(401, "Invalid signature.");

  let payload: HookPayload;
  try {
    payload = JSON.parse(rawBody) as HookPayload;
  } catch {
    return hookError(400, "Bad payload.");
  }

  const code = payload.sms?.otp;
  const phone = checkLiberianPhone(`+${(payload.user?.phone ?? "").replace(/^\+/, "")}`);
  if (!phone.ok || !code || !/^\d{4,10}$/.test(code))
    return hookError(400, "Only Liberian (+231) numbers are supported.");

  const { data: allowed, error } = await createAdminClient().rpc("otp_send_allowed", { p_phone: phone.e164 });
  if (error) return hookError(500, "Sign-in is temporarily unavailable.");
  if (!allowed) return hookError(429, "Too many codes requested for this number. Try again later.");

  try {
    await getSmsProvider().sendOtp({ phoneE164: phone.e164, code });
  } catch {
    return hookError(502, "We couldn't send the code. Try again shortly.");
  }

  return NextResponse.json({});
}
