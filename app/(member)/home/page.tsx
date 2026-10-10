import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, ChevronRight, Flame, Heart, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { MemberShell } from "@/components/layout/member-shell";
import { MobileScreen, ScreenLead, ScreenTitle } from "@/components/layout/mobile-screen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions/login";
import { nextStepFor, requireMember } from "@/lib/auth/session";
import { formatLiberiaTime } from "@/lib/domain/money";
import { memberAvailability } from "@/lib/availability/server";
import { formatWindowTime } from "@/lib/domain/availability";
import { paymentOptions } from "@/lib/storage/payments";
import { relationshipSummary } from "@/lib/storage/relationship";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Home" };

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Home (member mock-up 01): Relationship card, Casual card, availability (Phase 8), safety note. */
export default async function HomePage({ searchParams }: PageProps<"/home">) {
  const member = await requireMember();
  const { blocked } = await searchParams;
  if (member.status !== "ACTIVE" && member.status !== "SUSPENDED") redirect(nextStepFor(member));
  if (member.status === "SUSPENDED") {
    return (
      <MobileScreen
        footer={
          <>
            <Button asChild variant="secondary">
              <Link href="/messages">Read your messages</Link>
            </Button>
            <form action={signOut}>
              <Button type="submit" variant="outline">
                Log out
              </Button>
            </form>
          </>
        }
      >
        <ScreenTitle>Your account is restricted</ScreenTitle>
        {blocked === "1" ? (
          <p role="status" className="rounded-control bg-surface-2 px-4 py-3 text-[15px]">
            Blocked. They won’t be told.
          </p>
        ) : null}
        <ScreenLead>
          Your account is temporarily restricted, so you can’t be seen or send messages right now. You can still read
          your messages. It will be lifted automatically at the end of the restriction.
        </ScreenLead>
      </MobileScreen>
    );
  }

  const [summary, payments, availability, { data: profile }] = await Promise.all([
    relationshipSummary(member.id),
    paymentOptions(member.id),
    memberAvailability(member.id),
    (await createClient()).from("profiles").select("display_name").eq("user_id", member.id).single(),
  ]);
  const verified = member.onboarding.verification === "VERIFIED";
  const relationshipLine = !summary.intentRelationship
    ? "Turned off in your profile"
    : !summary.eligible
      ? "Not showing in Discover right now"
      : summary.likesReceived || summary.newMatches
        ? `${plural(summary.likesReceived, "new like", "new likes")} · ${plural(summary.newMatches, "new match", "new matches")}`
        : "See who’s new today";

  return (
    <MemberShell>
      <header className="flex items-center justify-between">
        <Logo className="h-7 w-auto" />
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[34px] leading-tight font-bold">Hi, {profile?.display_name ?? "there"}</h1>
        {/* BR-14: verification status shown as a badge. */}
        {verified ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-verified/15 px-3 py-1 text-sm font-bold text-verified">
            <BadgeCheck className="size-4" strokeWidth={2} aria-hidden />
            Verified
          </span>
        ) : null}
      </div>
      {blocked === "1" ? (
        <p role="status" className="rounded-control bg-surface-2 px-4 py-3 text-[15px]">
          Blocked. They won’t be told.
        </p>
      ) : null}

      <Link
        href="/relationship"
        className="flex flex-col gap-2 rounded-card border border-verified/30 bg-verified/10 p-5 hover:bg-verified/15 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="flex items-center gap-3">
          <Heart className="size-7 text-verified" strokeWidth={1.8} aria-hidden />
          <span className="flex-1 font-display text-[22px] font-bold">Relationship</span>
          <Badge className="bg-verified text-on-accent">Free</Badge>
        </span>
        <span className="text-[16px] text-muted-foreground" data-testid="relationship-summary">
          {relationshipLine}
        </span>
      </Link>

      <Link
        href="/casual"
        className="flex flex-col gap-2 rounded-card border border-casual/30 bg-casual/10 p-5 hover:bg-casual/15 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="flex items-center gap-3">
          <Flame className="size-7 text-casual" strokeWidth={1.8} aria-hidden />
          <span className="flex-1 font-display text-[22px] font-bold">Casual Connection</span>
          <Badge tone="casual">{payments.accessUntil ? "Pass active" : "Get access"}</Badge>
        </span>
        <span className="text-[16px] text-muted-foreground">
          {payments.accessUntil
            ? `Until ${formatLiberiaTime(payments.accessUntil)}`
            : payments.pendingClaims
              ? "Payment being verified"
              : "Get a pass to meet people available now"}
        </span>
      </Link>

      {payments.accessUntil ? (
        <Link
          href="/casual/availability"
          className="flex items-center gap-3 rounded-card border border-border bg-surface-1 p-5 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ring"
          data-testid="home-availability"
        >
          <span
            className={`size-3 shrink-0 rounded-full ${availability.inPool ? "bg-success" : "bg-muted-foreground/50"}`}
            aria-hidden
          />
          <span className="flex flex-1 flex-col">
            <span className="font-bold">
              {availability.inPool && availability.endAt
                ? `Available until ${formatWindowTime(availability.endAt)}`
                : availability.status === "PAUSED"
                  ? "Availability paused"
                  : availability.status === "AVAILABLE" && availability.startAt
                    ? `Scheduled from ${formatWindowTime(availability.startAt)}`
                    : "You’re not available"}
            </span>
            <span className="text-[15px] text-muted-foreground">
              {availability.inPool ? "You’re in the Available Now pool" : "Go available to appear in the pool"}
            </span>
          </span>
          <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
        </Link>
      ) : null}

      {summary.unread ? (
        <Link
          href="/messages"
          className="flex items-center gap-3 rounded-card border border-border bg-surface-1 p-5 hover:bg-surface-2"
        >
          <span className="flex-1 font-bold">{plural(summary.unread, "unread message", "unread messages")}</span>
          <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
        </Link>
      ) : null}

      <Link
        href="/safety"
        className="flex items-center gap-3 rounded-card border border-dashed border-border p-5 text-[15px] text-muted-foreground hover:bg-surface-1"
      >
        <ShieldCheck className="size-6 shrink-0" strokeWidth={1.6} aria-hidden />
        Never send money to someone you haven’t met.
      </Link>
    </MemberShell>
  );
}
