import Link from "next/link";
import { ChevronRight, UserX } from "lucide-react";
import { redirect } from "next/navigation";

import { BackLink } from "@/components/account/back-link";
import { MobileScreen, ScreenLead, ScreenTitle } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { nextStepFor, requireMember } from "@/lib/auth/session";
import { saveRequestPermission } from "@/lib/availability/actions";
import { memberAvailability } from "@/lib/availability/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Privacy & messaging" };

/** Privacy & messaging (spec §20): who can send you Casual requests, blocked members, and what others see. */
export default async function PrivacyPage() {
  const member = await requireMember();
  if (member.status !== "ACTIVE" && member.status !== "SUSPENDED") redirect(nextStepFor(member));
  const { permission } = await memberAvailability(member.id);
  return (
    <MobileScreen>
      <BackLink href="/account/settings" />
      <ScreenTitle>Privacy & messaging</ScreenTitle>
      <ScreenLead>We never store your location. Your phone number is never shown to anyone.</ScreenLead>
      <section
        aria-labelledby="who-can"
        className="flex flex-col gap-2.5 rounded-card border border-border bg-surface-1 p-[18px]"
      >
        <h2 id="who-can" className="text-[15px] font-bold">
          Who can send you Casual requests
        </h2>
        <form action={saveRequestPermission} className="flex flex-wrap gap-2">
          {(
            [
              ["ANYONE", "Anyone in the pool"],
              ["NOBODY", "Nobody"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="submit"
              name="permission"
              value={value}
              aria-pressed={permission === value}
              variant="outline"
              size="md"
              className={cn(permission === value && "border-transparent bg-pending text-on-accent hover:bg-pending")}
            >
              {label}
            </Button>
          ))}
        </form>
        <p className="text-[13px] text-muted-foreground">
          With Nobody, you don’t appear in Available Now and no one can send you requests. Relationship messages only
          come from matches.
        </p>
      </section>
      <Link href="/account/blocked" className="rounded-card focus-visible:outline-2 focus-visible:outline-ring">
        <Card className="flex items-center gap-3.5 hover:bg-surface-2">
          <UserX className="size-6 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
          <span className="flex-1 font-bold">Blocked members</span>
          <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
        </Card>
      </Link>
    </MobileScreen>
  );
}
