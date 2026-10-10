import "server-only";

import * as Sentry from "@sentry/nextjs";

import { serverEnv } from "@/lib/env.server";
import { FakeCardProcessor } from "@/lib/payments/card/fake";
import { toDatabaseEvent, type CardProcessor } from "@/lib/payments/card/processor";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

/** Largest webhook body accepted; processors send a few KB. */
export const MAX_WEBHOOK_BYTES = 64 * 1024;

let misconfigReported = false;

/** The configured processor, or null when none is (OD-4). */
export function getCardProcessor(): CardProcessor | null {
  const env = serverEnv();
  switch (env.CARD_PROCESSOR) {
    case "fake":
      // Local development and CI only: needs the explicit opt-in that `pnpm env:setup` writes, and never
      // runs on any Vercel deployment (production or preview).
      if (env.VERCEL || env.ALLOW_FAKE_CARD_PROCESSOR !== "1") {
        // Misconfigured deployment: card payments stay off (fail closed) without taking pages down.
        if (!misconfigReported) {
          misconfigReported = true;
          Sentry.captureMessage("The fake card processor runs only locally; card payments are off", { level: "error" });
        }
        return null;
      }
      if (!env.FAKE_CARD_WEBHOOK_SECRET) return null;
      return new FakeCardProcessor(env.FAKE_CARD_WEBHOOK_SECRET);
    default:
      return null;
  }
}

/** Card UI and checkout: only when switched on and a processor is configured. */
export function cardPaymentsEnabled(): boolean {
  return serverEnv().CARD_PAYMENTS_ENABLED === "1" && getCardProcessor() !== null;
}

export type WebhookResult = { status: 200 | 401 | 404 | 413 | 500; outcome?: string };

/**
 * One webhook delivery (§16, §22): signature first; an untrusted delivery is logged as invalid and
 * refused; a trusted one is stored and applied once (apply_card_event() is idempotent on the event ID).
 * Nothing from the body is logged to Sentry.
 */
export async function processCardWebhook(headers: Headers, rawBody: string): Promise<WebhookResult> {
  const processor = getCardProcessor();
  if (!processor) return { status: 404 };
  const admin = createAdminClient();
  if (Buffer.byteLength(rawBody) > MAX_WEBHOOK_BYTES) {
    await admin.rpc("log_invalid_card_webhook", { p_processor: processor.id, p_reason: "TOO_LARGE", p_body: "" });
    return { status: 413 };
  }
  const event = processor.verifyWebhook(headers, rawBody);
  if (!event) {
    const { data: logged } = await admin.rpc("log_invalid_card_webhook", {
      p_processor: processor.id,
      p_reason: "BAD_SIGNATURE",
      p_body: rawBody,
    });
    if (logged === false)
      Sentry.captureMessage("card webhook: invalid-delivery log paused (flood)", { level: "warning" });
    return { status: 401 };
  }
  const { data, error } = await admin.rpc("apply_card_event", {
    p_processor: processor.id,
    p_event: toDatabaseEvent(event) as Database["public"]["Functions"]["apply_card_event"]["Args"]["p_event"],
  });
  if (error) {
    // 55000: an earlier event hasn't arrived yet; P0001: an owner setting has no value (e.g. OD-20).
    // Either way nothing was stored, so the processor's retry is applied later.
    Sentry.captureMessage("card webhook not applied yet", {
      level: error.code === "55000" ? "info" : "error",
      extra: { code: error.code },
    });
    return { status: 500 };
  }
  const d = (data ?? {}) as { outcome?: string; result?: string; reason?: string; cancel_at_processor?: boolean };
  const outcome = d.outcome ?? "UNKNOWN";
  if (outcome === "REJECTED") {
    Sentry.captureMessage("card webhook event rejected", {
      level: "warning",
      extra: { reason: d.reason, type: event.type },
    });
  }
  if (d.result === "NEEDS_REFUND") Sentry.captureMessage("card charge needs a refund", { level: "warning" });
  // A refunded subscription, or a charge we won't give access for: stop renewals at the processor too.
  // The flag comes back on replays as well, so if this call fails the processor's retry tries again.
  if (d.cancel_at_processor && event.subscriptionRef) {
    try {
      await processor.cancelAtPeriodEnd(event.subscriptionRef);
      const { error: markError } = await admin.rpc("mark_processor_cancelled", {
        p_processor: processor.id,
        p_ref: event.subscriptionRef,
      });
      // Harmless if it fails (the next delivery cancels again, which the contract allows), but noted.
      if (markError) Sentry.captureMessage("card: processor cancel not recorded", { level: "warning" });
    } catch (e) {
      Sentry.captureException(e);
      return { status: 500 };
    }
  }
  return { status: 200, outcome };
}

