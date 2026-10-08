import { z } from "zod";

import { REJECTION_REASON_KEYS } from "@/lib/photos/reasons";
import { BAN_REASON_KEYS, REPORT_CATEGORY_KEYS, SUSPENSION_DAYS } from "@/lib/safety/categories";

/** Report a member (spec §17). Used by the report sheet and re-checked by the server action. */
export const reportSchema = z
  .object({
    targetId: z.uuid(),
    category: z.enum(REPORT_CATEGORY_KEYS, { error: "Choose what’s wrong." }),
    details: z.string().trim().max(500, { error: "Use 500 characters or fewer." }).optional(),
    photoId: z.uuid().optional(),
  })
  .refine((v) => v.category !== "INAPPROPRIATE_PHOTO" || v.photoId, {
    error: "Choose the photo.",
    path: ["photoId"],
  });

export const noteSchema = z.object({
  reportId: z.uuid(),
  note: z
    .string()
    .trim()
    .min(1, { error: "Write a note first." })
    .max(2000, { error: "Use 2000 characters or fewer." }),
});

export const resolveReportSchema = z.object({
  reportId: z.uuid(),
  outcome: z.enum(["dismiss", "resolve"]),
  restoreVisibility: z.boolean(),
  photoReason: z.enum(REJECTION_REASON_KEYS, { error: "Choose a photo reason." }).optional(),
});

export const suspendSchema = z.object({
  userId: z.uuid(),
  days: z.coerce
    .number()
    .refine((d) => (SUSPENSION_DAYS as readonly number[]).includes(d), { error: "Choose a length." }),
  reportId: z.uuid().optional(),
});

export const banSchema = z.object({
  userId: z.uuid(),
  reason: z.enum(BAN_REASON_KEYS, { error: "Choose a reason." }),
  reportId: z.uuid().optional(),
});
