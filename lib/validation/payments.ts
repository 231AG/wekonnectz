import { z } from "zod";

export const PROVIDERS = ["ORANGE_MONEY", "MTN_MOMO"] as const;

export const PROVIDER_LABELS: Record<(typeof PROVIDERS)[number], string> = {
  ORANGE_MONEY: "Orange Money",
  MTN_MOMO: "MTN MoMo",
};

/**
 * A payment claim (spec §16 step 4). The amount is not an input: the server locks it to the plan
 * price. Liberia is on GMT all year, so the date and time entered are read as UTC.
 */
export const claimSchema = z.object({
  planId: z.uuid({ error: "Choose a plan." }),
  provider: z.enum(PROVIDERS, { error: "Choose how you paid." }),
  transactionId: z
    .string()
    .trim()
    .min(4, { error: "Enter the transaction ID from your payment message." })
    .max(40, { error: "That transaction ID is too long." }),
  senderPhone: z.string().trim().min(7, { error: "Enter the number you paid from." }),
  paidAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, { error: "Enter the date and time you paid." })
    .refine((v) => Date.parse(`${v}:00Z`) <= Date.now() + 10 * 60 * 1000, { error: "That time is in the future." }),
  evidenceId: z.uuid({ error: "Add a screenshot of your payment." }),
});

export const replySchema = z
  .object({
    claimId: z.uuid(),
    note: z.string().trim().max(500, { error: "Use 500 characters or fewer." }).optional(),
    evidenceId: z.uuid().optional(),
  })
  .refine((v) => v.note || v.evidenceId, { error: "Write an answer or add a new screenshot.", path: ["note"] });
