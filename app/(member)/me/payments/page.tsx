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
  const { submitted } = await searchParams;
  const [options, claims, passes] = await Promise.all([
    paymentOptions(member.id),
    memberClaims(member.id),
    memberPasses(member.id),
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

      <Card className="flex flex-col gap-2" data-testid="access-summary">
        {options.accessUntil ? (
          <>
            <p className="font-bold">Casual access is active</p>
            <p className="text-[15px] text-muted-foreground">Until {formatLiberiaTime(options.accessUntil)} (GMT)</p>
          </>
        ) : (
          <p className="text-[15px] text-muted-foreground">You don’t have Casual access right now.</p>
        )}
        {member.status === "ACTIVE" ? (
          <Button asChild variant="casual" size="md" className="mt-2 self-start">
            <Link href="/casual/get-access">{options.accessUntil ? "Add more time" : "Get a pass"}</Link>
          </Button>
        ) : null}
      </Card>

      <section aria-labelledby="claims" className="flex flex-col gap-3">
        <h2 id="claims" className="font-display text-[18px] font-bold">
          Payments
        </h2>
        {claims.length === 0 ? <p className="text-[15px] text-muted-foreground">No payments yet.</p> : null}
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
                  {formatLiberiaTime(p.startsAt)} → {formatLiberiaTime(p.expiresAt)}
                  {p.provider && p.provider !== "CARD" ? ` · ${PROVIDER_LABELS[p.provider]} ${p.transactionId}` : ""}
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
