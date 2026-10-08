import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck } from "lucide-react";

import { MemberShell } from "@/components/layout/member-shell";
import { Avatar } from "@/components/relationship/avatar";
import { RelationshipTabs } from "@/components/relationship/relationship-tabs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { nextStepFor, requireMember } from "@/lib/auth/session";
import { timeAgo } from "@/lib/domain/time";
import { matchesList } from "@/lib/storage/relationship";

export const metadata = { title: "Matches" };

/** Matches (spec §15, §20). Each match opens its conversation. Suspended members may still read. */
export default async function MatchesPage() {
  const member = await requireMember();
  if (member.status !== "ACTIVE" && member.status !== "SUSPENDED") redirect(nextStepFor(member));
  const matches = await matchesList(member.id);

  return (
    <MemberShell>
      <h1 className="font-display text-[28px] font-bold">Relationship</h1>
      <RelationshipTabs active="/relationship/matches" />
      {matches.length === 0 ? (
        <Card tone="dashed">
          <p className="text-[15px] text-muted-foreground">
            No matches yet. When you and someone both like each other, you’ll find them here.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {matches.map((m) => (
            <li key={m.matchId}>
              <Link href={`/messages/${m.conversationId}`} className="block rounded-card hover:bg-surface-2">
                <Card className="flex items-center gap-3.5 bg-transparent">
                  <Avatar url={m.photoUrl} name={m.displayName} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1.5 font-bold">
                      {m.displayName}, {m.age}
                      {m.verified ? (
                        <BadgeCheck className="size-4 text-verified" aria-label="Verified" role="img" />
                      ) : null}
                    </span>
                    <span className="text-sm text-muted-foreground">Matched {timeAgo(m.matchedAt)}</span>
                  </span>
                  {!m.hasMessages ? <Badge className="bg-verified text-on-accent">New</Badge> : null}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </MemberShell>
  );
}
