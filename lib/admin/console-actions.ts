"use server";

import { randomBytes } from "node:crypto";

import * as Sentry from "@sentry/nextjs";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { StaffActionState } from "@/lib/admin/report-actions";
import { requireStaff } from "@/lib/auth/staff";
import { stopCardRenewals } from "@/lib/payments/card/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  areaSchema,
  correctDobSchema,
  createStaffSchema,
  extendSubscriptionSchema,
  interestSchema,
  merchantAccountSchema,
  parseSettingValue,
  planSchema,
  refundSchema,
  settingSchema,
  staffEnabledSchema,
  staffRoleSchema,
} from "@/lib/validation/admin";

/**
 * Admin console actions (spec §7, §21). Each runs as the signed-in staff member: the database
 * function checks role + MFA again and writes the audit row in the same transaction (BR-34). Values
 * typed by staff are never logged here.
 */

const DB_MESSAGES: Record<string, string> = {
  STAFF_ONLY: "You don’t have permission to do this.",
  SUPER_ADMIN_ONLY: "Only a super admin can change this setting.",
  REASON_REQUIRED: "Give a reason (at least 5 characters).",
  MEMBER_NOT_FOUND: "This account isn’t a member account.",
  UNDER_18: "That date makes the member under 18. Ban the account instead of correcting it.",
  IMPLAUSIBLE_DOB: "That date of birth isn’t plausible.",
  EXTENSION_OUT_OF_RANGE: "That goes over the most days a pass can be extended in total.",
  "has no value": "This needs an owner decision first (the setting has no value yet).",
  NOT_EXTENDABLE: "Only a pass that is running now can be extended.",
  CARD_EXTEND_AT_PROCESSOR: "Card plans are extended at the card processor, not here.",
  EXTEND_LAST_PASS: "This member has another pass after this one. Extend the last one instead.",
  MEMBER_NOT_AVAILABLE: "This member’s account is deleted or banned.",
  PRICE_ID_REQUIRED: "Card plans need the processor’s price ID, and a new price needs a new price ID.",
  PLAN_IN_USE: "Members have used this plan, so its length can’t change. Add a new plan instead.",
  NOT_REFUNDABLE: "Only a successful payment can be refunded, once.",
  UNKNOWN_SETTING: "That setting doesn’t exist.",
  INVALID_VALUE: "That value isn’t allowed for this setting.",
  PLAN_NOT_FOUND: "That plan doesn’t exist.",
  ACCOUNT_NOT_FOUND: "That wallet doesn’t exist.",
  NOT_FOUND: "That item doesn’t exist.",
  duplicate: "Something with that name or code already exists.",
  NOT_A_NEW_STAFF_ACCOUNT: "Only a brand-new staff email account can be given a role.",
  BAD_ROLE: "Choose a staff role.",
  NOT_YOURSELF: "You can’t change your own account here.",
  STAFF_NOT_FOUND: "That staff account doesn’t exist.",
};

function fail(message: string): StaffActionState {
  const code = Object.keys(DB_MESSAGES).find((c) => message.includes(c));
  return { error: code ? DB_MESSAGES[code] : "Couldn’t save. Try again." };
}

function done(ok: string): StaffActionState {
  revalidatePath("/admin", "layout");
  return { ok };
}

const firstIssue = (e: { issues: { message: string }[] }) => e.issues[0]?.message ?? "Check the form.";
const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");
const optional = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v : undefined);

