import { redirect } from "next/navigation";

import { PhoneOtpForm } from "@/components/auth/phone-otp-form";
import { MobileScreen, ScreenLead, ScreenTitle } from "@/components/layout/mobile-screen";
import { StepHeader } from "@/components/ui/step-header";
import { getPendingDob } from "@/lib/auth/cookies";
import { signupPhoneStep } from "@/lib/auth/actions/signup";
import { getMember, nextStepFor } from "@/lib/auth/session";

export const metadata = { title: "Your number" };

/** Phone + OTP (spec §10 step 3, BR-1, BR-2, mock-up: onboarding 03). */
export default async function SignupPhonePage() {
  const member = await getMember();
  if (member) redirect(nextStepFor(member));
  if (!(await getPendingDob())) redirect("/signup");

  return (
    <MobileScreen>
      <StepHeader step={2} total={8} backHref="/signup" />
      <ScreenTitle>Your Liberian number</ScreenTitle>
      <ScreenLead>We’ll text you a 6-digit code. Only +231 numbers can sign up.</ScreenLead>
      <PhoneOtpForm action={signupPhoneStep} />
    </MobileScreen>
  );
}
