import { randomUUID } from "node:crypto";

import { expect, type APIRequestContext, type Page } from "@playwright/test";

import { adminClient, createMember, enterDob, loginViaUi, randomLiberianPhone } from "./auth-helpers";

const adultYear = String(new Date().getUTCFullYear() - 27);

/**
 * A member who has finished steps 1–8 (age gate in the UI, steps 4–8 through the same database
 * functions the server actions call) and lands on the photos step.
 */
export async function memberAtPhotos(page: Page, name = "Musu") {
  const phone = randomLiberianPhone();
  const userId = await createMember(phone.e164);
  await loginViaUi(page, phone);
  await expect(page).toHaveURL(/\/signup$/);
  await enterDob(page, "14", "03", adultYear);
  await expect(page).toHaveURL(/\/onboarding\/rules$/);

  const admin = adminClient();
  const { data: docs } = await admin.from("legal_documents").select("document, version").eq("is_current", true);
  const versions = Object.fromEntries((docs ?? []).map((d) => [d.document, d.version]));
  expect((await admin.rpc("accept_current_documents", { p_user_id: userId, p_versions: versions })).error).toBeNull();
  const { data: area } = await admin.from("areas").select("id").eq("name", "Sinkor").single();
  expect(
    (
      await admin.rpc("save_profile_basics", {
        p_user_id: userId,
        p_display_name: name,
        p_gender: "WOMAN",
        p_seeking_genders: ["MAN"],
        p_area_id: area!.id,
        p_intent_relationship: true,
        p_intent_casual: false,
      })
    ).error,
  ).toBeNull();
  const { data: interests } = await admin.from("interests").select("id").limit(3);
  expect(
    (
      await admin.rpc("save_interests_and_bio", {
        p_user_id: userId,
        p_interest_ids: (interests ?? []).map((i) => i.id),
        p_bio: "Teacher by day, jollof critic by night.",
      })
    ).error,
  ).toBeNull();

  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/onboarding\/photos$/);
  return { phone, userId };
}

/** Fictional AI-generated photos from the mock-ups (allowed by the owner for tests). */
export const PHOTO_FIXTURES = ["musu1.jpg", "musu2.jpg", "musu3.jpg", "kemah.jpg"].map(
  (f) => `docs/mockups/html/images/${f}`,
);

export async function uploadPhotos(page: Page, files: string[]) {
  const before = await page.getByRole("button", { name: /^Photo \d/ }).count();
  await page.getByTestId("photo-input").setInputFiles(files);
  await expect(page.getByRole("button", { name: /^Photo \d/ })).toHaveCount(before + files.length, { timeout: 30_000 });
}

/**
 * A fictional ACTIVE member (verified, 3 approved photos), set up through the service role the way
 * finished onboarding and staff approvals would leave it. Used by the safety tests (Phase 5).
 */
