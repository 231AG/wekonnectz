import { redirect } from "next/navigation";
import { BadgeCheck } from "lucide-react";

import { MobileScreen, ScreenLead, ScreenTitle } from "@/components/layout/mobile-screen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { signOut } from "@/lib/auth/actions/login";
import { nextStepFor, requireMember } from "@/lib/auth/session";

export const metadata = { title: "Home" };

/** Placeholder for ACTIVE members until Home and discovery arrive (Phase 6). */
export default async function HomePage() {
  const member = await requireMember();
  if (member.status !== "ACTIVE") redirect(nextStepFor(member));
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
      <ScreenTitle>You’re in</ScreenTitle>
      <ScreenLead>Your profile is verified and live.</ScreenLead>
      <Card className="flex items-center gap-3.5">
        <BadgeCheck className="size-6 shrink-0 text-verified" strokeWidth={1.8} aria-hidden />
        <p className="flex-1 font-bold">Verification</p>
        {/* BR-14: verification status is shown as a badge. */}
        <Badge tone="relationship" className="bg-verified">
          Verified
        </Badge>
      </Card>
      <Card tone="dashed">
        <p className="text-[15px] text-muted-foreground">Discovery and messages open in the next release.</p>
      </Card>
    </MobileScreen>
  );
}
