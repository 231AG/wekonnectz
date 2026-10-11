import "server-only";

import { currentRequestIp } from "@/lib/auth/request-context";
import { createAdminClient } from "@/lib/supabase/admin";

export type OtpCheck = { outcome: "OK"; authCode: string } | { outcome: "WRONG" | "LIMITED" | "UNAVAILABLE" };

/**
 * Checks the code a member typed (§22, Phase 12). The SMS carries our own code, not Supabase Auth's;
 * on a match the database returns Auth's code to verify with and opens a one-minute ticket that the
 * custom access token hook requires before it issues a member session. Every attempt counts against
 * the per-phone and per-client-IP limits. Fails closed.
 */
export async function checkOtpCode(phoneE164: string, code: string): Promise<OtpCheck> {
  const { data, error } = await createAdminClient()
    .rpc("otp_check_code", { p_phone: phoneE164, p_ip: await currentRequestIp(), p_code: code })
    .single();
  if (error || !data) return { outcome: "UNAVAILABLE" };
  if (data.outcome === "OK" && data.auth_code) return { outcome: "OK", authCode: data.auth_code };
  return { outcome: data.outcome === "LIMITED" ? "LIMITED" : "WRONG" };
}
