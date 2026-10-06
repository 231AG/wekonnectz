import { CircleCheck } from "lucide-react";

import { MobileScreen, ScreenLead, ScreenTitle } from "@/components/layout/mobile-screen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StepHeader } from "@/components/ui/step-header";
import { signOut } from "@/lib/auth/actions/login";
import { requireOnboardingStep } from "@/lib/auth/session";

export const metadata = { title: "Photos" };

/** End of Phase 2. Photo upload (spec §10 step 9) arrives in Phase 3. */
export default async function PhotosStepPage() {
  await requireOnboardingStep("photos");
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
      <StepHeader step={6} total={8} backHref="/onboarding/interests" />
      <ScreenTitle>Add your photos</ScreenTitle>
      <ScreenLead>3 required, up to 6. Your first photo must clearly show your face.</ScreenLead>
      <Card className="flex items-center gap-3.5">
        <CircleCheck className="size-6 shrink-0 text-success" strokeWidth={1.8} aria-hidden />
        <div className="flex-1">
          <p className="font-bold">Profile details saved</p>
          <p className="text-sm text-muted-foreground">Rules, about you, interests</p>
        </div>
        <Badge tone="approved">Done</Badge>
      </Card>
      <Card tone="dashed">
        <p className="text-[15px] text-muted-foreground">Photo upload opens in the next release.</p>
      </Card>
    </MobileScreen>
  );
}
