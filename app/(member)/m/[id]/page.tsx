import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BadgeCheck, Flame, Heart, MapPin } from "lucide-react";

import { ProfileSafety } from "@/components/member/profile-safety";
import { Button } from "@/components/ui/button";
import { MEMBER_HOME, nextStepFor, requireMember } from "@/lib/auth/session";
import { blockMember, reportMember } from "@/lib/safety/actions";
import { viewProfile } from "@/lib/storage/profiles";

export const metadata = { title: "Profile" };

const chip = "inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-surface-1 px-4 text-[15px]";

/**
 * Another member's profile (member mock-up 04). Visible only when the database allows it
 * (can_view_profile); otherwise it reads as not found, so a block or hide is never revealed.
 * Requests and availability arrive in Phases 7–8.
 */
export default async function MemberProfilePage({ params }: PageProps<"/m/[id]">) {
  const member = await requireMember();
  if (member.status !== "ACTIVE") redirect(nextStepFor(member));
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || id === member.id) notFound();
  const profile = await viewProfile(member.id, id);
  if (!profile) notFound();
  const [main, ...more] = profile.photos;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-5 px-5 pt-5 pb-8">
      <div className="flex items-center justify-between">
        <Button asChild variant="secondary" size="icon" aria-label="Back">
          <Link href={MEMBER_HOME}>
            <ArrowLeft className="size-5" strokeWidth={1.8} aria-hidden />
          </Link>
        </Button>
        <ProfileSafety
          targetId={profile.userId}
          name={profile.displayName}
          photos={profile.photos}
          report={reportMember}
          block={blockMember}
        />
      </div>
      <main className="flex flex-col gap-5">
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
          {/* BR-14: verification shown as a badge. */}
          {profile.verified ? (
            <BadgeCheck className="size-6 text-verified" strokeWidth={1.8} aria-label="Verified" role="img" />
          ) : null}
        </h1>
        <div className="flex flex-wrap gap-2">
          {profile.area ? (
            <span className={chip}>
              <MapPin className="size-[18px] text-muted-foreground" strokeWidth={1.8} aria-hidden />
              {profile.area}
            </span>
          ) : null}
          {profile.intentRelationship ? (
            <span className={chip}>
              <Heart className="size-[18px] text-relationship" strokeWidth={1.8} aria-hidden />
              Relationship
            </span>
          ) : null}
          {profile.intentCasual ? (
            <span className={chip}>
              <Flame className="size-[18px] text-casual" strokeWidth={1.8} aria-hidden />
              Casual
            </span>
          ) : null}
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
      </main>
    </div>
  );
}
