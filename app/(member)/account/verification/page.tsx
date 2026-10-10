import Link from "next/link";
import { BadgeCheck, Clock, ShieldAlert } from "lucide-react";

import { BackLink } from "@/components/account/back-link";
import { MobileScreen, ScreenLead, ScreenTitle } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireMember } from "@/lib/auth/session";

export const metadata = { title: "Verification" };

const TEXT = {
  VERIFIED: {
    icon: BadgeCheck,
    tone: "text-verified",
    title: "You’re verified",
    body: "A reviewer matched your selfie to your photos. Members see the verified badge on your profile.",
  },
  PENDING: {
    icon: Clock,
    tone: "text-pending",
    title: "Your selfie is being checked",
    body: "A real person checks every selfie. Usually done within 24 hours.",
  },
  REJECTED: {
    icon: ShieldAlert,
    tone: "text-danger",
    title: "Your selfie wasn’t approved",
    body: "Take a new selfie copying the pose shown. Make sure your face is clear and well lit.",
  },
  NOT_STARTED: {
    icon: ShieldAlert,
    tone: "text-pending",
    title: "Not verified yet",
    body: "Take a quick selfie copying a pose so we can check it’s really you.",
  },
} as const;

/** Verification status (spec §20 My profile → Verification). The selfie itself is never shown back to members. */
export default async function VerificationStatusPage() {
  const member = await requireMember();
  const v = member.onboarding.verification;
  const t = TEXT[v];
  const Icon = t.icon;
  return (
    <MobileScreen>
      <BackLink href="/me" />
      <ScreenTitle>Verification</ScreenTitle>
      <ScreenLead>Only reviewers ever see your selfie, and it is kept for a limited time only.</ScreenLead>
      <Card className="flex items-start gap-4" data-testid="verification-status">
        <Icon className={`size-8 shrink-0 ${t.tone}`} strokeWidth={1.8} aria-hidden />
        <div className="flex flex-col gap-1">
          <p className="text-[17px] font-bold">{t.title}</p>
          <p className="text-[15px] text-muted-foreground">{t.body}</p>
        </div>
      </Card>
      {v === "REJECTED" || v === "NOT_STARTED" ? (
        <Button asChild>
          <Link href="/onboarding/verify">Take a selfie</Link>
        </Button>
      ) : null}
    </MobileScreen>
  );
}
