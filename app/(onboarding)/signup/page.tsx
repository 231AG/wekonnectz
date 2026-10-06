import { redirect } from "next/navigation";

import { AgeGateForm } from "@/components/auth/age-gate-form";
import { MobileScreen, ScreenLead, ScreenTitle } from "@/components/layout/mobile-screen";
import { StepHeader } from "@/components/ui/step-header";
import { isAgeBlocked } from "@/lib/auth/cookies";
import { submitAgeGate } from "@/lib/auth/actions/signup";
import { getMember, nextStepFor } from "@/lib/auth/session";

export const metadata = { title: "Your age" };

/** Age gate (spec §10 step 2, BR-4, mock-up: onboarding 02). */
export default async function AgeGatePage() {
  const member = await getMember();
  if (member?.hasDateOfBirth) redirect(nextStepFor(member));
  if (await isAgeBlocked()) redirect("/signup/not-eligible");

  return (
    <MobileScreen>
      <StepHeader step={1} total={8} backHref="/" />
      <ScreenTitle>You must be 18 or older</ScreenTitle>
      <ScreenLead>Enter your date of birth. It is checked again during photo verification.</ScreenLead>
      <AgeGateForm action={submitAgeGate} />
    </MobileScreen>
  );
}