const CHECKOUT_CODES = [
  "ACCOUNT_CANNOT_PAY",
  "PLAN_NOT_AVAILABLE",
  "CARD_SUBSCRIPTION_ACTIVE",
  "MOBILE_MONEY_PASS_ACTIVE",
  "TOO_MANY_CHECKOUTS",
] as const;
export type CheckoutError = (typeof CHECKOUT_CODES)[number] | "UNAVAILABLE";

/** Starts a checkout for the member; returns the processor's hosted page URL. */
export async function startCheckout(
  userId: string,
  planCode: string,
): Promise<{ url: string } | { error: CheckoutError }> {
  const processor = getCardProcessor();
  if (!processor || !cardPaymentsEnabled()) return { error: "UNAVAILABLE" };
  const { data, error } = await createAdminClient().rpc("start_card_checkout", {
    p_user: userId,
    p_plan_code: planCode,
    p_processor: processor.id,
  });
  if (error || !data) {
    return { error: CHECKOUT_CODES.find((c) => error?.message.includes(c)) ?? "UNAVAILABLE" };
  }
  const d = data as { reference: string; plan_code: string; processor_price_id: string | null };
  try {
    const checkout = await processor.createCheckout({
      userId,
      planId: d.processor_price_id ?? d.plan_code,
      reference: d.reference,
      successUrl: "/me/payments?card=started",
      cancelUrl: "/casual/get-access/card?cancelled=1",
    });
    // Only our own pages or the processor's HTTPS page.
    if (!/^(\/(?![/\\])|https:\/\/)/.test(checkout.url)) return { error: "UNAVAILABLE" };
    return checkout;
  } catch (e) {
    Sentry.captureException(e);
    return { error: "UNAVAILABLE" };
  }
}

export type CardSubscription = {
  id: string;
  planName: string;
  price: number;
  currency: string;
  status: Database["public"]["Enums"]["subscription_status"];
  periodEnd: string | null;
  expiresAt: string;
  cancelAtPeriodEnd: boolean;
  manageUrl: string | null;
};

export async function memberCardSubscription(userId: string): Promise<CardSubscription | null> {
  const { data, error } = await createAdminClient().rpc("member_card_subscription", { p_user: userId });
  if (error) throw new Error("card subscription unavailable");
  const s = data?.[0];
  if (!s) return null;
  const processor = getCardProcessor();
  let manageUrl: string | null = null;
  if (processor?.getManageUrl && s.customer_ref && processor.id === s.processor) {
    try {
      manageUrl = await processor.getManageUrl(s.customer_ref);
    } catch {
      manageUrl = null;
    }
  }
  return {
    id: s.id,
    planName: s.plan_name,
    price: Number(s.price),
    currency: s.currency,
    status: s.status,
    periodEnd: s.period_end,
    expiresAt: s.expires_at,
    cancelAtPeriodEnd: s.cancel_at_period_end,
    manageUrl,
  };
}

/** Cancel at period end (BR-40): the processor first, then our record. */
export async function cancelCardSubscription(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.rpc("member_card_subscription", { p_user: userId });
  const s = data?.[0];
  const processor = getCardProcessor();
  if (!s || !processor || processor.id !== s.processor || !s.processor_subscription_id) return false;
  if (s.status !== "ACTIVE" && s.status !== "PAYMENT_FAILED" && s.status !== "CANCELLED") return false;
  if (s.cancel_at_period_end) return true;
  try {
    await processor.cancelAtPeriodEnd(s.processor_subscription_id);
  } catch (e) {
    Sentry.captureException(e);
    return false;
  }
  const { error } = await admin.rpc("member_cancel_card_subscription", { p_user: userId, p_subscription: s.id });
  return !error;
}

/** Renewal reminder hook (§16): what is due now. Notifications are sent from Phase 11. */
export async function cardRenewalsDue(): Promise<number> {
  const { data, error } = await createAdminClient().rpc("card_renewals_due");
  if (error) throw new Error("renewal reminder query failed");
  return data?.length ?? 0;
}
