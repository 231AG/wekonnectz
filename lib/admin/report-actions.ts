"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { banSchema, noteSchema, resolveReportSchema, suspendSchema } from "@/lib/validation/safety";

/**
 * Reports and flags queues (spec §21). Every action runs as the staff session: the database
 * functions check is_staff() (ADMIN for ban / restore), and write the audit row in the same
 * transaction (BR-34). Members' text is never logged.
 */

export type StaffActionState = { error?: string; ok?: string };

const DB_MESSAGES: Record<string, string> = {
  REPORT_NOT_OPEN: "This report was already closed.",
  REPORT_NOT_FOUND: "This report doesn’t exist.",
  HIGH_REPORTS_OPEN: "Other high-priority reports about this member are still open. Close them first.",
  OWN_CONTENT: "You can’t act on your own account.",
  MEMBER_NOT_FOUND: "This account isn’t a member account.",
  ADMIN_REQUIRED: "Only an admin can do this.",
  ACCOUNT_NOT_SUSPENDABLE: "This account can’t be suspended (it is banned or deleted).",
  ALREADY_SUSPENDED_LONGER: "This account is already suspended for longer. Only an admin can shorten or lift it.",
  ACCOUNT_NOT_BANNABLE: "This account is already banned or was deleted.",
  NOT_HIDDEN: "This member is already visible.",
  NOTHING_TO_RESTORE: "This account isn’t banned or suspended.",
  FLAG_NOT_OPEN: "This flag was already handled.",
  CLAIM_PENDING: "Decide the payment claim first; its flags are settled with it.",
  INVALID_SUSPENSION_END: "Choose a suspension length.",
};

function fail(message: string): StaffActionState {
  const code = Object.keys(DB_MESSAGES).find((c) => message.includes(c));
  return { error: code ? DB_MESSAGES[code] : "Couldn’t save. Try again." };
}

function done(ok: string): StaffActionState {
  revalidatePath("/admin", "layout");
  return { ok };
}

const optional = (v: FormDataEntryValue | null) => (typeof v === "string" && v ? v : undefined);

export async function addReportNoteAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  await requireStaff();
  const parsed = noteSchema.safeParse({ reportId: formData.get("reportId"), note: formData.get("note") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Write a note first." };
  const { error } = await (
    await createClient()
  ).rpc("add_report_note", { p_report_id: parsed.data.reportId, p_note: parsed.data.note });
  return error ? fail(error.message) : done("Note added.");
}

export async function resolveReportAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  await requireStaff();
  const parsed = resolveReportSchema.safeParse({
    reportId: formData.get("reportId"),
    outcome: formData.get("outcome"),
    restoreVisibility: formData.get("restoreVisibility") === "on",
    photoReason: optional(formData.get("photoReason")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Something went wrong." };
  const { error } = await (
    await createClient()
  ).rpc("resolve_report", {
    p_report_id: parsed.data.reportId,
    p_dismiss: parsed.data.outcome === "dismiss",
    p_restore_visibility: parsed.data.restoreVisibility,
    p_photo_reason: parsed.data.photoReason,
  });
  return error
    ? fail(error.message)
    : done(parsed.data.outcome === "dismiss" ? "Report dismissed." : "Report resolved.");
}

export async function suspendUserAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  await requireStaff();
  const parsed = suspendSchema.safeParse({
    userId: formData.get("userId"),
    days: formData.get("days"),
    reportId: optional(formData.get("reportId")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Choose a length." };
  const until = new Date(Date.now() + parsed.data.days * 86_400_000).toISOString();
  const { error } = await (
    await createClient()
  ).rpc("suspend_user", { p_target: parsed.data.userId, p_until: until, p_report_id: parsed.data.reportId });
  return error
    ? fail(error.message)
    : done(`Suspended for ${parsed.data.days} day${parsed.data.days === 1 ? "" : "s"}.`);
}

export async function banUserAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  await requireStaff("ADMIN");
  if (formData.get("confirm") !== "on") return { error: "Tick the box to confirm the ban." };
  const parsed = banSchema.safeParse({
    userId: formData.get("userId"),
    reason: formData.get("reason") || undefined,
    reportId: optional(formData.get("reportId")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Choose a reason." };
  const { error } = await (
    await createClient()
  ).rpc("ban_user", { p_target: parsed.data.userId, p_reason: parsed.data.reason, p_report_id: parsed.data.reportId });
  return error ? fail(error.message) : done("Account banned. The phone number can’t register again.");
}

export async function restoreUserAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  await requireStaff("ADMIN");
  const parsed = z.uuid().safeParse(formData.get("userId"));
  if (!parsed.success) return { error: "Something went wrong." };
  const { error } = await (await createClient()).rpc("restore_user", { p_target: parsed.data });
  return error ? fail(error.message) : done("Account restored.");
}

/** Back into discovery after review (no open HIGH report about the member); audited. */
export async function unhideMemberAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  await requireStaff();
  const parsed = z.uuid().safeParse(formData.get("userId"));
  if (!parsed.success) return { error: "Something went wrong." };
  const { error } = await (await createClient()).rpc("unhide_member", { p_target: parsed.data });
  return error ? fail(error.message) : done("The member is visible again.");
}

export async function resolveFlagAction(_prev: StaffActionState, formData: FormData): Promise<StaffActionState> {
  await requireStaff();
  const parsed = z
    .object({ flagId: z.uuid(), outcome: z.enum(["dismiss", "resolve"]) })
    .safeParse({ flagId: formData.get("flagId"), outcome: formData.get("outcome") });
  if (!parsed.success) return { error: "Something went wrong." };
  const { error } = await (
    await createClient()
  ).rpc("resolve_flag", { p_flag_id: parsed.data.flagId, p_dismiss: parsed.data.outcome === "dismiss" });
  return error ? fail(error.message) : done(parsed.data.outcome === "dismiss" ? "Flag dismissed." : "Flag resolved.");
}

export type CapturedMessages = { messages?: { fromReported: boolean; body: string; sentAt: string }[]; error?: string };

/**
 * Opens the messages captured with a report (OD-26). The database writes a REPORTED_MESSAGES_VIEWED
 * audit row before returning them (OD-33, BR-34), so every view is recorded. Text is never logged.
 */
export async function openReportMessages(reportId: string): Promise<CapturedMessages> {
  await requireStaff();
  const parsed = z.uuid().safeParse(reportId);
  if (!parsed.success) return { error: "Not found." };
  const { data, error } = await (await createClient()).rpc("staff_report_messages", { p_report_id: parsed.data });
  if (error) return fail(error.message);
  return { messages: (data ?? []).map((m) => ({ fromReported: m.from_reported, body: m.body, sentAt: m.sent_at })) };
}
