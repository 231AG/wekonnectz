import { z } from "zod";

/** A Casual message request (§14: text only, up to 300 characters). */
export const requestSchema = z.object({
  recipientId: z.uuid(),
  body: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Write a short message.").max(300, "Use 300 characters or fewer.")),
});

/** Available Now filters (§13). */
export const poolFiltersSchema = z.object({
  area: z.uuid().optional(),
  minAge: z.coerce.number().int().min(18).max(99).optional(),
  maxAge: z.coerce.number().int().min(18).max(99).optional(),
  interests: z.array(z.uuid()).max(20).optional(),
  window: z.enum(["any", "2h", "tonight"]).optional(),
  after: z.string().max(60).optional(),
});
