import Link from "next/link";
import { Bookmark, Flame } from "lucide-react";

import { PoolCard } from "@/components/casual/pool-card";
import { MemberShell } from "@/components/layout/member-shell";
import { DiscoverFilters } from "@/components/relationship/discover-filters";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireMember } from "@/lib/auth/session";
import { memberAvailability } from "@/lib/availability/server";
import { poolPage } from "@/lib/casual/server";
import { windowFilterUntil } from "@/lib/domain/availability";
import { formatLiberiaTime } from "@/lib/domain/money";
import { paymentOptions } from "@/lib/storage/payments";
import { createClient } from "@/lib/supabase/server";
import { poolFiltersSchema } from "@/lib/validation/requests";

export const metadata = { title: "Casual Connection" };

/**
 * Casual Connection. Pass-holders who can be in the pool see Available Now (member mock-up 03; spec §13):
 * filters, fair rotation, 20 at a time. Everyone else sees what they need first (a pass, photos, …).
 */
export default async function CasualPage({ searchParams }: PageProps<"/casual">) {
  const member = await requireMember();
  const active = member.status === "ACTIVE";
  const [options, availability] = active
    ? await Promise.all([paymentOptions(member.id), memberAvailability(member.id)])
    : [null, null];

  if (!active || !availability || availability.reasons.length > 0) {
    return (
      <MemberShell>
        <h1 className="font-display text-[34px] font-bold">Casual Connection</h1>
        <Card className="flex flex-col gap-3 border-casual/30 bg-casual/10">
          <Flame className="size-8 text-casual" strokeWidth={1.8} aria-hidden />
          {options?.accessUntil ? (
            <>
              <p className="font-bold" data-testid="pass-status">
                Your pass is active
              </p>
              <p className="text-[15px] text-muted-foreground">
                Until {formatLiberiaTime(options.accessUntil)} (GMT). Finish your profile to see who’s available.
              </p>
              <Button asChild variant="casual">
                <Link href="/casual/availability">See what’s missing</Link>
              </Button>
            </>
          ) : (
            <>
              <p className="font-bold" data-testid="pass-status">
                Casual needs a pass
              </p>
              <p className="text-[15px] text-muted-foreground">
                A pass unlocks the Available Now pool and message requests with verified members.
              </p>
            </>
          )}
          {active && !options?.cardActive ? (
            <Button asChild variant={options?.accessUntil ? "outline" : "casual"}>
              <Link href="/casual/get-access">{options?.accessUntil ? "Add more time" : "Get a pass"}</Link>
            </Button>
          ) : null}
          <Link
            href="/me/payments"
            className="text-center text-sm font-semibold text-pending underline underline-offset-4"
          >
            Subscription & payments
          </Link>
        </Card>
      </MemberShell>
    );
  }

  const sp = await searchParams;
  const parsed = poolFiltersSchema.safeParse({
    area: sp.area || undefined,
    minAge: sp.minAge || undefined,
    maxAge: sp.maxAge || undefined,
    interests: sp.interests === undefined ? undefined : ([] as string[]).concat(sp.interests),
    window: sp.window || undefined,
    after: sp.after || undefined,
  });
  const filters = parsed.success ? parsed.data : {};
  const supabase = await createClient();
  const [page, { data: areas }, { data: interests }] = await Promise.all([
    poolPage(
      member.id,
      {
        areaId: filters.area,
        minAge: filters.minAge,
        maxAge: filters.maxAge,
        interestIds: filters.interests,
        until: windowFilterUntil(filters.window, new Date()),
      },
      filters.after,
    ),
    supabase.from("areas").select("id, name").eq("active", true).order("name"),
    supabase.from("interests").select("id, name").eq("active", true).order("name"),
  ]);
  const cards = "error" in page ? [] : page.cards;
  const next = "error" in page ? null : page.next;
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "after" || v === undefined) continue;
    for (const one of ([] as string[]).concat(v)) query.append(k, one);
  }
  const areaName = areas?.find((a) => a.id === filters.area)?.name;
  const chips = [
    areaName,
    filters.minAge || filters.maxAge ? `${filters.minAge ?? 18}–${filters.maxAge ?? "99"}` : null,
    filters.window === "2h" ? "Next 2 hours" : filters.window === "tonight" ? "Tonight" : null,
    filters.interests?.length
      ? `${filters.interests.length} interest${filters.interests.length === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean) as string[];

  return (
    <MemberShell>
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[30px] leading-tight font-bold whitespace-nowrap">Available now</h1>
          <p className="text-[15px] font-semibold text-casual" data-testid="pass-status">
            Pass active · {availability.passTimeLeft}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary" size="icon" aria-label="Saved">
            <Link href="/casual/saved">
              <Bookmark className="size-5" strokeWidth={1.8} aria-hidden />
            </Link>
          </Button>
          <DiscoverFilters
            areas={areas ?? []}
            interests={interests ?? []}
            current={filters}
            action="/casual"
            withWindow
          />
        </div>
      </header>
      {chips.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="Filters on">
          {chips.map((c) => (
            <li key={c} className="rounded-full border border-border bg-surface-1 px-4 py-2 text-[15px] font-semibold">
              {c}
            </li>
          ))}
        </ul>
      ) : null}
      {!availability.inPool ? (
        <Link
          href="/casual/availability"
          className="rounded-control border border-border bg-surface-1 px-4 py-3 text-[15px] hover:bg-surface-2"
        >
          You’re not in the pool yourself. <span className="font-bold text-casual">Go available</span>
        </Link>
      ) : null}
      {cards.length ? (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6" aria-label="Members available now">
          {cards.map((c) => (
            <li key={c.userId}>
              <PoolCard card={c} />
            </li>
          ))}
        </ul>
      ) : (
        <Card tone="dashed" className="flex flex-col gap-2" data-testid="pool-empty">
          <p className="font-bold">No one available right now</p>
          <p className="text-[15px] text-muted-foreground">
            Check back later, or widen your filters. People appear here while their availability window is open.
          </p>
        </Card>
      )}
      {next ? (
        <Button asChild variant="outline">
          <Link href={`/casual?${new URLSearchParams([...query, ["after", next]])}`}>More people</Link>
        </Button>
      ) : null}
    </MemberShell>
  );
}
