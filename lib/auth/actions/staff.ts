"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth/staff";
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

export async function staffSignIn(_prev: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Enter your email and password." };

  const supabase = await createClient();
  // Supabase Auth refuses passwords for member accounts (password-verification hook) and rate-limits
  // attempts per IP. Either way the answer is the same.
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: WRONG };

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
  if (error) return { error: "That code didn’t work. Check the time on your phone and try again." };
  redirect("/admin");
}

export async function staffSignOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
