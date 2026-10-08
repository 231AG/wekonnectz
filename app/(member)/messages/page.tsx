import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck } from "lucide-react";

import { MemberShell } from "@/components/layout/member-shell";
import { Avatar } from "@/components/relationship/avatar";
import { Card } from "@/components/ui/card";
import { nextStepFor, requireMember } from "@/lib/auth/session";
import { timeAgo } from "@/lib/domain/time";
import { conversationsList } from "@/lib/storage/relationship";

export const metadata = { title: "Messages" };

/** Messages (spec §20; mock-up 05 shows the Requests tab, which arrives with Casual in Phase 9). */
export default async function MessagesPage() {
  const member = await requireMember();
  if (member.status !== "ACTIVE" && member.status !== "SUSPENDED") redirect(nextStepFor(member));
  const chats = await conversationsList(member.id);

  return (
    <MemberShell>
      <h1 className="font-display text-[34px] font-bold">Messages</h1>
      <div className="grid grid-cols-2 rounded-2xl border border-border bg-surface-1 p-1" aria-label="Messages">
        <span
          aria-current="page"
          className="flex min-h-11 items-center justify-center rounded-xl bg-surface-2 font-bold"
        >
          Chats
        </span>
        <span className="flex min-h-11 items-center justify-center text-muted-foreground" aria-disabled="true">
          Requests
        </span>
      </div>
      {chats.length === 0 ? (
        <Card tone="dashed">
          <p className="text-[15px] text-muted-foreground">
            No conversations yet. Say hello to a{" "}
            <Link href="/relationship/matches" className="font-bold text-pending underline underline-offset-4">
              match
            </Link>
            .
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {chats.map((c) => (
            <li key={c.conversationId}>
              <Link
                href={`/messages/${c.conversationId}`}
                className="flex items-center gap-3.5 rounded-card p-3 hover:bg-surface-1"
              >
                <Avatar url={c.photoUrl} name={c.displayName} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 font-bold">
                    {c.displayName}
                    {c.verified ? (
                      <BadgeCheck className="size-4 text-verified" aria-label="Verified" role="img" />
                    ) : null}
                    <span className="ml-auto text-xs font-normal text-muted-foreground">
                      {timeAgo(c.lastMessageAt)}
                    </span>
                  </span>
                  <span className={c.unread ? "truncate text-foreground" : "truncate text-muted-foreground"}>
                    {c.lastMine ? "You: " : ""}
                    {c.lastBody}
                  </span>
                </span>
                {c.unread ? (
                  <span
                    className="flex size-6 items-center justify-center rounded-full bg-pending text-xs font-bold text-on-accent"
                    aria-label={`${c.unread} unread`}
                  >
                    {c.unread}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </MemberShell>
  );
}
