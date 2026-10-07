"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { currentRequestIp } from "@/lib/auth/request-context";
import { getStaffSession } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Staff sign-in (spec §7, OD-27): email + password, then a TOTP code from an authenticator app.
 * Messages never say whether an email belongs to a staff account.
 */

export type StaffFormState = { error?: string };
export type EnrolState = { error?: string; factorId?: string; qrCode?: string; secret?: string };

const WRONG = "Email or password is wrong.";
const credentials = z.object({ email: z.email().max(254), password: z.string().min(1).max(200) });
const code = z.string().regex(/^\d{6}$/);
const TOO_MANY = "Too many attempts. Try again later.";

/**
 * Failed attempts are limited per client IP, per account from that IP, and per account overall
 * (a looser backstop). Supabase Auth's own per-IP limits see only our server's address. Only failures
 * count, so a stranger who knows a staff email can't lock that person out. Fails closed.
 */
async function attemptAllowed(account: string): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("staff_sign_in_allowed", {
    p_ip: await currentRequestIp(),
    p_account: account,
  });
  return !error && data === true;
}

async function recordFailure(account: string): Promise<void> {
  await createAdminClient().rpc("record_staff_sign_in_failure", {
    p_ip: await currentRequestIp(),
    p_account: account,
  });
}

export async function staffSignIn(_prev: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Enter your email and password." };

  if (!(await attemptAllowed(parsed.data.email))) return { error: TOO_MANY };

  const supabase = await createClient();
  // Supabase Auth refuses passwords for member accounts (password-verification hook). Either way
  // the answer is the same.
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    await recordFailure(parsed.data.email);
    return { error: WRONG };
  }

  const session = await getStaffSession();
  if (!session?.role) {
    await supabase.auth.signOut();
    return { error: WRONG };
  }
  redirect("/admin/mfa");
}

/** First sign-in: creates a TOTP factor and returns its QR code. Earlier unfinished set-ups are removed. */
export async function startTotpEnrolment(): Promise<EnrolState> {
  const session = await getStaffSession();
  if (!session?.role) redirect("/admin/login");
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (factors?.totp.length) redirect("/admin/mfa");
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "WeKonnectz admin" });
  if (error || !data) return { error: "Couldn’t start set-up. Try again." };
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/**
 * Verifies a 6-digit code. With a verified factor the server picks it; during set-up the factor id
 * must be one of this account's own unverified factors. Success upgrades the session to aal2.
 */
export async function verifyTotp(_prev: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const session = await getStaffSession();
  if (!session?.role) redirect("/admin/login");
  const parsed = code.safeParse(String(formData.get("code") ?? "").replace(/\s/g, ""));
  if (!parsed.success) return { error: "Enter the 6-digit code from your authenticator app." };
  if (!(await attemptAllowed(session.id))) return { error: TOO_MANY };

  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp[0];
  const requested = String(formData.get("factorId") ?? "");
  const pending = (factors?.all ?? []).find(
    (f) => f.id === requested && f.factor_type === "totp" && f.status === "unverified",
  );
  const factorId = verified?.id ?? pending?.id;
  if (!factorId) return { error: "Set up your authenticator app first." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: parsed.data });
  if (error) {
    await recordFailure(session.id);
    return { error: "That code didn’t work. Check the time on your phone and try again." };
  }
  redirect("/admin");
}

export async function staffSignOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
