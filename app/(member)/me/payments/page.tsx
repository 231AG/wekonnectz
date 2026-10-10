import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ClaimReply } from "@/components/payments/claim-reply";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MEMBER_HOME, nextStepFor, requireMember } from "@/lib/auth/session";
import { formatLiberiaTime, formatUsd } from "@/lib/domain/money";
import { cancelPaymentClaim, prepareEvidenceUpload, replyToPaymentClaim } from "@/lib/payments/claims/actions";
import { CLAIM_STATUS_LABELS, memberRejectionText, REVIEW_TIME_TEXT } from "@/lib/payments/claims/labels";
import { cancelCardPlan } from "@/lib/payments/card/actions";
import { memberCardSubscription, type CardSubscription } from "@/lib/payments/card/server";
import { memberClaims, memberPasses, paymentOptions } from "@/lib/storage/payments";
import { PROVIDER_LABELS } from "@/lib/validation/payments";

export const metadata = { title: "Subscription & payments" };

const TONE = {
  PENDING_REVIEW: "pending",
  NEEDS_INFO: "casual",
  APPROVED: "approved",
  REJECTED: "danger",
  CANCELLED: "neutral",
} as const;

/** Subscription & payments (spec §20): access, claims with their status, receipts. */
export default async function PaymentsPage({ searchParams }: PageProps<"/me/payments">) {
  const member = await requireMember();
  if (member.status !== "ACTIVE" && member.status !== "SUSPENDED") redirect(nextStepFor(member));
  const { submitted, card: cardNotice } = await searchParams;
  const [options, claims, passes, card] = await Promise.all([
    paymentOptions(member.id),
    memberClaims(member.id),
    memberPasses(member.id),
    memberCardSubscription(member.id),
  ]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-5 px-5 pt-5 pb-8">
      <header className="flex items-center gap-3">
        <Button asChild variant="secondary" size="icon" aria-label="Back">
          <Link href="/me">
            <ArrowLeft className="size-5" strokeWidth={1.8} aria-hidden />
          </Link>
        </Button>
        <h1 className="font-display text-[22px] font-bold">Subscription & payments</h1>
      </header>

      {submitted === "1" ? (
        <Card role="status" className="flex flex-col gap-1 border-pending/40 bg-pending/10">
          <p className="font-bold">Payment submitted — we’re verifying it.</p>
          <p className="text-[15px] text-muted-foreground">{REVIEW_TIME_TEXT}</p>
        </Card>
      ) : null}

      {cardNotice === "started" ? (
        <Card role="status" className="border-casual/40 bg-casual/10">
          Thanks — your card payment is being confirmed by the payment provider.
        </Card>
      ) : cardNotice === "cancelled" ? (
        <Card role="status">Your card subscription won’t renew. You keep access until the end of the paid period.</Card>
      ) : cardNotice === "cancel-failed" ? (
        <Card role="alert" className="border-danger/40 bg-danger/10">
          We couldn’t cancel your card subscription. Please try again.
        </Card>
      ) : null}

      <Card className="flex flex-col gap-2" data-testid="access-summary">
        {options.accessUntil ? (
          <>
            <p className="font-bold">Casual access is active</p>
            <p className="text-[15px] text-muted-foreground">Until {formatLiberiaTime(options.accessUntil)} (GMT)</p>
          </>
        ) : (
          <p className="text-[15px] text-muted-foreground">You don’t have Casual access right now.</p>
        )}
        {member.status === "ACTIVE" && !options.cardActive ? (
          <Button asChild variant="casual" size="md" className="mt-2 self-start">
            <Link href="/casual/get-access">{options.accessUntil ? "Add more time" : "Get a pass"}</Link>
          </Button>
        ) : null}
      </Card>

      {card ? <CardPlan card={card} /> : null}

      <section aria-labelledby="claims" className="flex flex-col gap-3">
        <h2 id="claims" className="font-display text-[18px] font-bold">
          Payments
        </h2>
        {claims.length === 0 ? (
          <p className="text-[15px] text-muted-foreground">No mobile money payments yet.</p>
        ) : null}
        {claims.map((c) => (
          <Card key={c.id} className="flex flex-col gap-3" data-testid="claim">
            <div className="flex items-start gap-3">
              <div className="flex flex-1 flex-col">
                <span className="font-bold">
                  {c.planName} · {formatUsd(c.amount)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {PROVIDER_LABELS[c.provider]} · {c.transactionId} · {formatLiberiaTime(c.createdAt)}
                </span>
              </div>
              <Badge tone={TONE[c.status]}>{CLAIM_STATUS_LABELS[c.status]}</Badge>
            </div>
            {c.status === "PENDING_REVIEW" ? <p className="text-sm text-muted-foreground">{REVIEW_TIME_TEXT}</p> : null}
            {c.status === "REJECTED" ? <p className="text-[15px]">{memberRejectionText(c.rejectionReason)}</p> : null}
            {c.status === "NEEDS_INFO" ? (
              <>
                <p className="rounded-control bg-surface-2 p-3 text-[15px]">
                  <span className="block text-[13px] font-semibold text-muted-foreground">Our question</span>
                  {c.staffQuestion}
                </p>
                <ClaimReply claimId={c.id} prepare={prepareEvidenceUpload} reply={replyToPaymentClaim} />
              </>
            ) : null}
            {c.status === "PENDING_REVIEW" || c.status === "NEEDS_INFO" ? (
              <form action={cancelPaymentClaim}>
                <input type="hidden" name="claimId" value={c.id} />
                <Button type="submit" variant="ghost" size="sm">
                  Withdraw this payment claim
                </Button>
              </form>
            ) : null}
          </Card>
        ))}
      </section>

      {passes.length ? (
        <section aria-labelledby="receipts" className="flex flex-col gap-3">
          <h2 id="receipts" className="font-display text-[18px] font-bold">
            Receipts
          </h2>
          <ul className="flex flex-col gap-2">
            {passes.map((p, i) => (
              <li key={i} className="rounded-control bg-surface-1 p-3 text-[15px]">
                <span className="font-bold">{p.planName}</span>
                {p.amount !== null ? ` · ${formatUsd(p.amount)}` : ""}
                <span className="block text-sm text-muted-foreground">
                  {p.source === "CARD"
                    ? `Card · ${formatLiberiaTime(p.startsAt)}`
                    : `${formatLiberiaTime(p.startsAt)} → ${p.expiresAt ? formatLiberiaTime(p.expiresAt) : ""}`}
                  {p.provider && p.provider !== "CARD" ? ` · ${PROVIDER_LABELS[p.provider]} ${p.transactionId}` : ""}
                  {p.paymentStatus === "REFUNDED" ? " · Refunded" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Link href={MEMBER_HOME} className="sr-only">
        Home
      </Link>
    </div>
  );
}

const CARD_STATUS: Partial<
  Record<CardSubscription["status"], { label: string; tone: "approved" | "neutral" | "danger" | "pending" }>
> = {
  ACTIVE: { label: "Active", tone: "approved" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  PAYMENT_FAILED: { label: "Payment failed", tone: "danger" },
  SUSPENDED: { label: "On hold", tone: "pending" },
};

/** Card subscription (spec §16, BR-40): status, renewal, cancel at period end, manage link. */
function CardPlan({ card }: { card: CardSubscription }) {
  const status = CARD_STATUS[card.status] ?? { label: card.status, tone: "neutral" as const };
  const canCancel = !card.cancelAtPeriodEnd && (card.status === "ACTIVE" || card.status === "PAYMENT_FAILED");
  return (
    <section aria-labelledby="card-plan" className="flex flex-col gap-3">
      <h2 id="card-plan" className="font-display text-[18px] font-bold">
        Card subscription
      </h2>
      <Card className="flex flex-col gap-3" data-testid="card-subscription">
        <div className="flex items-start gap-3">
          <span className="flex flex-1 flex-col">
            <span className="font-bold">
              {card.planName} · {formatUsd(card.price)}
            </span>
          </span>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <p className="text-[15px] text-muted-foreground">
          {card.status === "ACTIVE" && !card.cancelAtPeriodEnd && card.periodEnd
            ? `Renews ${formatLiberiaTime(card.periodEnd)} (GMT).`
            : card.status === "PAYMENT_FAILED"
              ? `Your last renewal didn’t go through. Access continues until ${formatLiberiaTime(card.expiresAt)} (GMT) while the payment provider retries.`
              : card.status === "SUSPENDED"
                ? "On hold while the payment provider looks into a dispute."
                : `Won’t renew. Access until ${formatLiberiaTime(card.expiresAt)} (GMT).`}
        </p>
        <div className="flex flex-wrap gap-2">
          {card.manageUrl ? (
            <Button asChild variant="secondary" size="sm">
              <a href={card.manageUrl} rel="noopener noreferrer">
                Manage card
              </a>
            </Button>
          ) : null}
          {canCancel ? (
            <form action={cancelCardPlan}>
              <Button type="submit" variant="ghost" size="sm">
                Cancel subscription
              </Button>
            </form>
          ) : null}
        </div>
        {canCancel ? (
          <p className="text-sm text-muted-foreground">
            Cancelling stops renewals. You keep access until the end of the period you paid for.
          </p>
        ) : null}
      </Card>
    </section>
  );
}
