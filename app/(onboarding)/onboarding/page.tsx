import { redirect } from "next/navigation";

import { nextStepFor, requireMember } from "@/lib/auth/session";

/** Resume at the first incomplete step (spec §10: progress is saved per step). */
export default async function OnboardingIndex() {
  redirect(nextStepFor(await requireMember()));
}
