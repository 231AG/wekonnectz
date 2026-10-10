import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import type { CardEventType, CardProcessor, VerifiedEvent } from "@/lib/payments/card/processor";

/**
 * Local development and tests only (OD-4: no real processor yet). Its "hosted checkout" is the dev
 * page /dev/card-checkout and it signs its own webhooks with FAKE_CARD_WEBHOOK_SECRET, using the
 * usual scheme: header `wk-fake-signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">`.
 * getCardProcessor() refuses to create it in production.
 */
export const FAKE_SIGNATURE_HEADER = "wk-fake-signature";
/** Replay window: a signed delivery older (or further in the future) than this is refused. */
export const FAKE_TOLERANCE_SECONDS = 300;

/** The fake processor's own event names, as a real processor would have its own. */
const TYPES: Record<string, CardEventType> = {
  "checkout.completed": "CHECKOUT_COMPLETED",
  "invoice.paid": "RENEWAL_SUCCEEDED",
  "invoice.payment_failed": "RENEWAL_FAILED",
  "subscription.cancel_scheduled": "CANCEL_SCHEDULED",
  "subscription.ended": "SUBSCRIPTION_ENDED",
  "dispute.opened": "DISPUTE_OPENED",
  "dispute.closed": "DISPUTE_CLOSED",
  "charge.refunded": "REFUNDED",
};

export type FakeEvent = {
  id: string;
  type: string;
  created: number;
  data: {
    reference?: string;
    subscription?: string;
    customer?: string;
    charge?: string;
    dispute?: string;
    amount?: number;
    currency?: string;
    period_end?: number;
    won?: boolean;
  };
};

export function signFake(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

function parseHeader(header: string | null): { t: number; v1: string } | null {
  if (!header || header.length > 300) return null;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return i < 0 ? [p, ""] : [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  if (!/^\d{1,12}$/.test(parts.t ?? "") || !Number.isSafeInteger(t)) return null;
  if (!/^[0-9a-f]{64}$/.test(parts.v1 ?? "")) return null;
  return { t, v1: parts.v1 };
}

const iso = (unix: number | undefined) =>
  typeof unix === "number" && Number.isFinite(unix) ? new Date(unix * 1000).toISOString() : undefined;

export function normaliseFake(event: FakeEvent): VerifiedEvent | null {
  if (typeof event?.id !== "string" || typeof event.type !== "string" || typeof event.created !== "number") return null;
  const d = event.data ?? {};
  return {
    id: event.id,
    type: TYPES[event.type] ?? "UNHANDLED",
    occurredAt: iso(event.created)!,
    reference: d.reference,
    subscriptionRef: d.subscription,
    customerRef: d.customer,
    chargeId: d.charge,
    disputeId: d.dispute,
    amount: d.amount,
    currency: d.currency,
    periodEnd: iso(d.period_end),
    won: d.won,
    raw: event,
  };
}

export class FakeCardProcessor implements CardProcessor {
  readonly id = "fake";
  constructor(
    private readonly secret: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async createCheckout(input: {
    userId: string;
    planId: string;
    reference: string;
    successUrl: string;
    cancelUrl: string;
  }) {
    const q = new URLSearchParams({
      ref: input.reference,
      plan: input.planId,
      success: input.successUrl,
      cancel: input.cancelUrl,
    });
    return { url: `/dev/card-checkout?${q}` };
  }

  verifyWebhook(headers: Headers, rawBody: string): VerifiedEvent | null {
    const sig = parseHeader(headers.get(FAKE_SIGNATURE_HEADER));
    if (!sig) return null;
    if (Math.abs(this.now() / 1000 - sig.t) > FAKE_TOLERANCE_SECONDS) return null;
    const expected = Buffer.from(createHmac("sha256", this.secret).update(`${sig.t}.${rawBody}`).digest("hex"));
    const given = Buffer.from(sig.v1);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    try {
      return normaliseFake(JSON.parse(rawBody) as FakeEvent);
    } catch {
      return null;
    }
  }

  async cancelAtPeriodEnd(): Promise<void> {
    // The fake processor has nothing to call; a real one confirms with its own CANCEL_SCHEDULED event.
  }
}

/** Builds a signed fake delivery (dev checkout page and tests). */
export function fakeDelivery(
  secret: string,
  type: string,
  data: FakeEvent["data"],
  created = Math.floor(Date.now() / 1000),
) {
  const body = JSON.stringify({ id: `evt_${randomUUID()}`, type, created, data } satisfies FakeEvent);
  return { body, signature: signFake(secret, body, created) };
}
