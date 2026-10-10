import Link from "next/link";
import { ChevronRight, Download, LockKeyhole, Trash2 } from "lucide-react";

import { BackLink } from "@/components/account/back-link";
import { MobileScreen, ScreenLead, ScreenTitle } from "@/components/layout/mobile-screen";
import { Card } from "@/components/ui/card";
import { requireMember } from "@/lib/auth/session";

export const metadata = { title: "Settings" };

/** Settings (spec §20 My profile → Settings · Delete account). Reachable during onboarding too (§8: delete from any state). */
export default async function SettingsPage() {
  const member = await requireMember();
  const active = member.status === "ACTIVE" || member.status === "SUSPENDED";
  return (
    <MobileScreen>
      <BackLink href={active ? "/me" : "/"} />
      <ScreenTitle>Settings</ScreenTitle>
      <ScreenLead>Your data and your account.</ScreenLead>
      <nav aria-label="Settings" className="flex flex-col gap-3">
        {active ? (
          <Link href="/account/privacy" className="rounded-card focus-visible:outline-2 focus-visible:outline-ring">
            <Card className="flex items-center gap-3.5 hover:bg-surface-2">
              <LockKeyhole className="size-6 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
              <span className="flex-1 font-bold">Privacy & messaging</span>
              <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
            </Card>
          </Link>
        ) : null}
        <a href="/api/me/export" download className="rounded-card focus-visible:outline-2 focus-visible:outline-ring">
          <Card className="flex items-center gap-3.5 hover:bg-surface-2">
            <Download className="size-6 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
            <span className="flex flex-1 flex-col">
              <span className="font-bold">Download my data</span>
              <span className="text-[13px] text-muted-foreground">
                Your profile, messages you sent, payments and more, as a file
              </span>
            </span>
          </Card>
        </a>
        <Link href="/account/delete" className="rounded-card focus-visible:outline-2 focus-visible:outline-ring">
          <Card className="flex items-center gap-3.5 hover:bg-surface-2">
            <Trash2 className="size-6 shrink-0 text-danger" strokeWidth={1.8} aria-hidden />
            <span className="flex-1 font-bold text-danger">Delete account</span>
            <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
          </Card>
        </Link>
      </nav>
    </MobileScreen>
  );
}
