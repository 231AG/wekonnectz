"use server";

import { redirect } from "next/navigation";

import { clearPendingDob, getPendingDob, isAgeBlocked, setAgeBlock, setPendingDob } from "@/lib/auth/cookies";
import { currentRequestCountry, currentRequestIp } from "@/lib/auth/request-context";
import { canHoldSession, getMember, nextStepFor } from "@/lib/auth/session";
import type { AgeGateState, PhoneStepState } from "@/lib/auth/actions/types";
import { checkAdult, toIsoDate } from "@/lib/domain/age";
import { checkLiberianPhone, maskPhone } from "@/lib/domain/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MESSAGES = {
  invalidDate: "Enter a real date of birth.",
  implausible: "Check the year — that doesn't look right.",
  invalidPhone: "Enter a valid Liberian mobile number.",
  notLiberian: "Only +231 numbers can sign up.",
  blockedNumber: "This number can't be used to sign up.",
  rateLimited: "Too many attempts. Try again later.",
  sendFailed: "We couldn't send a code right now. Try again in a minute.",
  badCode: "That code is wrong or has expired.",
  unavailable: "This account isn't available.",
  unavailableService: "Sign-up is temporarily unavailable. Try again later.",
} as const;

/** Age gate (onboarding step 2, BR-4). Runs before any phone number is asked for. */
export async function submitAgeGate(_prev: AgeGateState, formData: FormData): Promise<AgeGateState> {
  const values = {
    day: String(formData.get("day") ?? ""),
    month: String(formData.get("month") ?? ""),
    year: String(formData.get("year") ?? ""),
  };

  if (await isAgeBlocked()) redirect("/signup/not-eligible");

  const check = checkAdult(values.day, values.month, values.year);
  if (!check.ok) {
    if (check.reason === "UNDER_18") {
      await setAgeBlock();
      redirect("/signup/not-eligible");
    }
    return { error: check.reason === "IMPLAUSIBLE" ? MESSAGES.implausible : MESSAGES.invalidDate, values };
  }

  const iso = toIsoDate(check.dob);

  // A signed-in member without a date of birth (e.g. returned after an interrupted signup) records it now.
  const member = await getMember();
  if (member) {
    if (!member.hasDateOfBirth) {
      const supabase = await createClient();
      const { error } = await supabase.rpc("set_date_of_birth", { p_dob: iso });
      if (error && !error.message.includes("DOB_LOCKED")) return { error: MESSAGES.invalidDate, values };
    }
    redirect(nextStepFor({ ...member, hasDateOfBirth: true }));
  }

  await setPendingDob(iso);
  redirect("/signup/phone");
}

/** Phone step: Liberia pre-filter (BR-1, BR-2, BR-3) BEFORE any OTP is requested (§3 rule 3). */
export async function sendSignupCode(_prev: PhoneStepState, formData: FormData): Promise<PhoneStepState> {
  const raw = String(formData.get("phone") ?? "");
  if (!(await getPendingDob())) redirect("/signup");

  const phone = checkLiberianPhone(raw);
  if (!phone.ok) {
    return {
      stage: "phone",
      phone: raw,
      error: phone.reason === "NOT_LIBERIAN" ? MESSAGES.notLiberian : MESSAGES.invalidPhone,
    };
  }

  const { data: result, error } = await createAdminClient().rpc("begin_signup", {
    p_phone: phone.e164,
    p_ip_country: (await currentRequestCountry()) ?? "",
    p_ip: await currentRequestIp(),
  });
  if (error || !result) return { stage: "phone", phone: raw, error: MESSAGES.unavailableService };

  switch (result) {
    case "BLOCKED_COUNTRY":
      redirect("/region-blocked");
    case "BLOCKED_PHONE":
      return { stage: "phone", phone: raw, error: MESSAGES.notLiberian };
    case "BLOCKED_LIST":
      return { stage: "phone", phone: raw, error: MESSAGES.blockedNumber };
    case "RATE_LIMITED":
      return { stage: "phone", phone: raw, error: MESSAGES.rateLimited };
    case "PASS":
      break;
  }

  // Only our server creates member accounts (public signup is off in Auth config), and only after the
  // pre-filter above. Auth marks the number confirmed so it can send a login code; possession is still
  // proven by the OTP before anyone gets a session, and members can never use a password (Auth hook).
  // Until then the account is PENDING with no date of birth and cannot do anything.
  const { error: createError } = await createAdminClient().auth.admin.createUser({
    phone: phone.e164,
    phone_confirm: true,
  });
  if (createError && createError.code !== "phone_exists") {
    return { stage: "phone", phone: raw, error: MESSAGES.unavailableService };
  }

  const supabase = await createClient();
  const { error: otpError } = await supabase.auth.signInWithOtp({
    phone: phone.e164,
    options: { shouldCreateUser: false, channel: "sms" },
  });
  if (otpError) {
    return {
      stage: "phone",
      phone: raw,
      error: otpError.status === 429 ? MESSAGES.rateLimited : MESSAGES.sendFailed,
    };
  }

  return { stage: "code", phone: phone.e164, maskedPhone: maskPhone(phone.e164), sentAt: Date.now() };
}

/** Verifies the OTP, records the date of birth from the age gate, and moves on. */
export async function verifySignupCode(prev: PhoneStepState, formData: FormData): Promise<PhoneStepState> {
  const phone = checkLiberianPhone(String(formData.get("phone") ?? ""));
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (!phone.ok) return { stage: "phone", error: MESSAGES.invalidPhone };
  const codeState = {
    stage: "code" as const,
    phone: phone.e164,
    maskedPhone: maskPhone(phone.e164),
    sentAt: prev.stage === "code" ? prev.sentAt : Date.now(),
  };
  if (code.length !== 6) return { ...codeState, error: MESSAGES.badCode };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ phone: phone.e164, token: code, type: "sms" });
  if (error) return { ...codeState, error: error.status === 429 ? MESSAGES.rateLimited : MESSAGES.badCode };

  const member = await getMember();
  if (!member || !canHoldSession(member.status)) {
    await supabase.auth.signOut();
    return { stage: "phone", error: MESSAGES.unavailable };
  }

  if (!member.hasDateOfBirth) {
    const dob = await getPendingDob();
    if (!dob) redirect("/signup");
    const { error: dobError } = await supabase.rpc("set_date_of_birth", { p_dob: dob });
    if (dobError && !dobError.message.includes("DOB_LOCKED")) redirect("/signup");
  }
  await clearPendingDob();

  redirect(nextStepFor({ ...member, hasDateOfBirth: true }));
}

/** Single entry point for the phone screen: `intent` = "send" (or resend) | "verify" | "change". */
export async function signupPhoneStep(prev: PhoneStepState, formData: FormData): Promise<PhoneStepState> {
  const intent = formData.get("intent");
  if (intent === "change") return { stage: "phone" };
  return intent === "verify" ? verifySignupCode(prev, formData) : sendSignupCode(prev, formData);
}
