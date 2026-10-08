import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CreditCard, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MEMBER_HOME, nextStepFor, requireMember } from "@/lib/auth/session";
import { formatDuration, formatUsd } from "@/lib/domain/money";
import { paymentOptions } from "@/lib/storage/payments";
import { PROVIDER_LABELS } from "@/lib/validation/payments";

export const metadata = { title: "Get a pass" };

const radioCard =
  "flex min-h-11 cursor-pointer items-center gap-4 rounded-card border border-border bg-surface-1 p-5 has-checked:border-casual has-checked:bg-casual/10 has-focus-visible:outline-2 has-focus-visible:outline-ring";

/** Choose plan and wallet (member mock-up 07; spec §16 step 1). Card arrives in Phase 7b. */
export default async function GetAccessPage() {
  const member = await requireMember();
  if (member.status === "SUSPENDED") redirect(MEMBER_HOME);
  if (member.status !== "ACTIVE") redirect(nextStepFor(member));
  const options = await paymentOptions(member.id);
  const blocked = options.cardActive || options.pendingClaims >= 2;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-5 px-5 pt-5 pb-8">
      <header className="flex items-center gap-3">
        <Button asChild variant="secondary" size="icon" aria-label="Back">
          <Link href="/casual">
            <ArrowLeft className="size-5" strokeWidth={1.8} aria-hidden />
          </Link>
        </Button>
        <h1 className="flex-1 text-center font-display text-[20px] font-bold">Get a pass</h1>
        <span className="size-11" aria-hidden />
      </header>
      <p className="text-[16px] leading-6 text-muted-foreground">
        A pass unlocks the Available Now pool and message requests. It doesn’t guarantee replies or meetings.
      </p>

      {options.cardActive ? (
        <Card role="status">You already have an active card subscription.</Card>
      ) : options.pendingClaims >= 2 ? (
        <Card role="status" className="flex flex-col gap-2">
          <p>You already have payments waiting for review.</p>
          <Link href="/me/payments" className="font-bold text-pending underline underline-offset-4">
            See your payments
          </Link>
        </Card>
      ) : null}

      <form method="get" action="/casual/get-access/pay" className="flex flex-1 flex-col gap-5">
        <fieldset className="flex flex-col gap-3" disabled={blocked}>
          <legend className="sr-only">Plan</legend>
          {options.plans.map((p, i) => (
            <label key={p.id} className={radioCard}>
              <input
                type="radio"
                name="plan"
                value={p.id}
                defaultChecked={i === 1 || options.plans.length === 1}
                required
                className="size-6 accent-casual"
              />
              <span className="flex flex-1 flex-col">
                <span className="font-display text-[18px] font-bold">{p.name}</span>
                <span className="text-muted-foreground">{formatDuration(p.durationHours)}</span>
              </span>
              <span className="font-display text-[20px] font-bold">{formatUsd(p.price)}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="flex flex-col gap-3" disabled={blocked}>
          <legend className="mb-3 text-[15px] font-semibold text-muted-foreground">Pay with</legend>
          <div className="grid grid-cols-3 gap-3">
            {options.wallets.map((w, i) => (
              <label
                key={w.provider}
                className="flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-border bg-surface-1 p-3 text-center text-[15px] font-bold has-checked:border-pending has-focus-visible:outline-2 has-focus-visible:outline-ring"
              >
                <input
                  type="radio"
                  name="provider"
                  value={w.provider}
                  defaultChecked={i === 0}
                  required
                  className="sr-only"
                />
                <Smartphone className="size-6 text-pending" strokeWidth={1.6} aria-hidden />
                {PROVIDER_LABELS[w.provider]}
              </label>
            ))}
            <span
              aria-disabled="true"
              className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-card border border-border p-3 text-center text-[15px] font-bold text-muted-foreground opacity-60"
            >
              <CreditCard className="size-6" strokeWidth={1.6} aria-hidden />
              Card · soon
            </span>
          </div>
        </fieldset>
        <div className="flex-1" />
        <p className="text-center text-sm text-muted-foreground">
          One-time purchase. No auto-renew. Buying again adds time to your current pass.
        </p>
        <Button type="submit" variant="casual" disabled={blocked}>
          Continue
        </Button>
      </form>
    </div>
  );
}
