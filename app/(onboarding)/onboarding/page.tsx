import { redirect } from "next/navigation";
import { CircleCheck } from "lucide-react";

import { MobileScreen, ScreenLead, ScreenTitle } from "@/components/layout/mobile-screen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StepHeader } from "@/components/ui/step-header";
import { signOut } from "@/lib/auth/actions/login";
import { requireMember } from "@/lib/auth/session";

export const metadata = { title: "Welcome" };

/**
 * Phase 1 end point after phone verification. Phase 2 replaces this with the community rules step
 * and the rest of onboarding (spec §10 steps 4–8).
 */
export default async function OnboardingPage() {
  const member = await requireMember();
  if (!member.hasDateOfBirth) redirect("/signup");

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
      <StepHeader step={3} total={8} />
      <ScreenTitle>You’re in</ScreenTitle>
      <ScreenLead>Next we’ll go through the community rules and set up your profile.</ScreenLead>
      <Card className="flex items-center gap-3.5">
        <CircleCheck className="size-6 shrink-0 text-success" strokeWidth={1.8} aria-hidden />
        <div className="flex-1">
          <p className="font-bold">Phone verified</p>
          <p className="text-sm text-muted-foreground">Age confirmed: 18+</p>
        </div>
        <Badge tone="approved">Done</Badge>
      </Card>
      <Card tone="dashed">
        <p className="text-[15px] text-muted-foreground">Profile setup opens in the next release.</p>
      </Card>
    </MobileScreen>
  );
}
