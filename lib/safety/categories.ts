import type { Database } from "@/lib/supabase/database.types";

export type ReportCategory = Database["public"]["Enums"]["report_category"];
export type ReportPriority = Database["public"]["Enums"]["report_priority"];

/**
 * Spec §17 report categories. `member` is the option the reporter picks; `staff` is the queue label.
 * Priority and automatic actions are decided in the database (report_priority_for, submit_report).
 */
export const REPORT_CATEGORIES: Record<ReportCategory, { member: string; staff: string }> = {
  UNDER_18: { member: "They look under 18", staff: "Appears under 18" },
  SELLING_SEX: { member: "Selling or buying sex", staff: "Selling or buying sex" },
  MONEY_SCAM: { member: "Asking for money or a scam", staff: "Asking for money / scam" },
  THREATS_HARASSMENT: { member: "Threats or harassment", staff: "Threats or harassment" },
  FAKE_PROFILE: { member: "Fake profile or pretending to be someone", staff: "Fake profile / impersonation" },
  INAPPROPRIATE_PHOTO: { member: "Inappropriate photo", staff: "Inappropriate photo" },
  SPAM: { member: "Spam", staff: "Spam" },
  OTHER: { member: "Something else", staff: "Other" },
};

export const REPORT_CATEGORY_KEYS = Object.keys(REPORT_CATEGORIES) as ReportCategory[];

/** Staff-facing short reference for a member account, so lists don't lead with names (admin mock-up 03). */
export function accountRef(userId: string): string {
  return `Account #${userId.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

/** Ban reason codes recorded in the audit log and phone blocklist (spec §8). */
export const BAN_REASONS = {
  UNDERAGE: "Under 18",
  SELLING_SEX: "Selling or buying sex",
  SCAM_OR_FRAUD: "Scam or fraud",
  THREATS_HARASSMENT: "Threats or harassment",
  FAKE_IDENTITY: "Fake identity",
  REPEATED_VIOLATIONS: "Repeated rule violations",
} as const;

export type BanReason = keyof typeof BAN_REASONS;
export const BAN_REASON_KEYS = Object.keys(BAN_REASONS) as BanReason[];

/** Suspension lengths offered to moderators (days). */
export const SUSPENSION_DAYS = [1, 3, 7, 30] as const;
