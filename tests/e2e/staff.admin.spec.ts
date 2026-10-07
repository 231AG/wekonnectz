import { expect, test } from "@playwright/test";

import { createClient } from "@supabase/supabase-js";

import { adminClient, createMember, randomLiberianPhone, signInMemberViaApi } from "./auth-helpers";
import { SHOTS_P3, SHOTS_P4, trackPageErrors } from "./helpers";
import sharp from "sharp";
import { memberAtPhotos, PHOTO_FIXTURES } from "./member-helpers";
import {
  createStaff,
  seedPendingPhotos,
  seedPendingVerification,
  staffClientAal1,
  staffSignInViaUi,
  totp,
} from "./staff-helpers";

test.use({ extraHTTPHeaders: { "x-vercel-ip-country": "LR" } });

test("§7 / OD-27: staff sign in with email + password, then must set up and use TOTP", async ({ page }) => {
  const errors = trackPageErrors(page);
  const staff = await createStaff();

  await page.goto("/admin/photos");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.screenshot({ path: `${SHOTS_P3}/admin-login.png` });

  await page.getByLabel("Email").fill(staff.email);
  await page.getByLabel("Password").fill("Wrong-password-123");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Email or password is wrong." })).toBeVisible();

  const secret = await staffSignInViaUi(page, staff, async () => {
    await page.screenshot({ path: `${SHOTS_P3}/admin-mfa.png` });
  });

  // Moderator: no Payments or Settings (Q9).
  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav.getByRole("link", { name: "Photos" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Payments" })).toHaveCount(0);

  // Staff never use the member app (§7).
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/admin$/);

  // Sign out, sign in again: the code is asked every time.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.getByLabel("Email").fill(staff.email);
  await page.getByLabel("Password").fill(staff.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
  await page.goto("/admin/photos");
  await expect(page).toHaveURL(/\/admin\/mfa$/);
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "That code didn’t work" })).toBeVisible();
  // The next time step's code (accepted within the allowed clock drift), so it isn't a reuse of the first.
  await page.getByLabel("6-digit code").fill(totp(secret, Date.now() + 30_000));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  expect(errors).toEqual([]);
});

test("§7: without an MFA (aal2) session, staff functions refuse — even when called directly", async () => {
  const staff = await createStaff();
  const client = await staffClientAal1(staff);
  const queue = await client.rpc("staff_photo_queue", { p_limit: 5 });
  expect(queue.error?.message).toContain("NOT_STAFF");
  const counts = await client.rpc("staff_queue_counts");
  expect(counts.error?.message).toContain("NOT_STAFF");
});

test("§7: an email sign-in link never counts as a staff sign-in (password + TOTP only)", async () => {
  const staff = await createStaff();
  const admin = adminClient();
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: staff.email });
  expect(error).toBeNull();
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: verifyError } = await client.auth.verifyOtp({
    token_hash: link.properties!.hashed_token,
    type: "magiclink",
  });
  expect(verifyError).toBeNull();
  // Someone with only the staff inbox enrols their own authenticator through the API and reaches aal2…
  const { data: factor, error: enrolError } = await client.auth.mfa.enroll({ factorType: "totp" });
  expect(enrolError).toBeNull();
  const { error: mfaError } = await client.auth.mfa.challengeAndVerify({
    factorId: factor!.id,
    code: totp(factor!.totp.secret),
  });
  expect(mfaError).toBeNull();
  expect((await client.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel).toBe("aal2");
  // …and is still refused: the session was never opened with the password.
  expect((await client.rpc("staff_photo_queue", { p_limit: 5 })).error?.message).toContain("NOT_STAFF");
  expect((await client.rpc("staff_queue_counts")).error?.message).toContain("NOT_STAFF");
});

test("account guards: Auth can't create a member without the Liberia check, or give a member an email", async () => {
  const admin = adminClient();
  const noPass = randomLiberianPhone();
  expect((await admin.auth.admin.createUser({ phone: noPass.e164, phone_confirm: true })).error).not.toBeNull();
  expect((await admin.auth.admin.createUser({ phone: "+14155550123", phone_confirm: true })).error).not.toBeNull();

  const phone = randomLiberianPhone();
  const memberId = await createMember(phone.e164);
  expect((await admin.auth.admin.updateUserById(memberId, { email: "member@example.test" })).error).not.toBeNull();
  const member = await signInMemberViaApi(phone.e164);
  expect((await member.auth.updateUser({ email: "member2@example.test" })).error).not.toBeNull();
});

