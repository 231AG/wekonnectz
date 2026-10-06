import { z } from "zod";

/**
 * One schema per onboarding form, used by the client for instant feedback and by the server action
 * as the authoritative check (spec §5). Detection (BR-31) runs on the server after this.
 */

const GENDERS = ["WOMAN", "MAN"] as const;

export const rulesSchema = z.object({
  agree: z.literal("on", { error: "Tick the box to agree to the rules, Terms and Privacy Policy." }),
  RULES: z.string().min(1),
  TERMS: z.string().min(1),
  PRIVACY: z.string().min(1),
});

export const basicsSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, { error: "Use at least 2 characters." })
    .max(30, { error: "Use 30 characters or fewer." })
    .regex(/^[\p{L}][\p{L}\p{M} .'-]*$/u, { error: "Use letters only (spaces, apostrophes and hyphens are fine)." }),
  gender: z.enum(GENDERS, { error: "Choose one." }),
  seeking: z.array(z.enum(GENDERS)).min(1, { error: "Choose at least one." }).max(2),
  areaId: z.uuid({ error: "Choose your community." }),
  intent: z.enum(["RELATIONSHIP", "CASUAL", "BOTH"], { error: "Choose what you’re looking for." }),
});

export const interestsBioSchema = z.object({
  interestIds: z
    .array(z.uuid())
    .refine((ids) => new Set(ids).size === ids.length, { error: "Choose each interest once." })
    .refine((ids) => ids.length >= 3, { error: "Choose at least 3 interests." }),
  bio: z.string().trim().max(500, { error: "Keep your bio to 500 characters or fewer." }),
});

export type BasicsInput = z.infer<typeof basicsSchema>;
export type InterestsBioInput = z.infer<typeof interestsBioSchema>;

/** Field errors keyed by field name, first message only. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
