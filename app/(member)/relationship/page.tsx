import Link from "next/link";
import { redirect } from "next/navigation";

import { MemberShell } from "@/components/layout/member-shell";
import { DiscoverCard } from "@/components/relationship/discover-card";
import { DiscoverFilters } from "@/components/relationship/discover-filters";
import { RelationshipTabs } from "@/components/relationship/relationship-tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MEMBER_HOME, nextStepFor, requireMember } from "@/lib/auth/session";
import { likeMember, passMember } from "@/lib/relationship/actions";
import { discoverNext } from "@/lib/storage/relationship";
import { createClient } from "@/lib/supabase/server";
import { discoverFiltersSchema } from "@/lib/validation/messages";

export const metadata = { title: "Discover" };

/** Relationship Discover (member mock-up 02; spec §15). One profile at a time; filters in a sheet. */
export default async function DiscoverPage({ searchParams }: PageProps<"/relationship">) {
  const member = await requireMember();
  if (member.status === "SUSPENDED") redirect(MEMBER_HOME);
  if (member.status !== "ACTIVE") redirect(nextStepFor(member));

  const sp = await searchParams;
  const parsed = discoverFiltersSchema.safeParse({
    area: sp.area || undefined,
    minAge: sp.minAge || undefined,
    maxAge: sp.maxAge || undefined,
    interests: sp.interests === undefined ? undefined : ([] as string[]).concat(sp.interests),
  });
  const filters = parsed.success ? parsed.data : {};

  const supabase = await createClient();
  const [result, { data: areas }, { data: interests }] = await Promise.all([
    discoverNext(member.id, {
      areaId: filters.area,
      minAge: filters.minAge,
      maxAge: filters.maxAge,
      interestIds: filters.interests,
    }),
    supabase.from("areas").select("id, name").eq("active", true).order("name"),
    supabase.from("interests").select("id, name").eq("active", true).order("name"),
  ]);

  return (
    <MemberShell>
      <header className="flex items-center justify-between">
        <DiscoverFilters areas={areas ?? []} interests={interests ?? []} current={filters} />
        <h1 className="font-display text-[20px] font-bold">Discover</h1>
        <span className="size-11" aria-hidden />
      </header>
      <RelationshipTabs active="/relationship" />
      {"error" in result ? (
        <Card className="flex flex-col gap-3">
          <p className="font-bold">Relationship isn’t on for you yet</p>
          <p className="text-[15px] text-muted-foreground">
            You appear in Discover — and can browse it — once Relationship is in your profile and your 3 photos are
            approved.
          </p>
          <Button asChild variant="secondary">
            <Link href="/onboarding/about">Edit what you’re looking for</Link>
          </Button>
        </Card>
      ) : result.card ? (
        <DiscoverCard key={result.card.userId} card={result.card} like={likeMember} pass={passMember} />
      ) : (
        <Card tone="dashed" className="flex flex-col gap-2">
          <p className="font-bold">No one new right now</p>
          <p className="text-[15px] text-muted-foreground">
            Check back later, or widen your filters. Profiles you pass on come back after a week.
          </p>
        </Card>
      )}
    </MemberShell>
  );
}