export async function correctDobAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  await requireStaff("ADMIN");
  const parsed = correctDobSchema.safeParse({
    userId: formData.get("userId"),
    dob: formData.get("dob"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { error } = await (
    await createClient()
  ).rpc("staff_correct_dob", { p_user: parsed.data.userId, p_dob: parsed.data.dob, p_reason: parsed.data.reason });
  return error ? fail(error.message) : done("Date of birth corrected.");
}

export async function extendSubscriptionAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  await requireStaff("ADMIN");
  const parsed = extendSubscriptionSchema.safeParse({
    subscriptionId: formData.get("subscriptionId"),
    days: formData.get("days"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { error } = await (
    await createClient()
  ).rpc("staff_extend_subscription", {
    p_subscription: parsed.data.subscriptionId,
    p_days: parsed.data.days,
    p_reason: parsed.data.reason,
  });
  return error ? fail(error.message) : done(`Extended by ${parsed.data.days} day${parsed.data.days === 1 ? "" : "s"}.`);
}

export async function recordRefundAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  await requireStaff("ADMIN");
  const parsed = refundSchema.safeParse({
    paymentId: formData.get("paymentId"),
    reason: formData.get("reason"),
    confirm: formData.get("confirm") === "on",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { error } = await (
    await createClient()
  ).rpc("staff_record_refund", { p_payment: parsed.data.paymentId, p_reason: parsed.data.reason });
  if (error) return fail(error.message);
  // A refunded card plan must not renew: stop it at the processor now, not at its next event.
  const { data: payment } = await createAdminClient()
    .from("payments")
    .select("user_id, source")
    .eq("id", parsed.data.paymentId)
    .single();
  if (payment?.source === "CARD" && payment.user_id && !(await stopCardRenewals(payment.user_id, false))) {
    revalidatePath("/admin", "layout");
    return {
      error:
        "Refund recorded, but the card plan couldn’t be stopped at the processor. Cancel it in the processor’s dashboard.",
    };
  }
  return done("Refund recorded. The access it paid for has ended.");
}

export async function updateSettingAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  await requireStaff("ADMIN");
  const parsed = settingSchema.safeParse({
    key: formData.get("key"),
    kind: formData.get("kind"),
    value: formData.get("value"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const value = parseSettingValue(parsed.data.kind, parsed.data.value);
  if ("error" in value) return { error: value.error };
  const { error } = await (
    await createClient()
  ).rpc("staff_update_setting", { p_key: parsed.data.key, p_value: value.value as never });
  return error ? fail(error.message) : done("Saved.");
}

export async function savePlanAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  await requireStaff("ADMIN");
  const parsed = planSchema.safeParse({
    planId: optional(formData.get("planId")),
    code: optional(formData.get("code")),
    name: formData.get("name"),
    source: formData.get("source"),
    durationHours: formData.get("durationHours"),
    price: formData.get("price"),
    processorPriceId: optional(formData.get("processorPriceId")),
    active: formData.get("active") === "on",
    sortOrder: str(formData.get("sortOrder")) || "0",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const p = parsed.data;
  if (!p.planId && !p.code) return { error: "Enter a code for the new plan." };
  const { error } = await (
    await createClient()
  ).rpc("staff_save_plan", {
    p_plan_id: p.planId as string,
    p_code: p.code ?? "",
    p_name: p.name,
    p_source: p.source,
    p_duration_hours: p.durationHours,
    p_price: p.price,
    p_processor_price_id: p.processorPriceId ?? "",
    p_active: p.active,
    p_sort_order: p.sortOrder,
  });
  return error ? fail(error.message) : done(p.planId ? "Plan saved." : "Plan added.");
}

export async function saveMerchantAccountAction(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  await requireStaff("ADMIN");
  const parsed = merchantAccountSchema.safeParse({
    accountId: optional(formData.get("accountId")),
    provider: formData.get("provider"),
    displayName: formData.get("displayName"),
    numberOrCode: formData.get("numberOrCode"),
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const a = parsed.data;
  const { error } = await (
    await createClient()
  ).rpc("staff_save_merchant_account", {
    p_account_id: a.accountId as string,
    p_provider: a.provider,
    p_display_name: a.displayName,
    p_number_or_code: a.numberOrCode,
    p_active: a.active,
  });
  return error ? fail(error.message) : done("Wallet saved.");
}

export async function saveInterestAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  await requireStaff("ADMIN");
  const parsed = interestSchema.safeParse({
    interestId: optional(formData.get("interestId")),
    name: formData.get("name"),
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { error } = await (
    await createClient()
  ).rpc("staff_save_interest", {
    p_interest_id: parsed.data.interestId as string,
    p_name: parsed.data.name,
    p_active: parsed.data.active,
  });
  return error ? fail(error.message) : done("Interest saved.");
}

export async function saveAreaAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  await requireStaff("ADMIN");
  const parsed = areaSchema.safeParse({
    areaId: optional(formData.get("areaId")),
    county: formData.get("county"),
    name: formData.get("name"),
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { error } = await (
    await createClient()
  ).rpc("staff_save_area", {
    p_area_id: parsed.data.areaId as string,
    p_county: parsed.data.county,
    p_name: parsed.data.name,
    p_active: parsed.data.active,
  });
  return error ? fail(error.message) : done("Area saved.");
}

export type CreateStaffState = StaffActionState & { email?: string; tempPassword?: string };

/** A one-time password the new staff member replaces after first sign-in. Meets the staff password rule. */
function temporaryPassword(): string {
  return `Wk7${randomBytes(15).toString("base64url")}`;
}

/**
 * Creates a staff email account (§7: SUPER_ADMIN only; staff accounts are separate from member
 * accounts). The server key creates the Auth account after the role check; the role is then given
 * by staff_register_new() as the super admin's own session, audited (ADMIN_CREATED). The temporary
 * password is returned once to the page and never logged or stored by us.
 */
export async function createStaffAction(_prev: CreateStaffState, formData: FormData): Promise<CreateStaffState> {
  await requireStaff("SUPER_ADMIN");
  const parsed = createStaffSchema.safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const password = temporaryPassword();
  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return {
      error: /already|exists|registered/i.test(createError?.message ?? "")
        ? "An account with that email already exists."
        : "Couldn’t create the account. Try again.",
    };
  }
  const { error } = await (
    await createClient()
  ).rpc("staff_register_new", { p_user: created.user.id, p_role: parsed.data.role });
  if (error) {
    await admin.auth.admin.deleteUser(created.user.id);
    return fail(error.message);
  }
  revalidatePath("/admin/staff");
  return { ok: "Staff account created.", email: parsed.data.email, tempPassword: password };
}

export async function setStaffRoleAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  await requireStaff("SUPER_ADMIN");
  const parsed = staffRoleSchema.safeParse({ userId: formData.get("userId"), role: formData.get("role") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { error } = await (
    await createClient()
  ).rpc("staff_set_role", { p_user: parsed.data.userId, p_role: parsed.data.role });
  return error ? fail(error.message) : done("Role changed.");
}

export async function setStaffEnabledAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  await requireStaff("SUPER_ADMIN");
  const parsed = staffEnabledSchema.safeParse({
    userId: formData.get("userId"),
    enabled: formData.get("enabled") === "true",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { error } = await (
    await createClient()
  ).rpc("staff_set_enabled", { p_user: parsed.data.userId, p_enabled: parsed.data.enabled });
  return error ? fail(error.message) : done(parsed.data.enabled ? "Account turned on." : "Account turned off.");
}

export type PhoneSearchState = { error?: string };

/**
 * Find a member by phone (§21). Posted, never a URL parameter, so the number stays out of request
 * logs (§6 rule 7). Matched in the database; the number is never returned.
 */
export async function findByPhoneAction(_prev: PhoneSearchState, formData: FormData): Promise<PhoneSearchState> {
  await requireStaff();
  const phone = str(formData.get("phone")).replace(/[^\d+]/g, "");
  if (phone.replace(/\D/g, "").length < 7) return { error: "Enter the full phone number." };
  const { data, error } = await (await createClient()).rpc("staff_users_search", { p_phone: phone, p_limit: 2 });
  if (error) return { error: "Search failed. Try again." };
  if (!data?.length) return { error: "No member has that phone number." };
  redirect(`/admin/users/${data[0].user_id}`);
}

/** The staff password rule (same as the first-admin script): 12+ characters, upper and lower case, a digit. */
const STAFF_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,200}$/;

/** Your account: change your own staff password (a TOTP-verified session is required). */
export async function changeStaffPasswordAction(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  await requireStaff();
  const password = str(formData.get("password"));
  if (!STAFF_PASSWORD.test(password)) {
    return { error: "Use at least 12 characters with upper and lower case letters and a digit." };
  }
  if (password !== str(formData.get("repeat"))) return { error: "The passwords don’t match." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (!error) {
    const { error: auditError } = await supabase.rpc("staff_log_password_change");
    // The password did change; a missing audit row must not go unnoticed.
    if (auditError) Sentry.captureMessage("staff password change not audited", { level: "error" });
  }
  if (error) {
    return {
      error: /same|different/i.test(error.message)
        ? "Choose a password you haven’t used here."
        : "Couldn’t change it. Try again.",
    };
  }
  return { ok: "Password changed." };
}
