import { z } from "zod";

import { REPORT_CATEGORY_KEYS } from "@/lib/safety/categories";

/** §14: text only, one to 1000 characters (the database enforces the same). */
export const MESSAGE_MAX_LENGTH = 1000;

export const messageSchema = z.object({
  conversationId: z.uuid(),
  body: z
    .string()
    .trim()
    .min(1, { error: "Write a message first." })
    .max(MESSAGE_MAX_LENGTH, { error: `Messages can be up to ${MESSAGE_MAX_LENGTH} characters.` }),
});

/** A report made from a conversation; photo reports are made from the profile. */
export const conversationReportSchema = z.object({
  conversationId: z.uuid(),
  category: z.enum(REPORT_CATEGORY_KEYS.filter((k) => k !== "INAPPROPRIATE_PHOTO") as [string, ...string[]], {
    error: "Choose what’s wrong.",
  }),
  details: z.string().trim().max(500, { error: "Use 500 characters or fewer." }).optional(),
});

export const discoverFiltersSchema = z.object({
  area: z.uuid().optional(),
  minAge: z.coerce.number().int().min(18).max(99).optional(),
  maxAge: z.coerce.number().int().min(18).max(99).optional(),
  interests: z.array(z.uuid()).max(20).optional(),
});
