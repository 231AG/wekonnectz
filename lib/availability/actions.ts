"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireMember } from "@/lib/auth/session";
import { leavePool, pauseWindow, setRequestPermission, setWindow } from "@/lib/availability/server";
import { checkWindow, endFromClockTime, parseLiberiaLocal } from "@/lib/domain/availability";

/** Availability actions (spec §12, BR-18). The member id comes from the session. */

export type AvailabilityFormState = { error?: string; saved?: boolean };

const MESSAGES: Record<string, string> = {
  END_REQUIRED: "Choose when you’ll stop being available.",
  START_IN_PAST: "Choose a start time that hasn’t passed.",
  END_BEFORE_START: "The end time must be after the start time.",
  WINDOW_TOO_LONG: "That window is longer than allowed. Choose an earlier end time.",
  PASS_ENDS_FIRST: "Your pass ends before that window starts. Choose an earlier time or add time to your pass.",
  TOO_MANY_CHANGES: "You’ve changed your availability a lot in the last hour. Try again later.",
  TOO_FAR_AHEAD: "That’s too far ahead. Choose a closer day.",
  NOT_ELIGIBLE: "You can’t go available right now.",
  NO_WINDOW: "You don’t have a window to pause.",
  "has no value": "Availability isn’t open yet. Please try again later.",
};
const GENERIC = "Something went wrong. Try again.";

const schema = z.object({
  mode: z.enum(["now", "schedule"]),
  start: z.string().max(20).optional(),
  end: z.string().max(20).optional(),
  endTime: z.string().max(5).optional(),
});

export async function saveAvailability(
  _prev: AvailabilityFormState,
  formData: FormData,
): Promise<AvailabilityFormState> {
  const member = await requireMember();
  const parsed = schema.safeParse({
    mode: formData.get("mode"),
    start: formData.get("start") ?? undefined,
    end: formData.get("end") ?? undefined,
    endTime: formData.get("endTime") ?? undefined,
  });
  if (!parsed.success) return { error: GENERIC };
  const start = parsed.data.mode === "now" ? null : parseLiberiaLocal(parsed.data.start);
  if (parsed.data.mode === "schedule" && !start) return { error: "Choose when you’ll start being available." };
  const end =
    parsed.data.mode === "now" ? endFromClockTime(parsed.data.endTime, new Date()) : parseLiberiaLocal(parsed.data.end);
  const local = checkWindow(start, end, new Date(), { maxWindowHours: null, maxLeadDays: null });
  if (local || !end) return { error: MESSAGES[local ?? "END_REQUIRED"] };
  const error = await setWindow(member.id, start, end);
  if (error) return { error: MESSAGES[error] ?? GENERIC };
  revalidatePath("/casual/availability");
  revalidatePath("/home");
  return { saved: true };
}

export async function pauseAvailability(): Promise<void> {
  const member = await requireMember();
  await pauseWindow(member.id, true);
  revalidatePath("/casual/availability");
}

export async function resumeAvailability(): Promise<void> {
  const member = await requireMember();
  await pauseWindow(member.id, false);
  revalidatePath("/casual/availability");
}

export async function leaveAvailability(): Promise<void> {
  const member = await requireMember();
  await leavePool(member.id);
  revalidatePath("/casual/availability");
  revalidatePath("/home");
}

export async function saveRequestPermission(formData: FormData): Promise<void> {
  const member = await requireMember();
  const permission = z.enum(["ANYONE", "NOBODY"]).safeParse(formData.get("permission"));
  if (!permission.success) return;
  await setRequestPermission(member.id, permission.data);
  revalidatePath("/casual/availability");
}
