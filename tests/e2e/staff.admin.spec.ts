import { expect, test } from "@playwright/test";

import { adminClient, createMember, randomLiberianPhone } from "./auth-helpers";
import { SHOTS_P3, trackPageErrors } from "./helpers";
import { memberAtPhotos, PHOTO_FIXTURES } from "./member-helpers";
import { createStaff, seedPendingPhotos, staffClientAal1, staffSignInViaUi, totp } from "./staff-helpers";

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
