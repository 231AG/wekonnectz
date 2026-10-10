import Link from "next/link";
import { Flame } from "lucide-react";

import { MemberShell } from "@/components/layout/member-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireMember } from "@/lib/auth/session";
import { formatLiberiaTime } from "@/lib/domain/money";
import { paymentOptions } from "@/lib/storage/payments";

export const metadata = { title: "Casual Connection" };

/** Casual Connection: pass status and Get access. The Available Now pool arrives in Phases 8–9. */
export default async function CasualPage() {
  const member = await requireMember();
  const options = member.status === "ACTIVE" ? await paymentOptions(member.id) : null;
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
              Until {formatLiberiaTime(options.accessUntil)} (GMT). Go available to appear in the Available Now pool.
            </p>
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
        {member.status === "ACTIVE" && options?.accessUntil ? (
          <Button asChild variant="casual">
            <Link href="/casual/availability">Availability</Link>
          </Button>
        ) : null}
        {member.status === "ACTIVE" && !options?.cardActive ? (
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
