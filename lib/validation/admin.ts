import { z } from "zod";

/** Admin console forms (spec §21). The database re-checks every rule; these give clear messages first. */

const reason = z
  .string()
  .trim()
  .min(5, { error: "Give a reason (at least 5 characters)." })
  .max(500, { error: "Use 500 characters or fewer." });

export const correctDobSchema = z.object({
  userId: z.uuid(),
  dob: z.iso.date({ error: "Enter the corrected date of birth." }),
  reason,
});

export const extendSubscriptionSchema = z.object({
  subscriptionId: z.uuid(),
  days: z.coerce.number().int({ error: "Whole days only." }).min(1, { error: "At least 1 day." }),
  reason,
});

export const refundSchema = z.object({
  paymentId: z.uuid(),
  reason,
  confirm: z.literal(true, { error: "Tick to confirm the money was sent back." }),
});

export const SETTING_KINDS = ["int", "bool", "object", "array", "enum"] as const;
export type SettingKind = (typeof SETTING_KINDS)[number];

/** Turns the form text into the JSON value for a setting of this kind, or an error message. */
export function parseSettingValue(kind: SettingKind, raw: string): { value: unknown } | { error: string } {
  const text = raw.trim();
  if (kind === "int") {
    if (!/^\d{1,7}$/.test(text)) return { error: "Enter a whole number." };
    return { value: Number(text) };
  }
  if (kind === "bool") {
    if (text !== "true" && text !== "false") return { error: "Choose yes or no." };
    return { value: text === "true" };
  }
  if (kind === "enum") {
    if (!text) return { error: "Choose a value." };
    return { value: text };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "That isn’t valid JSON." };
  }
  if (kind === "array" && (!Array.isArray(parsed) || parsed.length === 0))
    return { error: "Enter a non-empty JSON list." };
  if (kind === "object" && (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))) {
    return { error: "Enter a JSON object." };
  }
  return { value: parsed };
}

export const settingSchema = z.object({
  key: z.string().regex(/^[a-z_]+(\.[a-z_]+)+$/),
  kind: z.enum(SETTING_KINDS),
  value: z.string().max(20_000, { error: "That value is too long." }),
});

export const planSchema = z.object({
  planId: z.uuid().optional(),
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_]{2,30}$/, { error: "Code: capital letters, digits and _ only." })
    .optional(),
  name: z.string().trim().min(2, { error: "Enter a name." }).max(60),
  source: z.enum(["MOBILE_MONEY", "CARD"]),
  durationHours: z.coerce
    .number()
    .int()
    .min(1, { error: "Duration must be at least 1 hour." })
    .max(24 * 366),
  price: z.coerce.number().positive({ error: "Enter a price above 0." }).max(10_000),
  processorPriceId: z.string().trim().max(100).optional(),
  active: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(1000),
});

export const merchantAccountSchema = z.object({
  accountId: z.uuid().optional(),
  provider: z.enum(["ORANGE_MONEY", "MTN_MOMO"]),
  displayName: z.string().trim().min(2, { error: "Enter the account name members will see." }).max(80),
  numberOrCode: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z*#+ -]{3,30}$/, { error: "Enter the wallet number or merchant code." }),
  active: z.boolean(),
});

export const interestSchema = z.object({
  interestId: z.uuid().optional(),
  name: z.string().trim().min(2, { error: "Enter a name." }).max(40),
  active: z.boolean(),
});

export const areaSchema = z.object({
  areaId: z.uuid().optional(),
  county: z.string().trim().min(2, { error: "Enter the county." }).max(60),
  name: z.string().trim().min(2, { error: "Enter the community." }).max(60),
  active: z.boolean(),
});

export const STAFF_ROLES = ["MODERATOR", "ADMIN", "SUPER_ADMIN"] as const;

export const createStaffSchema = z.object({
  email: z.email({ error: "Enter a work email address." }).max(254),
  role: z.enum(STAFF_ROLES, { error: "Choose a role." }),
});

export const staffRoleSchema = z.object({ userId: z.uuid(), role: z.enum(STAFF_ROLES) });
export const staffEnabledSchema = z.object({ userId: z.uuid(), enabled: z.boolean() });
