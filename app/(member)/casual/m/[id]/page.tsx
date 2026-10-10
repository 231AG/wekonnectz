import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BadgeCheck, Bookmark, BookmarkCheck, Flame, MapPin, MessageCircle } from "lucide-react";

import { RequestForm } from "@/components/casual/request-form";
import { ProfileSafety } from "@/components/member/profile-safety";
import { Button } from "@/components/ui/button";
import { nextStepFor, requireMember } from "@/lib/auth/session";
import { sendRequest, toggleSaved } from "@/lib/casual/actions";
import { casualProfile } from "@/lib/casual/server";
import { formatWindowTime } from "@/lib/domain/availability";
import { blockMember, reportMember } from "@/lib/safety/actions";

export const metadata = { title: "Profile" };

const chip = "inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-surface-1 px-4 text-[15px]";

/**
 * A Casual member profile (member mock-up 04; spec §13–14). Shown only while the database allows it
 * (in the viewer's pool, or they sent the viewer an open request); otherwise it reads as not found.
 */
export default async function CasualProfilePage({ params }: PageProps<"/casual/m/[id]">) {
  const member = await requireMember();
  if (member.status !== "ACTIVE") redirect(nextStepFor(member));
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || id === member.id) notFound();
  const profile = await casualProfile(member.id, id);
  if (!profile) notFound();
  const [main, ...more] = profile.photos;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-5 px-5 pt-5 pb-8">
      <div className="flex items-center justify-between">
        <Button asChild variant="secondary" size="icon" aria-label="Back">
          <Link href={profile.requestReceived ? "/messages/requests" : "/casual"}>
            <ArrowLeft className="size-5" strokeWidth={1.8} aria-hidden />
          </Link>
        </Button>
        <div className="flex gap-2">
          {profile.inPool ? (
            <form action={toggleSaved}>
              <input type="hidden" name="ownerId" value={profile.userId} />
              <input type="hidden" name="saved" value={profile.saved ? "0" : "1"} />
              <Button
                type="submit"
                variant="secondary"
                size="icon"
                aria-label={profile.saved ? "Saved — remove" : "Save"}
                aria-pressed={profile.saved}
              >
                {profile.saved ? (
                  <BookmarkCheck className="size-5 text-casual" strokeWidth={1.8} aria-hidden />
                ) : (
                  <Bookmark className="size-5" strokeWidth={1.8} aria-hidden />
                )}
              </Button>
            </form>
          ) : null}
          <ProfileSafety
            targetId={profile.userId}
            name={profile.displayName}
            photos={profile.photos}
            report={reportMember}
            block={blockMember}
          />
        </div>
      </div>
      <main className="flex flex-1 flex-col gap-5">
        {main ? (
          // Short-lived signed URL (BR-11).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={main.url}
            alt={`${profile.displayName}’s main photo`}
            className="aspect-[350/300] w-full rounded-card object-cover"
          />
        ) : null}
        <h1 className="flex items-center gap-3 font-display text-[30px] font-bold">
          {profile.displayName}, {profile.age}
          {profile.verified ? (
            <BadgeCheck className="size-6 text-verified" strokeWidth={1.8} aria-label="Verified" role="img" />
          ) : null}
        </h1>
        <div className="flex flex-wrap gap-2">
          {profile.availableUntil ? (
            <span className={chip}>
              <span className="size-2.5 rounded-full bg-success" aria-hidden />
              Available until {formatWindowTime(profile.availableUntil)}
            </span>
          ) : null}
          {profile.area ? (
            <span className={chip}>
              <MapPin className="size-[18px] text-muted-foreground" strokeWidth={1.8} aria-hidden />
              {profile.area}
            </span>
          ) : null}
          <span className={chip}>
            <Flame className="size-[18px] text-casual" strokeWidth={1.8} aria-hidden />
            Casual
          </span>
        </div>
        {profile.bio ? <p className="text-[17px] leading-[26px]">{profile.bio}</p> : null}
        {profile.interests.length ? (
          <ul className="flex flex-wrap gap-2" aria-label="Interests">
            {profile.interests.map((i) => (
              <li key={i} className={chip}>
                {i}
              </li>
            ))}
          </ul>
        ) : null}
        {more.length ? (
          <div className="grid grid-cols-2 gap-3">
            {more.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.id}
                src={p.url}
                alt={`${profile.displayName}’s photo ${i + 2}`}
                className="aspect-square w-full rounded-card object-cover"
              />
            ))}
          </div>
        ) : null}
        <div className="flex-1" />
        {profile.conversationId ? (
          <Button asChild>
            <Link href={`/messages/${profile.conversationId}`}>
              <MessageCircle className="size-5" strokeWidth={1.8} aria-hidden /> Message
            </Link>
          </Button>
        ) : profile.requestReceived ? (
          <Button asChild variant="casual">
            <Link href="/messages/requests">Answer their request</Link>
          </Button>
        ) : profile.requestSent ? (
          <p role="status" className="rounded-control bg-surface-2 p-4 text-center text-[15px]">
            Request sent. You’ll see their reply in Messages.
          </p>
        ) : profile.inPool ? (
          <RequestForm recipientId={profile.userId} name={profile.displayName} send={sendRequest} />
        ) : null}
      </main>
    </div>
  );
}
