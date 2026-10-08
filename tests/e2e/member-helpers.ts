import { expect, type Page } from "@playwright/test";

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
export async function activeMember(name: string, files: string[]) {
  const { seedPendingPhotos, seedPendingVerification } = await import("./staff-helpers");
  const phone = randomLiberianPhone();
  const userId = await createMember(phone.e164);
  const admin = adminClient();
  const { data: area } = await admin.from("areas").select("id").eq("name", "Congo Town").single();
  expect(
    (
      await admin.from("profiles").upsert({
        user_id: userId,
        date_of_birth: `${adultYear}-03-14`,
        display_name: name,
        gender: "MAN",
        seeking_genders: ["WOMAN"],
        area_id: area!.id,
        intent_relationship: false,
        intent_casual: true,
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
