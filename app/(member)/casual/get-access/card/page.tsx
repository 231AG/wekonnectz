import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MEMBER_HOME, nextStepFor, requireMember } from "@/lib/auth/session";
import { formatBillingPeriod, formatUsd } from "@/lib/domain/money";
import { startCardCheckout } from "@/lib/payments/card/actions";
import { cardPaymentsEnabled } from "@/lib/payments/card/server";
import { paymentOptions } from "@/lib/storage/payments";

export const metadata = { title: "Pay by card" };

const ERRORS: Record<string, string> = {
  ACCOUNT_CANNOT_PAY: "Your account can’t buy a pass right now.",
  PLAN_NOT_AVAILABLE: "That plan isn’t available any more. Choose another.",
  CARD_SUBSCRIPTION_ACTIVE: "You already have an active card subscription.",
  MOBILE_MONEY_PASS_ACTIVE: "You can start a card subscription when your mobile money pass ends.",
  TOO_MANY_CHECKOUTS: "Too many checkouts started. Try again in an hour.",
  UNAVAILABLE: "Card payments aren’t available right now. Please try again later.",
};

const radioCard =
  "flex min-h-11 cursor-pointer items-center gap-4 rounded-card border border-border bg-surface-1 p-5 has-checked:border-casual has-checked:bg-casual/10 has-focus-visible:outline-2 has-focus-visible:outline-ring";

/** Card subscription (spec §16): pick Weekly or Monthly, then the processor's hosted checkout. */
export default async function CardPlanPage({ searchParams }: PageProps<"/casual/get-access/card">) {
  const member = await requireMember();
  if (member.status === "SUSPENDED") redirect(MEMBER_HOME);
  if (member.status !== "ACTIVE") redirect(nextStepFor(member));
  if (!cardPaymentsEnabled()) redirect("/casual/get-access");
  const { error, cancelled } = await searchParams;
  const options = await paymentOptions(member.id);
  const blocked = options.cardActive || options.cardPlans.length === 0;
  const errorText = typeof error === "string" ? (ERRORS[error] ?? ERRORS.UNAVAILABLE) : null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-5 px-5 pt-5 pb-8">
      <header className="flex items-center gap-3">
        <Button asChild variant="secondary" size="icon" aria-label="Back">
          <Link href="/casual/get-access">
            <ArrowLeft className="size-5" strokeWidth={1.8} aria-hidden />
          </Link>
        </Button>
        <h1 className="flex-1 text-center font-display text-[20px] font-bold">Pay by card</h1>
        <span className="size-11" aria-hidden />
      </header>
      <p className="text-[16px] leading-6 text-muted-foreground">
        Visa or Mastercard. Renews automatically until you cancel; cancel any time and keep access until the end of the
        period you paid for.
      </p>

      {errorText ? (
        <Card role="alert" className="border-danger/40 bg-danger/10">
          {errorText}
        </Card>
      ) : cancelled === "1" ? (
        <Card role="status">Checkout cancelled. You haven’t been charged.</Card>
      ) : null}
      {options.cardActive ? <Card role="status">You already have an active card subscription.</Card> : null}
      {!options.cardActive && options.mobileMoneyActive ? (
        <Card role="status" className="border-pending/40 bg-pending/10 text-[15px]" data-testid="mm-warning">
          Your mobile money pass keeps running at the same time. Its remaining time isn’t paused or added to the card
          subscription.
        </Card>
      ) : null}

      <form action={startCardCheckout} className="flex flex-1 flex-col gap-5">
        <fieldset className="flex flex-col gap-3" disabled={blocked}>
          <legend className="sr-only">Plan</legend>
          {options.cardPlans.map((p, i) => (
            <label key={p.id} className={radioCard}>
              <input
                type="radio"
                name="plan"
                value={p.code}
                defaultChecked={i === 0}
                required
                className="size-6 accent-casual"
              />
              <span className="flex flex-1 flex-col">
                <span className="font-display text-[18px] font-bold">{p.name}</span>
                <span className="text-muted-foreground">Renews every {formatBillingPeriod(p.durationHours)}</span>
              </span>
              <span className="font-display text-[20px] font-bold">
                {formatUsd(p.price)}
                <span className="text-[14px] font-semibold text-muted-foreground">
                  /{formatBillingPeriod(p.durationHours)}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex-1" />
        <p className="text-center text-sm text-muted-foreground">
          <Lock className="mr-1 inline size-4 align-[-2px]" strokeWidth={1.8} aria-hidden />
          You enter your card on the payment provider’s secure page. WeKonnectz never sees your card details.
        </p>
        <Button type="submit" variant="casual" disabled={blocked}>
          Continue to secure checkout
        </Button>
      </form>
    </div>
  );
}
