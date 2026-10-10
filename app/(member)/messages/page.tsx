import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck } from "lucide-react";

import { MemberShell } from "@/components/layout/member-shell";
import { MessagesTabs } from "@/components/messages/messages-tabs";
import { Avatar } from "@/components/relationship/avatar";
import { Card } from "@/components/ui/card";
import { nextStepFor, requireMember } from "@/lib/auth/session";
import { timeAgo } from "@/lib/domain/time";
import { requestsReceived } from "@/lib/casual/server";
import { conversationsList } from "@/lib/storage/relationship";

export const metadata = { title: "Messages" };

/** Messages (spec §20; member mock-up 05): Chats, and the Casual Requests tab. */
export default async function MessagesPage() {
  const member = await requireMember();
  if (member.status !== "ACTIVE" && member.status !== "SUSPENDED") redirect(nextStepFor(member));
  const [chats, requests] = await Promise.all([
    conversationsList(member.id),
    member.status === "ACTIVE" ? requestsReceived(member.id) : Promise.resolve([]),
  ]);

  return (
    <MemberShell>
      <h1 className="font-display text-[34px] font-bold">Messages</h1>
      <MessagesTabs active="chats" requests={requests.length} />
      {chats.length === 0 ? (
        <Card tone="dashed">
          <p className="text-[15px] text-muted-foreground">
            No conversations yet. Say hello to a{" "}
            <Link href="/relationship/matches" className="font-bold text-pending underline underline-offset-4">
              match
            </Link>
            , or send a request to someone{" "}
            <Link href="/casual" className="font-bold text-pending underline underline-offset-4">
              available now
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
