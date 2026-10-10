import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, Ban } from "lucide-react";

import { MemberShell } from "@/components/layout/member-shell";
import { MessagesTabs } from "@/components/messages/messages-tabs";
import { Avatar } from "@/components/relationship/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { nextStepFor, requireMember } from "@/lib/auth/session";
import { respondToRequest } from "@/lib/casual/actions";
import { requestsReceived } from "@/lib/casual/server";
import { timeAgo } from "@/lib/domain/time";

export const metadata = { title: "Requests" };

const NOTICES: Record<string, string> = {
  decline: "Declined. They won’t be told.",
  block: "Blocked. They won’t be told.",
};
const ERRORS: Record<string, string> = {
  pass: "You need an active pass to accept requests.",
  closed: "This request isn’t open any more.",
  "1": "Something went wrong. Try again.",
};

/** Message requests (member mock-up 05; spec §14): accept, decline (private) or block (BR-22). */
export default async function RequestsPage({ searchParams }: PageProps<"/messages/requests">) {
  const member = await requireMember();
  if (member.status !== "ACTIVE") redirect(member.status === "SUSPENDED" ? "/messages" : nextStepFor(member));
  const { done, error } = await searchParams;
  const requests = await requestsReceived(member.id);

  return (
    <MemberShell>
      <h1 className="font-display text-[34px] font-bold">Messages</h1>
      <MessagesTabs active="requests" requests={requests.length} />
      {typeof done === "string" && NOTICES[done] ? (
        <p role="status" className="rounded-control bg-surface-2 px-4 py-3 text-[15px]">
          {NOTICES[done]}
        </p>
      ) : null}
      {typeof error === "string" ? (
        <p role="alert" className="rounded-control bg-danger/10 px-4 py-3 text-[15px] text-danger">
          {ERRORS[error] ?? ERRORS["1"]}
        </p>
      ) : null}
      {requests.length === 0 ? (
        <Card tone="dashed">
          <p className="text-[15px] text-muted-foreground">
            No requests right now. When you’re available, people in the pool can send you one.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {requests.map((r) => (
            <li key={r.requestId}>
              <Card className="flex flex-col gap-4" data-testid="request">
                <Link href={`/casual/m/${r.userId}`} className="flex items-center gap-3.5">
                  <Avatar url={r.photoUrl} name={r.displayName} />
                  <span className="flex flex-col">
                    <span className="flex items-center gap-1.5 text-[18px] font-bold">
                      {r.displayName}, {r.age}
                      {r.verified ? (
                        <BadgeCheck className="size-5 text-verified" aria-label="Verified" role="img" />
                      ) : null}
                    </span>
                    <span className="text-[15px] text-muted-foreground">
                      {r.area ? `${r.area} · ` : ""}
                      {timeAgo(r.createdAt)}
                    </span>
                  </span>
                </Link>
                <p className="text-[16px] leading-6 break-words">{r.body}</p>
                <form action={respondToRequest} className="flex gap-2">
                  <input type="hidden" name="requestId" value={r.requestId} />
                  <Button type="submit" name="action" value="ACCEPT" variant="casual" size="md" className="flex-[1.4]">
                    Accept
                  </Button>
                  <Button type="submit" name="action" value="DECLINE" variant="outline" size="md" className="flex-1">
                    Decline
                  </Button>
                  <Button
                    type="submit"
                    name="action"
                    value="BLOCK"
                    variant="outline"
                    size="icon"
                    aria-label={`Block ${r.displayName}`}
                  >
                    <Ban className="size-5 text-danger" strokeWidth={1.8} aria-hidden />
                  </Button>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[15px] text-muted-foreground">
        Requests expire if you don’t answer. Declining is private — they won’t be told.
      </p>
    </MemberShell>
  );
}
