import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { MobileScreen, ScreenLead, ScreenTitle } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MEMBER_HOME, requireMember } from "@/lib/auth/session";
import { unblockMember } from "@/lib/safety/actions";
import { blockedList } from "@/lib/storage/profiles";

export const metadata = { title: "Blocked members" };

/** The member's own block list (spec §17). Unblocking is silent too. */
export default async function BlockedPage() {
  const member = await requireMember();
  const blocked = await blockedList(member.id);
  return (
    <MobileScreen>
      <Button asChild variant="secondary" size="icon" aria-label="Back">
        <Link href={MEMBER_HOME}>
          <ArrowLeft className="size-5" strokeWidth={1.8} aria-hidden />
        </Link>
      </Button>
      <ScreenTitle>Blocked members</ScreenTitle>
      <ScreenLead>You and these members can’t see each other. They were not told.</ScreenLead>
      {blocked.length === 0 ? (
        <Card tone="dashed">
          <p className="text-[15px] text-muted-foreground">You haven’t blocked anyone.</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {blocked.map((b) => (
            <li key={b.userId}>
              <Card className="flex items-center gap-3">
                <span className="flex-1 font-bold">{b.displayName ?? "Member"}</span>
                <form action={unblockMember}>
                  <input type="hidden" name="userId" value={b.userId} />
                  <Button type="submit" variant="outline" size="sm">
                    Unblock
                  </Button>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </MobileScreen>
  );
}
