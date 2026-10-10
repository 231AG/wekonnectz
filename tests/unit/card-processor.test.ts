import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { FakeCardProcessor, FAKE_SIGNATURE_HEADER, FAKE_TOLERANCE_SECONDS, fakeDelivery, normaliseFake, signFake } =
  await import("@/lib/payments/card/fake");
const { CARD_EVENT_TYPES, toDatabaseEvent } = await import("@/lib/payments/card/processor");
const { formatBillingPeriod } = await import("@/lib/domain/money");

const SECRET = "s".repeat(48);
const NOW = 1_800_000_000;
const processor = new FakeCardProcessor(SECRET, () => NOW * 1000);
const headers = (sig: string) => new Headers({ [FAKE_SIGNATURE_HEADER]: sig });

describe("fake card processor webhooks (spec §16, §22)", () => {
  const { body, signature } = fakeDelivery(
    SECRET,
    "invoice.paid",
    { subscription: "sub_1", charge: "ch_1", amount: 3, currency: "USD", period_end: NOW + 604800 },
    NOW,
  );

  it("accepts a correctly signed delivery and normalises it", () => {
    const e = processor.verifyWebhook(headers(signature), body);
    expect(e).toMatchObject({
      type: "RENEWAL_SUCCEEDED",
      subscriptionRef: "sub_1",
      chargeId: "ch_1",
      amount: 3,
      currency: "USD",
    });
    expect(e?.periodEnd).toBe(new Date((NOW + 604800) * 1000).toISOString());
    expect(e?.occurredAt).toBe(new Date(NOW * 1000).toISOString());
  });

  it("BR-26: refuses a bad signature (wrong secret)", () => {
    const forged = fakeDelivery("x".repeat(48), "checkout.completed", { reference: "r" }, NOW);
    expect(processor.verifyWebhook(headers(forged.signature), forged.body)).toBeNull();
  });

  it("refuses a body changed after signing", () => {
    expect(processor.verifyWebhook(headers(signature), body.replace('"amount":3', '"amount":0.01'))).toBeNull();
  });

  it("refuses a missing or malformed signature header", () => {
    expect(processor.verifyWebhook(new Headers(), body)).toBeNull();
    expect(processor.verifyWebhook(headers("v1=abc"), body)).toBeNull();
    expect(processor.verifyWebhook(headers(`t=${NOW},v1=${"g".repeat(64)}`), body)).toBeNull();
  });

  it("refuses a replay outside the time window, either side", () => {
    const old = NOW - FAKE_TOLERANCE_SECONDS - 1;
    expect(processor.verifyWebhook(headers(signFake(SECRET, body, old)), body)).toBeNull();
    const future = NOW + FAKE_TOLERANCE_SECONDS + 1;
    expect(processor.verifyWebhook(headers(signFake(SECRET, body, future)), body)).toBeNull();
    expect(processor.verifyWebhook(headers(signFake(SECRET, body, NOW - 60)), body)).not.toBeNull();
  });

  it("refuses a signed body that isn't an event", () => {
    const junk = "not json";
    expect(processor.verifyWebhook(headers(signFake(SECRET, junk, NOW)), junk)).toBeNull();
    const noId = JSON.stringify({ type: "invoice.paid", created: NOW, data: {} });
    expect(processor.verifyWebhook(headers(signFake(SECRET, noId, NOW)), noId)).toBeNull();
  });

  it("maps every processor event onto the state machine, and unknown ones to UNHANDLED", () => {
    const mapped = [
      "checkout.completed",
      "invoice.paid",
      "invoice.payment_failed",
      "subscription.cancel_scheduled",
      "subscription.ended",
      "dispute.opened",
      "dispute.closed",
      "charge.refunded",
    ].map((type) => normaliseFake({ id: "e", type, created: NOW, data: {} })?.type);
    expect(mapped).toEqual([...CARD_EVENT_TYPES]);
    expect(normaliseFake({ id: "e", type: "customer.updated", created: NOW, data: {} })?.type).toBe("UNHANDLED");
  });

  it("passes the raw event on to be stored with the normalised fields", () => {
    const e = processor.verifyWebhook(headers(signature), body)!;
    const db = toDatabaseEvent(e);
    expect(db).toMatchObject({ id: e.id, type: "RENEWAL_SUCCEEDED", subscription_ref: "sub_1", charge_id: "ch_1" });
    expect(db.raw).toEqual(JSON.parse(body));
  });

  it("hosted checkout carries our reference and stays on this site", async () => {
    const { url } = await processor.createCheckout({
      userId: "u",
      planId: "CARD_WEEKLY",
      reference: "11111111-1111-4111-8111-111111111111",
      successUrl: "/me/payments?card=started",
      cancelUrl: "/casual/get-access/card?cancelled=1",
    });
    expect(url.startsWith("/dev/card-checkout?")).toBe(true);
    expect(new URLSearchParams(url.split("?")[1]).get("ref")).toBe("11111111-1111-4111-8111-111111111111");
  });
});

describe("billing period wording", () => {
  it("names weekly and monthly plans", () => {
    expect(formatBillingPeriod(168)).toBe("week");
    expect(formatBillingPeriod(720)).toBe("month");
    expect(formatBillingPeriod(240)).toBe("10 days");
  });
});