test("a member can't sign in to the console with a password or open it with their session", async ({ page }) => {
  const phone = randomLiberianPhone();
  const memberId = await createMember(phone.e164);
  const { data } = await adminClient().auth.admin.getUserById(memberId);
  expect(data.user?.email || null).toBeNull();

  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("member@example.test");
  await page.getByLabel("Password").fill("Anything-123456");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Email or password is wrong." })).toBeVisible();

  await memberAtPhotos(page, "Hawa");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("§21 photo queue: a moderator approves and rejects (reason required); each decision is audited", async ({
  page,
  browser,
}) => {
  const errors = trackPageErrors(page);
  // A member with three photos waiting.
  const memberPage = await browser.newPage({ extraHTTPHeaders: { "x-vercel-ip-country": "LR" } });
  const name = `Queue ${Math.random().toString(36).slice(2, 6)}`;
  const { userId } = await memberAtPhotos(memberPage, name);
  const [main, second, third] = await seedPendingPhotos(userId, PHOTO_FIXTURES.slice(0, 3));

  const staff = await createStaff();
  await staffSignInViaUi(page, staff);
  await expect(page.getByTestId("photos-pending")).not.toHaveText("0");
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Photos" }).click();
  await expect(page.getByRole("heading", { name: "Photo queue" })).toBeVisible();

  const cards = page.getByRole("article").filter({ hasText: name });
  await expect(cards).toHaveCount(3);
  await expect(cards.first().getByText("Main photo · face must be clear")).toBeVisible();
  await expect(cards.getByText("Main photo · face must be clear")).toHaveCount(1);
  for (const src of await cards.locator("img").evaluateAll((els) => els.map((e) => e.getAttribute("src")!))) {
    expect(src).toMatch(/\/storage\/v1\/object\/sign\/photos\/.+\?token=/);
  }
  await page.screenshot({ path: `${SHOTS_P3}/admin-photo-queue.png` });

  // Reject without a reason → refused.
  const secondCard = page
    .getByRole("article")
    .filter({ hasText: `${name}` })
    .filter({ hasText: "Photo 2" });
  await secondCard.getByRole("button", { name: "Reject" }).click();
  await expect(secondCard.getByRole("alert")).toHaveText("Choose a reason to reject.");

  await secondCard.getByLabel("Rejection reason").selectOption({ label: "Text, numbers or handles" });
  await secondCard.getByRole("button", { name: "Reject" }).click();
  await expect(cards).toHaveCount(2);
  const mainCard = cards.filter({ hasText: "Photo 1" });
  await mainCard.getByRole("button", { name: "Approve" }).click();
  await expect(cards).toHaveCount(1);
  await cards.getByRole("button", { name: "Approve" }).click();
  await expect(cards).toHaveCount(0);

  const admin = adminClient();
  const { data: rows } = await admin
    .from("profile_photos")
    .select("id, status, rejection_reason, reviewed_by")
    .in("id", [main, second, third]);
  const byId = Object.fromEntries((rows ?? []).map((r) => [r.id, r]));
  expect(byId[main]).toMatchObject({ status: "APPROVED", reviewed_by: staff.id });
  expect(byId[second]).toMatchObject({ status: "REJECTED", rejection_reason: "TEXT_OR_CONTACT" });
  expect(byId[third].status).toBe("APPROVED");

  const { data: audit } = await admin
    .from("audit_logs")
    .select("action, entity_id, metadata")
    .eq("actor_id", staff.id)
    .order("created_at");
  expect((audit ?? []).map((a) => [a.action, a.entity_id])).toEqual([
    ["PHOTO_REJECTED", second],
    ["PHOTO_APPROVED", main],
    ["PHOTO_APPROVED", third],
  ]);
  expect(JSON.stringify(audit)).not.toContain(".webp");

  // The member sees the outcome, with neutral wording for the rejection.
  await memberPage.reload();
  await expect(memberPage.getByText("Approved", { exact: true })).toHaveCount(2);
  await memberPage.getByRole("button", { name: /^Photo 2, not approved/ }).click();
  await expect(
    memberPage.getByText("Photos can’t include text, phone numbers, prices or social handles."),
  ).toBeVisible();
  await memberPage.getByRole("button", { name: "Cancel" }).click();
  // Two usable photos left: the step is no longer complete.
  await expect(memberPage.getByRole("button", { name: "Continue" })).toBeDisabled();
  expect(errors).toEqual([]);
});

test("§21 verification queue: each selfie view is audited; checklist, reject with reason, approve; ACTIVE with 3 approved photos", async ({
  page,
  browser,
}) => {
  const errors = trackPageErrors(page);
  const memberPage = await browser.newPage({ extraHTTPHeaders: { "x-vercel-ip-country": "LR" } });
  const name = `Verify ${Math.random().toString(36).slice(2, 6)}`;
  const { userId } = await memberAtPhotos(memberPage, name);
  const photoIds = await seedPendingPhotos(userId, PHOTO_FIXTURES.slice(0, 3));
  const first = await seedPendingVerification(userId);
  const admin = adminClient();

  const staff = await createStaff();
  await staffSignInViaUi(page, staff);
  await expect(page.getByTestId("verifications-pending")).not.toHaveText("0");
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Verification" }).click();
  await expect(page.getByRole("heading", { name: "Verification queue" })).toBeVisible();

  // Listing the queue is not a selfie view.
  const views = async (id: string) =>
    (
      await admin
        .from("audit_logs")
        .select("id")
        .eq("action", "SELFIE_VIEWED")
        .eq("entity_id", id)
        .eq("actor_id", staff.id)
    ).data?.length ?? 0;
  expect(await views(first)).toBe(0);

  await page
    .getByRole("navigation", { name: "Submissions" })
    .getByRole("link", { name: new RegExp(name) })
    .click();
  await expect(page.getByRole("heading", { name: new RegExp(`^${name}, \\d+$`) })).toBeVisible();
  await expect(page.getByRole("img", { name: "Verification selfie" })).toBeVisible();
  await expect(page.getByRole("img", { name: /^Profile photo/ })).toHaveCount(3);
  expect(await views(first)).toBe(1);
  const selfieSrc = await page.getByRole("img", { name: "Verification selfie" }).getAttribute("src");
  expect(selfieSrc).toMatch(/\/storage\/v1\/object\/sign\/verification\/.+\?token=/);
  await page.screenshot({ path: `${SHOTS_P4}/admin-verification-queue.png` });

  // Approve needs every check; reject needs a reason.
  await expect(page.getByRole("button", { name: "Approve" })).toBeDisabled();
  await page.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Choose a reason to reject." })).toBeVisible();
  await page.getByLabel("Rejection reason").selectOption({ label: "Pose doesn’t match the prompt" });
  await page.getByRole("button", { name: "Reject" }).click();
  await expect(page).toHaveURL(/\/admin\/verification$/);

  const { data: audit } = await admin
    .from("audit_logs")
    .select("action, metadata")
    .eq("entity_id", first)
    .eq("action", "VERIFICATION_REJECTED");
  expect(audit?.[0]?.metadata).toMatchObject({ reason: "POSE_NOT_MATCHING", user_id: userId });

  // The member sees a neutral reason and a new pose.
  await memberPage.goto("/onboarding");
  await expect(memberPage).toHaveURL(/\/onboarding\/verify$/);
  await expect(memberPage.getByText("The pose didn’t match the instruction.")).toBeVisible();

  // Second selfie: approved. Photos approved → ACTIVE (BR-13).
  const second = await seedPendingVerification(userId);
  await page.goto(`/admin/verification?id=${second}`);
  for (const check of [
    "Pose matches the prompt",
    "Same person as the profile photos",
    "Clearly appears 18 or older",
    "No signs of a photo of a screen or printout",
  ]) {
    await page.getByLabel(check).check();
  }
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page).toHaveURL(/\/admin\/verification$/);
  expect((await admin.from("users").select("status").eq("id", userId).single()).data?.status).toBe("PENDING");

  await page.goto("/admin/photos");
  for (let i = 0; i < photoIds.length; i += 1) {
    await page.getByRole("article").filter({ hasText: name }).first().getByRole("button", { name: "Approve" }).click();
  }
  await expect(page.getByRole("article").filter({ hasText: name })).toHaveCount(0);
  await expect
    .poll(async () => (await admin.from("users").select("status").eq("id", userId).single()).data?.status)
    .toBe("ACTIVE");

  // The Under review screen sends a member who just went live to Home.
  await memberPage.goto("/onboarding/review");
  await expect(memberPage).toHaveURL(/\/home$/);
  // BR-14: verification status is shown as a badge.
  await expect(memberPage.getByText("Verified", { exact: true })).toBeVisible();
  await memberPage.screenshot({ path: `${SHOTS_P4}/member-home-verified.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("OD-6: the selfie retention job needs the cron secret and deletes only expired selfies", async ({ request }) => {
  expect((await request.get("/api/cron/selfie-retention")).status()).toBe(401);
  expect(
    (
      await request.get("/api/cron/selfie-retention", { headers: { authorization: "Bearer wrong-secret-value" } })
    ).status(),
  ).toBe(401);

  const phone = randomLiberianPhone();
  const userId = await createMember(phone.e164);
  const admin = adminClient();
  // A verification decided 200 days ago, with its image still stored.
  const id = crypto.randomUUID();
  const path = `${id}.webp`;
  const image = await sharp(PHOTO_FIXTURES[0]).webp().toBuffer();
  expect(
    (await admin.storage.from("verification").upload(path, image, { contentType: "image/webp" })).error,
  ).toBeNull();
  const decidedAt = new Date(Date.now() - 200 * 86_400_000).toISOString();
  expect(
    (
      await admin.from("verifications").insert({
        id,
        user_id: userId,
        pose_prompt: "Touch your chin with one finger",
        status: "REJECTED",
        rejection_reason: "UNCLEAR",
        selfie_storage_path: path,
        submitted_at: decidedAt,
        reviewed_at: decidedAt,
      })
    ).error,
  ).toBeNull();
  const row = { id };

  const res = await request.get("/api/cron/selfie-retention", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(res.status()).toBe(200);
  expect((await res.json()).deleted).toBeGreaterThanOrEqual(1);
  const { data: after } = await admin
    .from("verifications")
    .select("selfie_storage_path, selfie_deleted_at, status")
    .eq("id", row!.id)
    .single();
  expect(after).toMatchObject({ selfie_storage_path: null, status: "REJECTED" });
  expect(after?.selfie_deleted_at).not.toBeNull();
  expect((await admin.storage.from("verification").list("", { search: row!.id })).data ?? []).toHaveLength(0);
});
