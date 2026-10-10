/**
 * Card processor adapter (spec §16). Processor-specific code stays behind this interface; the rest of
 * the app only sees normalised events. No card data ever touches WeKonnectz: members pay on the
 * processor's hosted page.
 *
 * `createCheckout` also receives our checkout `reference` (the PENDING subscription id) so the
 * completed-checkout event can be bound to the member and plan on our side, never to ids the event
 * carries for itself.
 */
export interface CardProcessor {
  id: string;
  createCheckout(input: {
    userId: string;
    planId: string;
    reference: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;
  /** Signature (and replay window) check first. Null when the delivery can't be trusted. */
  verifyWebhook(headers: Headers, rawBody: string): VerifiedEvent | null;
  /** Stop renewals. Must succeed (not throw) when the subscription is already cancelled or ended. */
  cancelAtPeriodEnd(processorSubscriptionId: string): Promise<void>;
  getManageUrl?(customerRef: string): Promise<string>;
}

/** The state machine's vocabulary (apply_card_event() in the database). */
export const CARD_EVENT_TYPES = [
  "CHECKOUT_COMPLETED",
  "RENEWAL_SUCCEEDED",
  "RENEWAL_FAILED",
  "CANCEL_SCHEDULED",
  "SUBSCRIPTION_ENDED",
  "DISPUTE_OPENED",
  "DISPUTE_CLOSED",
  "REFUNDED",
] as const;
export type CardEventType = (typeof CARD_EVENT_TYPES)[number];

/** A processor event after its signature was verified, normalised for apply_card_event(). */
export type VerifiedEvent = {
  id: string;
  /** UNHANDLED: a processor event type we don't act on; it is still stored. */
  type: CardEventType | "UNHANDLED";
  occurredAt: string;
  reference?: string;
  subscriptionRef?: string;
  customerRef?: string;
  chargeId?: string;
  disputeId?: string;
  amount?: number;
  currency?: string;
  periodEnd?: string;
  won?: boolean;
  raw: unknown;
};

/** The JSON apply_card_event() takes. */
export function toDatabaseEvent(e: VerifiedEvent): Record<string, unknown> {
  return {
    id: e.id,
    type: e.type,
    occurred_at: e.occurredAt,
    reference: e.reference,
    subscription_ref: e.subscriptionRef,
    customer_ref: e.customerRef,
    charge_id: e.chargeId,
    dispute_id: e.disputeId,
    amount: e.amount,
    currency: e.currency,
    period_end: e.periodEnd,
    won: e.won,
    raw: e.raw,
  };
}
