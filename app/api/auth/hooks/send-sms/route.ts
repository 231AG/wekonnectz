import { NextResponse } from "next/server";

import { verifyStandardWebhook } from "@/lib/auth/webhook-signature";
import { checkLiberianPhone } from "@/lib/domain/phone";
import { serverEnv } from "@/lib/env.server";
import { getSmsProvider } from "@/lib/sms/provider";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Supabase Auth Send-SMS hook (plan §1.5). Auth calls this for every OTP SMS.
 * 1. Verify the Standard Webhooks signature (only Supabase Auth can call it) and refuse replays.
 * 2. The destination (`sms.phone`) must be the account's own number: phone changes are not
 *    allowed in the MVP (a new number would bypass BR-2/BR-3), so no SMS goes to a new number.
 * 3. +231 only (BR-2), per-phone hourly limit (§22), then the SMS provider adapter.
 * Never logs the phone number or the code (§6 rule 7).
 */

type HookPayload = {
  user?: { phone?: string; new_phone?: string };
  sms?: { otp?: string; phone?: string };
};

const digits = (value: string | undefined) => (value ?? "").replace(/\D/g, "");

function hookError(status: number, message: string) {
  return NextResponse.json({ error: { http_code: status, message } }, { status });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const messageId = request.headers.get("webhook-id");
  const valid = verifyStandardWebhook(
    serverEnv().SEND_SMS_HOOK_SECRET,
    {
      id: messageId,
      timestamp: request.headers.get("webhook-timestamp"),
      signature: request.headers.get("webhook-signature"),
    },
    rawBody,
  );
  if (!valid || !messageId) return hookError(401, "Invalid signature.");

  let payload: HookPayload;
  try {
    payload = JSON.parse(rawBody) as HookPayload;
  } catch {
    return hookError(400, "Bad payload.");
  }

  const code = payload.sms?.otp;
  const destination = digits(payload.sms?.phone ?? payload.user?.phone);
  if (!code || !/^\d{4,10}$/.test(code) || !destination) return hookError(400, "Bad payload.");

  if (payload.user?.new_phone || destination !== digits(payload.user?.phone)) {
    return hookError(403, "Phone numbers can't be changed.");
  }

  const phone = checkLiberianPhone(`+${destination}`);
  if (!phone.ok) return hookError(403, "Only Liberian (+231) numbers are supported.");

  const admin = createAdminClient();
  const { data: firstTime, error: receiptError } = await admin.rpc("claim_hook_receipt", { p_message_id: messageId });
  if (receiptError) return hookError(500, "Sign-in is temporarily unavailable.");
  // A replayed message was already handled: acknowledge without sending again.
  if (!firstTime) return NextResponse.json({});

  const { data: allowed, error } = await admin.rpc("otp_send_allowed", { p_phone: phone.e164 });
  if (error) return hookError(500, "Sign-in is temporarily unavailable.");
  if (!allowed) return hookError(429, "Too many codes requested for this number. Try again later.");

  try {
    await getSmsProvider().sendOtp({ phoneE164: phone.e164, code });
  } catch {
    return hookError(502, "We couldn't send the code. Try again shortly.");
  }

  return NextResponse.json({});
}
