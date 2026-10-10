"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireMember } from "@/lib/auth/session";
import { cancelCardSubscription, startCheckout } from "@/lib/payments/card/server";

/**
 * Card subscriptions (spec §16). The member id comes from the session; start_card_checkout() re-checks
 * the account, the plan, one subscription at a time and OD-19.
 */
const planSchema = z.object({ plan: z.string().regex(/^[A-Z0-9_]{2,40}$/) });

export async function startCardCheckout(formData: FormData): Promise<void> {
  const member = await requireMember();
  const parsed = planSchema.safeParse({ plan: formData.get("plan") });
  if (!parsed.success) redirect("/casual/get-access/card?error=PLAN_NOT_AVAILABLE");
  const result = await startCheckout(member.id, parsed.data.plan);
  if ("error" in result) redirect(`/casual/get-access/card?error=${result.error}`);
  redirect(result.url);
}

export async function cancelCardPlan(): Promise<void> {
  const member = await requireMember();
  const ok = await cancelCardSubscription(member.id);
  revalidatePath("/me/payments");
  redirect(ok ? "/me/payments?card=cancelled" : "/me/payments?card=cancel-failed");
}
