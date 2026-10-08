import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ClaimForm } from "@/components/payments/claim-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MEMBER_HOME, nextStepFor, requireMember } from "@/lib/auth/session";
import { formatDuration, formatUsd } from "@/lib/domain/money";
import { prepareEvidenceUpload, submitPaymentClaim } from "@/lib/payments/claims/actions";
import { paymentOptions } from "@/lib/storage/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROVIDER_LABELS, PROVIDERS } from "@/lib/validation/payments";

export const metadata = { title: "Pay with mobile money" };

/** §16 steps 2–4: where and how much to pay, then the claim. Nothing is charged by the app. */
export default async function PayPage({ searchParams }: PageProps<"/casual/get-access/pay">) {
  const member = await requireMember();
  if (member.status === "SUSPENDED") redirect(MEMBER_HOME);
  if (member.status !== "ACTIVE") redirect(nextStepFor(member));
  const sp = await searchParams;
  const options = await paymentOptions(member.id);
  const plan = options.plans.find((p) => p.id === sp.plan);
  const provider = PROVIDERS.find((p) => p === sp.provider);
  const wallet = options.wallets.find((w) => w.provider === provider);
  if (!plan || !provider || !wallet || options.cardActive) redirect("/casual/get-access");

  const { data: auth } = await createAdminClient().auth.admin.getUserById(member.id);
  const phone = auth.user?.phone ? `+${auth.user.phone.replace(/^\+/, "")}` : "";
  const amount = formatUsd(plan.price);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-5 px-5 pt-5 pb-8">
      <header className="flex items-center gap-3">
        <Button asChild variant="secondary" size="icon" aria-label="Back">
          <Link href="/casual/get-access">
            <ArrowLeft className="size-5" strokeWidth={1.8} aria-hidden />
          </Link>
        </Button>
        <h1 className="flex-1 text-center font-display text-[20px] font-bold">Pay with {PROVIDER_LABELS[provider]}</h1>
        <span className="size-11" aria-hidden />
      </header>

      <Card className="flex flex-col gap-4 border-casual/30 bg-casual/10">
        <p className="font-display text-[18px] font-bold">
          {plan.name} · {formatDuration(plan.durationHours)}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[16px]">
          <dt className="text-muted-foreground">Send exactly</dt>
          <dd className="font-display text-[22px] font-bold" data-testid="amount">
            {amount}
          </dd>
          <dt className="text-muted-foreground">To</dt>
          <dd>
            <span className="font-bold" data-testid="merchant-number">
              {wallet.numberOrCode}
            </span>
            <span className="block text-sm text-muted-foreground">{wallet.displayName}</span>
          </dd>
          <dt className="text-muted-foreground">Reference</dt>
          <dd className="font-bold" data-testid="reference-code">
            {options.referenceCode}
          </dd>
        </dl>
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-[15px] text-muted-foreground">
          <li>Pay from your {PROVIDER_LABELS[provider]} wallet (USSD or app).</li>
          <li>If your wallet lets you add a note, add the reference code.</li>
          <li>Keep the confirmation message and take a screenshot.</li>
        </ol>
      </Card>

      <h2 className="font-display text-[20px] font-bold">After you’ve paid</h2>
      <p className="text-[15px] text-muted-foreground">
        Tell us about the payment. We check it against our wallet records before your pass starts — a screenshot alone
        is never enough.
      </p>
      <ClaimForm
        planId={plan.id}
        provider={provider}
        amountLabel={`${amount} (USD)`}
        defaultPhone={phone}
        prepare={prepareEvidenceUpload}
        submit={submitPaymentClaim}
      />
    </div>
  );
}
