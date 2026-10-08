import { redirect } from "next/navigation";
import Link from "next/link";
import { BadgeCheck, ChevronRight, ShieldCheck, UserX } from "lucide-react";

import { MobileScreen, ScreenLead, ScreenTitle } from "@/components/layout/mobile-screen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { signOut } from "@/lib/auth/actions/login";
import { nextStepFor, requireMember } from "@/lib/auth/session";

export const metadata = { title: "Home" };

/** Placeholder for ACTIVE members until Home and discovery arrive (Phase 6). */
export default async function HomePage({ searchParams }: PageProps<"/home">) {
  const member = await requireMember();
  const { blocked } = await searchParams;
  if (member.status !== "ACTIVE" && member.status !== "SUSPENDED") redirect(nextStepFor(member));
  const verified = member.onboarding.verification === "VERIFIED";
  if (member.status === "SUSPENDED") {
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
        <ScreenTitle>Your account is restricted</ScreenTitle>
        <ScreenLead>
          Your account is temporarily restricted, so you can’t be seen or send messages right now. It will be lifted
          automatically at the end of the restriction.
        </ScreenLead>
      </MobileScreen>
    );
  }
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
      {blocked === "1" ? (
        <p role="status" className="rounded-control bg-surface-2 px-4 py-3 text-[15px]">
          Blocked. They won’t be told.
        </p>
      ) : null}
      <Card className="flex items-center gap-3.5">
        <BadgeCheck className="size-6 shrink-0 text-verified" strokeWidth={1.8} aria-hidden />
        <p className="flex-1 font-bold">Verification</p>
        {/* BR-14: verification status is shown as a badge. */}
        {verified ? (
          <Badge tone="relationship" className="bg-verified">
            Verified
          </Badge>
        ) : null}
      </Card>
      <Card tone="dashed">
        <p className="text-[15px] text-muted-foreground">Discovery and messages open in the next release.</p>
      </Card>
      <nav aria-label="Safety" className="flex flex-col gap-3">
        <Link href="/safety" className="rounded-card focus-visible:outline-2 focus-visible:outline-ring">
          <Card className="flex items-center gap-3.5 hover:bg-surface-2">
            <ShieldCheck className="size-6 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
            <span className="flex-1 font-bold">Staying safe</span>
            <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
          </Card>
        </Link>
        <Link href="/account/blocked" className="rounded-card focus-visible:outline-2 focus-visible:outline-ring">
          <Card className="flex items-center gap-3.5 hover:bg-surface-2">
            <UserX className="size-6 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
            <span className="flex-1 font-bold">Blocked members</span>
            <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
          </Card>
        </Link>
      </nav>
    </MobileScreen>
  );
}