export async function activeMember(
  name: string,
  files: string[],
  opts: { gender?: "MAN" | "WOMAN"; relationship?: boolean; area?: string } = {},
) {
  const gender = opts.gender ?? "MAN";
  const { seedPendingPhotos, seedPendingVerification } = await import("./staff-helpers");
  const phone = randomLiberianPhone();
  const userId = await createMember(phone.e164);
  const admin = adminClient();
  const { data: area } = await admin
    .from("areas")
    .select("id")
    .eq("name", opts.area ?? "Congo Town")
    .single();
  expect(
    (
      await admin.from("profiles").upsert({
        user_id: userId,
        date_of_birth: `${adultYear}-03-14`,
        display_name: name,
        gender,
        seeking_genders: [gender === "MAN" ? "WOMAN" : "MAN"],
        area_id: area!.id,
        intent_relationship: opts.relationship ?? false,
        intent_casual: !(opts.relationship ?? false),
        bio: "Graphic designer. Good food, Afrobeats and long talks. Let’s chat first.",
        is_profile_complete: true,
      })
    ).error,
  ).toBeNull();
  const { data: docs } = await admin.from("legal_documents").select("document, version").eq("is_current", true);
  const versions = Object.fromEntries((docs ?? []).map((d) => [d.document, d.version]));
  expect((await admin.rpc("accept_current_documents", { p_user_id: userId, p_versions: versions })).error).toBeNull();
  const { data: interests } = await admin.from("interests").select("id").limit(4);
  expect(
    (await admin.from("user_interests").insert((interests ?? []).map((i) => ({ user_id: userId, interest_id: i.id }))))
      .error,
  ).toBeNull();
  const photoIds = await seedPendingPhotos(userId, files);
  const verificationId = await seedPendingVerification(userId);
  expect(
    (
      await admin
        .from("verifications")
        .update({ status: "VERIFIED", reviewed_at: new Date().toISOString() })
        .eq("id", verificationId)
    ).error,
  ).toBeNull();
  expect(
    (
      await admin
        .from("profile_photos")
        .update({ status: "APPROVED", reviewed_at: new Date().toISOString(), reviewed_as_primary: true })
        .in("id", photoIds)
    ).error,
  ).toBeNull();
  expect((await admin.from("users").update({ status: "ACTIVE" }).eq("id", userId)).error).toBeNull();
  return { phone, userId, photoIds };
}

/**
 * Gives a member a Casual pass the way production can: a card checkout confirmed by a signed processor
 * event (fake processor, local only). No shortcut around the database's access rules.
 */
export async function givePassViaCard(request: APIRequestContext, userId: string) {
  const secret = process.env.FAKE_CARD_WEBHOOK_SECRET;
  expect(secret, "fake card processor not configured (pnpm env:setup)").toBeTruthy();
  const { fakeDelivery, FAKE_SIGNATURE_HEADER } = await import("../../lib/payments/card/fake");
  const admin = adminClient();
  const { data, error } = await admin.rpc("start_card_checkout", {
    p_user: userId,
    p_plan_code: "CARD_WEEKLY",
    p_processor: "fake",
  });
  expect(error).toBeNull();
  const { data: plan } = await admin.from("subscription_plans").select("price").eq("code", "CARD_WEEKLY").single();
  const subscriptionRef = `sub_${randomUUID()}`;
  const chargeId = `ch_${randomUUID()}`;
  const { body, signature } = fakeDelivery(secret!, "checkout.completed", {
    reference: (data as { reference: string }).reference,
    subscription: subscriptionRef,
    charge: chargeId,
    amount: Number(plan!.price),
    currency: "USD",
    period_end: Math.floor(Date.now() / 1000) + 7 * 86400,
  });
  const res = await request.post("/api/webhooks/card", {
    headers: { "content-type": "application/json", [FAKE_SIGNATURE_HEADER]: signature },
    data: body,
  });
  expect(await res.json()).toMatchObject({ outcome: "APPLIED" });
  return { subscriptionRef, chargeId };
}

/** Ends a card pass the way production can: a signed refund event for its charge (access ends, BR-25). */
export async function refundCardPass(request: APIRequestContext, pass: { subscriptionRef: string; chargeId: string }) {
  const { fakeDelivery, FAKE_SIGNATURE_HEADER } = await import("../../lib/payments/card/fake");
  const { body, signature } = fakeDelivery(process.env.FAKE_CARD_WEBHOOK_SECRET!, "charge.refunded", {
    subscription: pass.subscriptionRef,
    charge: pass.chargeId,
  });
  const res = await request.post("/api/webhooks/card", {
    headers: { "content-type": "application/json", [FAKE_SIGNATURE_HEADER]: signature },
    data: body,
  });
  expect(await res.json()).toMatchObject({ outcome: "APPLIED" });
}

/** Opens an availability window for a member through the same database function the screen uses. */
export async function goAvailable(userId: string, hours = 4) {
  const { error } = await adminClient().rpc("set_availability", {
    p_user: userId,
    p_start: null as unknown as string,
    p_end: new Date(Date.now() + hours * 3_600_000).toISOString(),
  });
  expect(error).toBeNull();
}
