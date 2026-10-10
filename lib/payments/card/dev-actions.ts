"use server";

import { createHash, randomUUID } from "node:crypto";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireMember } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env.server";
import { fakeDelivery, FAKE_SIGNATURE_HEADER } from "@/lib/payments/card/fake";
import { getCardProcessor, processCardWebhook } from "@/lib/payments/card/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The fake processor's "hosted checkout" (local development and CI only). Paying sends a signed
 * checkout.completed delivery through the same webhook code a real processor's would take. The plan
 * and price come from the member's own open checkout, never from the form.
 */
const schema = z.object({
  ref: z.uuid(),
  success: z.string().regex(/^\/(?![/\\])[\w\-/?=&.]*$/),
});

export async function fakePay(formData: FormData): Promise<void> {
  const member = await requireMember();
  const secret = serverEnv().FAKE_CARD_WEBHOOK_SECRET;
  if (getCardProcessor()?.id !== "fake" || !secret) redirect("/casual/get-access");
  const parsed = schema.safeParse({ ref: formData.get("ref"), success: formData.get("success") });
  if (!parsed.success) redirect("/casual/get-access/card?error=UNAVAILABLE");
  const { data } = await createAdminClient().rpc("member_pending_checkout", {
    p_user: member.id,
    p_reference: parsed.data.ref,
  });
  const checkout = data?.[0];
  if (!checkout) redirect("/casual/get-access/card?error=UNAVAILABLE");
  const now = Math.floor(Date.now() / 1000);
  const { body, signature } = fakeDelivery(secret, "checkout.completed", {
    reference: parsed.data.ref,
    subscription: `sub_${randomUUID()}`,
    customer: `cus_${createHash("sha256").update(member.id).digest("hex").slice(0, 16)}`,
    charge: `ch_${randomUUID()}`,
    amount: Number(checkout.price),
    currency: checkout.currency,
    period_end: now + checkout.duration_hours * 3600,
  });
  const result = await processCardWebhook(new Headers({ [FAKE_SIGNATURE_HEADER]: signature }), body);
  redirect(result.status === 200 ? parsed.data.success : "/casual/get-access/card?error=UNAVAILABLE");
}
