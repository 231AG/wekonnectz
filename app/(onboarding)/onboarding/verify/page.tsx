import { ShieldCheck } from "lucide-react";

import { MobileScreen, ScreenLead, ScreenTitle } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StepHeader } from "@/components/ui/step-header";
import { signOut } from "@/lib/auth/actions/login";
import { requireOnboardingStep } from "@/lib/auth/session";

export const metadata = { title: "Verify it’s you" };

/** End of Phase 3. The verification selfie (spec §10 step 10) arrives in Phase 4. */
export default async function VerifyStepPage() {
  await requireOnboardingStep("verify");
  return (
    <MobileScreen
      footer={
        <form action={signOut}>
          <Button type="submit" variant="outline">
            Log out
          </Button>
        </form>
      }
    >
      <StepHeader step={7} total={8} backHref="/onboarding/photos" />
      <ScreenTitle>Verify it’s you</ScreenTitle>
      <ScreenLead>A quick selfie, seen only by our reviewers, confirms your photos are really you.</ScreenLead>
      <Card className="flex items-center gap-3.5">
        <ShieldCheck className="size-6 shrink-0 text-verified" strokeWidth={1.8} aria-hidden />
        <p className="flex-1 text-[15px] text-muted-foreground">Verification opens in the next release.</p>
      </Card>
    </MobileScreen>
  );
}
