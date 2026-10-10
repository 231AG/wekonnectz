import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AvailabilityForm } from "@/components/availability/availability-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  leaveAvailability,
  pauseAvailability,
  resumeAvailability,
  saveAvailability,
  saveRequestPermission,
} from "@/lib/availability/actions";
import { memberAvailability, type IneligibleReason } from "@/lib/availability/server";
import { MEMBER_HOME, nextStepFor, requireMember } from "@/lib/auth/session";
import { formatWindowTime } from "@/lib/domain/availability";
import { cn } from "@/lib/utils";

export const metadata = { title: "Availability" };

const REASONS: Record<IneligibleReason, { text: string; href?: string; cta?: string }> = {
  NO_PASS: { text: "You need an active pass to go available.", href: "/casual/get-access", cta: "Get a pass" },
  PHOTOS: {
    text: "You need 3 approved photos, including your main photo.",
    href: "/onboarding/photos",
    cta: "Your photos",
  },
  NO_CASUAL_INTENT: { text: "Turn on Casual Connection in your profile first.", href: "/me", cta: "My profile" },
  NOT_VERIFIED: { text: "Your account needs to be verified first." },
  ACCOUNT: { text: "Your account can’t go available right now." },
};

/** Availability (member mock-up 08; spec §12): Available now, Schedule, Pause, who can send requests. */
export default async function AvailabilityPage() {
  const member = await requireMember();
  if (member.status === "SUSPENDED") redirect(MEMBER_HOME);
  if (member.status !== "ACTIVE") redirect(nextStepFor(member));
  const a = await memberAvailability(member.id);
  const hasWindow = a.status !== "UNAVAILABLE" && a.endAt !== null;
  const scheduled = a.scheduled;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 px-5 pt-5 pb-8">
      <header className="flex items-center gap-3">
        <Button asChild variant="secondary" size="icon" aria-label="Back">
          <Link href="/casual">
            <ArrowLeft className="size-5" strokeWidth={1.8} aria-hidden />
          </Link>
        </Button>
        <h1 className="flex-1 text-center font-display text-[20px] font-bold">Availability</h1>
        <span className="size-11" aria-hidden />
      </header>

      {a.reasons.length ? (
        <Card role="status" className="flex flex-col gap-3" data-testid="availability-blocked">
          {a.reasons.map((r) => (
            <div key={r} className="flex flex-col gap-2">
              <p>{REASONS[r].text}</p>
              {REASONS[r].href ? (
                <Button asChild variant="casual" size="md" className="self-start">
                  <Link href={REASONS[r].href!}>{REASONS[r].cta}</Link>
                </Button>
              ) : null}
            </div>
          ))}
        </Card>
      ) : null}

      {hasWindow ? (
        <Card className="flex flex-col gap-3" data-testid="availability-status">
          <p className="font-bold">
            {a.status === "PAUSED"
              ? "Paused — you’re hidden from the pool"
              : scheduled
                ? `Scheduled: ${formatWindowTime(a.startAt!)} – ${formatWindowTime(a.endAt!)}`
                : a.inPool
                  ? `You’re available until ${formatWindowTime(a.endAt!)}`
                  : a.permission === "NOBODY" && a.reasons.length === 0
                    ? `Your window runs until ${formatWindowTime(a.endAt!)}, but with Nobody you’re hidden from the pool`
                    : `Your window runs until ${formatWindowTime(a.endAt!)}, but you’re not in the pool right now`}
          </p>
          {a.status === "PAUSED" ? (
            <p className="text-[15px] text-muted-foreground">
              Window kept: {formatWindowTime(a.startAt!)} – {formatWindowTime(a.endAt!)} (GMT).
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {a.status === "PAUSED" && a.reasons.length > 0 ? null : (
              <form action={a.status === "PAUSED" ? resumeAvailability : pauseAvailability}>
                <Button type="submit" variant="outline" size="md">
                  {a.status === "PAUSED" ? "Resume" : "Pause"}
                </Button>
              </form>
            )}
            <form action={leaveAvailability}>
              <Button type="submit" variant="ghost" size="md">
                Leave the pool
              </Button>
            </form>
          </div>
        </Card>
      ) : null}

      {a.reasons.length === 0 ? (
        <AvailabilityForm
          save={saveAvailability}
          defaultStart={a.suggestedStart}
          defaultEnd={a.suggestedEnd}
          todayLabel={a.todayLabel}
          maxWindowHours={a.maxWindowHours}
          submitLabel={hasWindow ? "Update window" : "Go available"}
        />
      ) : null}

      <section
        aria-labelledby="who-can"
        className="flex flex-col gap-2.5 rounded-card border border-border bg-surface-1 p-[18px]"
      >
        <h2 id="who-can" className="text-[15px] font-bold">
          Who can send you requests
        </h2>
        <form action={saveRequestPermission} className="flex flex-wrap gap-2">
          {(
            [
              ["ANYONE", "Anyone in the pool"],
              ["NOBODY", "Nobody"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="submit"
              name="permission"
              value={value}
              aria-pressed={a.permission === value}
              variant="outline"
              size="md"
              className={cn(a.permission === value && "border-transparent bg-pending text-on-accent hover:bg-pending")}
            >
              {label}
            </Button>
          ))}
        </form>
        {a.permission === "NOBODY" ? (
          <p className="text-[13px] text-muted-foreground">
            With Nobody, you don’t appear in Available Now and no one can send you requests.
          </p>
        ) : null}
      </section>
    </div>
  );
}
