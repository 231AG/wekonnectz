import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { fakeDelivery, FAKE_SIGNATURE_HEADER } from "../../lib/payments/card/fake";
import { adminClient, loginViaUi } from "./auth-helpers";
import { SHOTS_P7B, trackPageErrors } from "./helpers";
import { activeMember } from "./member-helpers";

test.use({ extraHTTPHeaders: { "x-vercel-ip-country": "LR" } });

const IMG = (f: string) => `docs/mockups/html/images/${f}`;
const SECRET = process.env.FAKE_CARD_WEBHOOK_SECRET ?? "";

test("§16: card subscription through hosted checkout; cancel keeps access to period end (BR-26, BR-40, BR-41)", async ({
  page,
}) => {
  test.skip(!SECRET, "fake card processor not configured (pnpm env:setup)");
  const errors = trackPageErrors(page);
  const member = await activeMember("Hawa", [IMG("musu1.jpg"), IMG("musu2.jpg"), IMG("musu3.jpg")], {
    gender: "WOMAN",
  });
  await loginViaUi(page, member.phone);
  await expect(page).toHaveURL(/\/home$/);

  await page.goto("/casual/get-access");
  await page.getByRole("link", { name: "Card" }).click();
  await expect(page).toHaveURL(/\/casual\/get-access\/card$/);
  await expect(page.getByText("Weekly")).toBeVisible();
  await expect(page.getByText("Renews every week")).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P7B}/member-card-choose-plan.png`, fullPage: true });
  await page.getByRole("button", { name: "Continue to secure checkout" }).click();

  // The processor's hosted page (the fake one, locally). Nothing is granted until its signed event arrives.
  await expect(page).toHaveURL(/\/dev\/card-checkout\?/);
  await expect(page.getByText("TEST CHECKOUT")).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P7B}/member-card-hosted-checkout-fake.png`, fullPage: true });
  await page.goto("/casual");
  await expect(page.getByTestId("pass-status")).toHaveText("Casual needs a pass");
  await page.goBack();
  await page.getByRole("button", { name: "Pay with test card" }).click();

  await expect(page).toHaveURL(/\/me\/payments\?card=started$/, { timeout: 30_000 });
  const sub = page.getByTestId("card-subscription");
  await expect(sub).toContainText("Weekly · $3.00");
  await expect(sub).toContainText("Active");
  await expect(sub).toContainText("Renews");
  await expect(page.getByTestId("access-summary")).toContainText("Casual access is active");
  await page.screenshot({ path: `${SHOTS_P7B}/member-card-subscription-active.png`, fullPage: true });

  // BR-41: no mobile money pass on top of a card subscription.
  await page.goto("/casual/get-access");
  await expect(page.getByText("You already have an active card subscription.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();

  // BR-40: cancel at period end.
  await page.goto("/me/payments");
  await page.getByRole("button", { name: "Cancel subscription" }).click();
  await expect(page).toHaveURL(/\/me\/payments\?card=cancelled$/);
  await expect(sub).toContainText("Cancelled");
  await expect(sub).toContainText("Won’t renew. Access until");
  await expect(page.getByRole("button", { name: "Cancel subscription" })).toHaveCount(0);
  await expect(page.getByTestId("access-summary")).toContainText("Casual access is active");
  await page.screenshot({ path: `${SHOTS_P7B}/member-card-subscription-cancelled.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("§22: card webhook — bad signature is 401 and logged; a replay is a no-op; a failed renewal keeps access in grace", async ({
  page,
  request,
}) => {
  test.skip(!SECRET, "fake card processor not configured (pnpm env:setup)");
  const admin = adminClient();
  const member = await activeMember("Kebeh", [IMG("musu1.jpg"), IMG("musu2.jpg"), IMG("musu3.jpg")], {
    gender: "WOMAN",
  });
  const { data: started, error } = await admin.rpc("start_card_checkout", {
    p_user: member.userId,
    p_plan_code: "CARD_MONTHLY",
    p_processor: "fake",
  });
  expect(error).toBeNull();
  const reference = (started as { reference: string }).reference;
  const subRef = `sub_${randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  const post = (body: string, signature: string) =>
    request.post("/api/webhooks/card", {
      headers: { "content-type": "application/json", [FAKE_SIGNATURE_HEADER]: signature },
      data: body,
    });

  // Forged: signed with the wrong secret.
  const forged = fakeDelivery("f".repeat(48), "checkout.completed", {
    reference,
    subscription: subRef,
    charge: `ch_${randomUUID()}`,
    amount: 10,
    currency: "USD",
    period_end: now + 30 * 86400,
  });
  const bad = await post(forged.body, forged.signature);
  expect(bad.status()).toBe(401);
  const { data: invalid } = await admin
    .from("payment_events")
    .select("signature_valid, raw_payload")
    .eq("type", "CARD_WEBHOOK_INVALID")
    .order("received_at", { ascending: false })
    .limit(20);
  expect(invalid?.some((e) => e.signature_valid === false && JSON.stringify(e.raw_payload).includes(reference))).toBe(
    true,
  );
  expect((await admin.rpc("has_casual_access", { p_user: member.userId })).data).toBe(false);

  // Genuine, delivered twice.
  const real = fakeDelivery(SECRET, "checkout.completed", {
    reference,
    subscription: subRef,
    customer: "cus_e2e",
    charge: `ch_${randomUUID()}`,
    amount: 10,
    currency: "USD",
    period_end: now + 30 * 86400,
  });
  const first = await post(real.body, real.signature);
  expect(first.status()).toBe(200);
  expect(await first.json()).toMatchObject({ outcome: "APPLIED" });
  const replay = await post(real.body, real.signature);
  expect(replay.status()).toBe(200);
  expect(await replay.json()).toMatchObject({ outcome: "DUPLICATE" });
  const { count } = await admin
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("processor_subscription_ref", subRef);
  expect(count).toBe(1);
  expect((await admin.rpc("has_casual_access", { p_user: member.userId })).data).toBe(true);

  // An old signed delivery is refused (replay window).
  const stale = fakeDelivery(SECRET, "invoice.payment_failed", { subscription: subRef }, now - 3600);
  expect((await post(stale.body, stale.signature)).status()).toBe(401);

  // Failed renewal: PAYMENT_FAILED, access kept for the grace period (OD-20, DEV-ONLY 48 h).
  const failed = fakeDelivery(SECRET, "invoice.payment_failed", { subscription: subRef });
  expect((await post(failed.body, failed.signature)).status()).toBe(200);
  await loginViaUi(page, member.phone);
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/me/payments");
  const sub = page.getByTestId("card-subscription");
  await expect(sub).toContainText("Payment failed");
  await expect(sub).toContainText("Access continues until");
  await expect(page.getByTestId("access-summary")).toContainText("Casual access is active");
  await page.screenshot({ path: `${SHOTS_P7B}/member-card-payment-failed.png`, fullPage: true });
});
