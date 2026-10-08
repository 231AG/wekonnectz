import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck } from "lucide-react";

import { MemberShell } from "@/components/layout/member-shell";
import { Avatar } from "@/components/relationship/avatar";
import { LikeRowActions } from "@/components/relationship/like-row-actions";
import { RelationshipTabs } from "@/components/relationship/relationship-tabs";
import { Card } from "@/components/ui/card";
import { MEMBER_HOME, nextStepFor, requireMember } from "@/lib/auth/session";
import { timeAgo } from "@/lib/domain/time";
import { likeMember, passMember } from "@/lib/relationship/actions";
import { likesReceived } from "@/lib/storage/relationship";

export const metadata = { title: "Likes" };

/** Likes received (spec §20). Like back to match, or pass. */
export default async function LikesPage() {
  const member = await requireMember();
  if (member.status === "SUSPENDED") redirect(MEMBER_HOME);
  if (member.status !== "ACTIVE") redirect(nextStepFor(member));
  const likes = await likesReceived(member.id);

  return (
    <MemberShell>
      <h1 className="font-display text-[28px] font-bold">Relationship</h1>
      <RelationshipTabs active="/relationship/likes" />
      {likes === null ? (
        <Card tone="dashed">
          <p className="text-[15px] text-muted-foreground">
            Turn on Relationship in your profile to see who likes you.
          </p>
        </Card>
      ) : likes.length === 0 ? (
        <Card tone="dashed">
          <p className="text-[15px] text-muted-foreground">No new likes yet. People who like you will appear here.</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {likes.map((l) => (
            <li key={l.userId}>
              <Card className="flex items-center gap-3.5">
                <Link href={`/m/${l.userId}`} className="flex min-w-0 flex-1 items-center gap-3.5">
                  <Avatar url={l.photoUrl} name={l.displayName} />
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-1.5 font-bold">
                      {l.displayName}, {l.age}
                      {l.verified ? (
                        <BadgeCheck className="size-4 text-verified" aria-label="Verified" role="img" />
                      ) : null}
                    </span>
                    <span className="truncate text-sm text-muted-foreground">
                      {l.area ? `${l.area} · ` : ""}liked you {timeAgo(l.likedAt)}
                    </span>
                  </span>
                </Link>
                <LikeRowActions userId={l.userId} name={l.displayName} like={likeMember} pass={passMember} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </MemberShell>
  );
}
