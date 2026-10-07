import { redirect } from "next/navigation";
import { User } from "lucide-react";

import { MobileScreen, ScreenTitle } from "@/components/layout/mobile-screen";
import { SelfieCapture } from "@/components/onboarding/selfie-capture";
import { Card } from "@/components/ui/card";
import { StepHeader } from "@/components/ui/step-header";
import { nextStepFor, requireOnboardingStep } from "@/lib/auth/session";
import { reviewStatus, startVerification } from "@/lib/storage/verification";
import { prepareSelfieUpload, sendSelfie } from "@/lib/verification/actions";
import { VERIFICATION_REASONS } from "@/lib/verification/reasons";

export const metadata = { title: "Verify it’s you" };

/** Spec §10 step 10 / §9 layer 3 (mock-up 07): a live selfie with a pose chosen by the server. */
export default async function VerifyStepPage() {
  const member = await requireOnboardingStep("verify");
  const v = member.onboarding.verification;
  if (v === "PENDING" || v === "VERIFIED") redirect(nextStepFor(member));

  const [started, status] = await Promise.all([
    startVerification(member.id),
    v === "REJECTED" ? reviewStatus(member.id) : Promise.resolve(null),
  ]);
  if ("error" in started) {
    const code = started.error.kind === "db" ? started.error.code : "";
    // Another tab submitted, the account is restricted, or an earlier step is undone: go where the
    // database says the member belongs.
    if (["PHOTOS_REQUIRED", "PROFILE_INCOMPLETE", "ALREADY_SUBMITTED", "ACCOUNT_CANNOT_EDIT"].includes(code)) {
      redirect(code === "ALREADY_SUBMITTED" ? "/onboarding/review" : nextStepFor(member));
    }
    throw new Error("verification unavailable");
  }

  return (
    <MobileScreen>
      <StepHeader step={7} total={8} backHref="/onboarding/photos" />
      <ScreenTitle>Verify it’s you</ScreenTitle>
      {status?.rejectionReason ? (
        <Card tone="dashed" role="status" className="text-[15px] text-muted-foreground">
          {VERIFICATION_REASONS[status.rejectionReason].member}
        </Card>
      ) : null}
      <Card tone="notice" className="flex items-center gap-4">
        <User className="size-7 shrink-0 text-pending" strokeWidth={1.6} aria-hidden />
        <div>
          <p className="text-[13px] font-bold tracking-wide text-pending uppercase">Your pose</p>
          <p className="text-[17px] font-bold" data-testid="pose-prompt">
            {started.pose}
          </p>
        </div>
      </Card>
      <SelfieCapture verificationId={started.verificationId} prepare={prepareSelfieUpload} send={sendSelfie} />
    </MobileScreen>
  );
}
