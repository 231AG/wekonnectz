import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BadgeCheck } from "lucide-react";

import { ConversationLive } from "@/components/messages/conversation-live";
import { ConversationSafety } from "@/components/messages/conversation-safety";
import { Avatar } from "@/components/relationship/avatar";
import { Button } from "@/components/ui/button";
import { hasCasualAccess } from "@/lib/casual/server";
import { nextStepFor, requireMember } from "@/lib/auth/session";
import { loadMessages, markConversationRead, reportConversation, sendMessage } from "@/lib/messages/actions";
import { unmatchMember } from "@/lib/relationship/actions";
import { blockMember } from "@/lib/safety/actions";
import { conversationView } from "@/lib/storage/relationship";

export const metadata = { title: "Conversation" };

/** Conversation (member mock-up 06; spec §14). Only members of an open conversation get here. */
export default async function ConversationPage({ params }: PageProps<"/messages/[id]">) {
  const member = await requireMember();
  if (member.status !== "ACTIVE" && member.status !== "SUSPENDED") redirect(nextStepFor(member));
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const view = await conversationView(member.id, id);
  if (!view) notFound();
  const { other } = view;
  const noPass = view.type === "CASUAL" && !view.canSend && !(await hasCasualAccess(member.id));
  const reason =
    member.status === "SUSPENDED"
      ? "Your account is restricted, so you can read but not send messages right now."
      : noPass
        ? "Your pass has ended, so this Casual chat is read-only. Get a pass to reply — your messages are kept."
        : "You can’t send messages in this conversation right now.";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 px-5 pt-5">
      <header className="flex items-center gap-3">
        <Button asChild variant="secondary" size="icon" aria-label="Back to messages">
          <Link href="/messages">
            <ArrowLeft className="size-5" strokeWidth={1.8} aria-hidden />
          </Link>
        </Button>
        <Link href={`/m/${other.userId}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar url={other.photoUrl} name={other.displayName} className="size-11" />
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5 font-display text-[18px] font-bold">
              <span className="truncate">{other.displayName}</span>
              {other.verified ? (
                <BadgeCheck className="size-5 shrink-0 text-verified" aria-label="Verified" role="img" />
              ) : null}
            </span>
            <span className={view.type === "CASUAL" ? "text-sm text-casual" : "text-sm text-relationship"}>
              {view.type === "CASUAL" ? "Casual" : "Relationship"}
            </span>
          </span>
        </Link>
        <ConversationSafety
          conversationId={view.conversationId}
          otherId={other.userId}
          name={other.displayName}
          matchId={view.matchId}
          report={reportConversation}
          block={blockMember}
          unmatch={unmatchMember}
        />
      </header>
      <main className="flex flex-1 flex-col gap-4">
        <h1 className="sr-only">Conversation with {other.displayName}</h1>
        {noPass && member.status === "ACTIVE" ? (
          <Button asChild variant="casual" size="md" className="self-center">
            <Link href="/casual/get-access">Get a pass</Link>
          </Button>
        ) : null}
        <ConversationLive
          conversationId={view.conversationId}
          meId={member.id}
          initial={view.messages}
          canSend={view.canSend}
          cannotSendReason={reason}
          send={sendMessage}
          markRead={markConversationRead}
          load={loadMessages}
        />
      </main>
    </div>
  );
}
