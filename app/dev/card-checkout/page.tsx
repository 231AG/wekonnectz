import Link from "next/link";
import { notFound } from "next/navigation";
import { CreditCard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireMember } from "@/lib/auth/session";
import { fakePay } from "@/lib/payments/card/dev-actions";
import { getCardProcessor } from "@/lib/payments/card/server";

export const metadata = { title: "Test checkout" };
export const dynamic = "force-dynamic";

const relative = (v: unknown) => (typeof v === "string" && /^\/(?![/\\])/.test(v) ? v : "/casual/get-access/card");

/** Stand-in for a processor's hosted checkout page. Exists only with the fake processor (never in production). */
export default async function FakeCheckoutPage({ searchParams }: PageProps<"/dev/card-checkout">) {
  if (getCardProcessor()?.id !== "fake") notFound();
  await requireMember();
  const { ref, plan, success, cancel } = await searchParams;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-5 px-5 pt-10 pb-8">
      <p className="rounded-control bg-pending/15 p-3 text-center text-sm font-bold text-pending" role="note">
        TEST CHECKOUT — fake card processor, development only. No money moves.
      </p>
      <Card className="flex flex-col items-center gap-3 text-center">
        <CreditCard className="size-10 text-casual" strokeWidth={1.6} aria-hidden />
        <h1 className="font-display text-[22px] font-bold">Test card payment</h1>
        <p className="text-[15px] text-muted-foreground">Plan: {typeof plan === "string" ? plan : "—"}</p>
      </Card>
      <form action={fakePay} className="flex flex-col gap-3">
        <input type="hidden" name="ref" value={typeof ref === "string" ? ref : ""} />
        <input type="hidden" name="plan" value={typeof plan === "string" ? plan : ""} />
        <input type="hidden" name="success" value={relative(success)} />
        <Button type="submit" variant="casual">
          Pay with test card
        </Button>
      </form>
      <Button asChild variant="secondary">
        <Link href={relative(cancel)}>Cancel</Link>
      </Button>
    </div>
  );
}
