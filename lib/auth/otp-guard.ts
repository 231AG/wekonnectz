import "server-only";

import { currentRequestIp } from "@/lib/auth/request-context";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Code attempts per phone and per client IP (§22, Phase 12). Supabase Auth only sees our server's
 * address, so its own per-IP limit can't tell guessers apart; this does. Fails closed.
 */
export async function otpAttemptAllowed(phoneE164: string): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("otp_verify_allowed", {
    p_phone: phoneE164,
    p_ip: await currentRequestIp(),
  });
  return !error && data === true;
}
