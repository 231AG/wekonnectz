import { expect, test } from "@playwright/test";

import { adminClient } from "./auth-helpers";
import { SHOTS_P10, trackPageErrors } from "./helpers";
import { activeMember, givePassViaCard } from "./member-helpers";
import { createStaff, seedClaim, staffClientAal2, staffSignInViaUi, type TestStaff } from "./staff-helpers";

const IMG = (f: string) => `docs/mockups/html/images/${f}`;

test("§21: an admin sees figures, finds a member, extends a subscription, records a refund, changes a setting — all audited (BR-34)", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const errors = trackPageErrors(page);
  const admin = adminClient();
  const musu = await activeMember("Musu", [IMG("musu1.jpg"), IMG("musu2.jpg"), IMG("musu3.jpg")], { gender: "WOMAN" });
  const pass = await givePassViaCard(request, musu.userId);
  const hawa = await activeMember("Hawa", [IMG("musu2.jpg"), IMG("musu3.jpg"), IMG("musu1.jpg")], { gender: "WOMAN" });
  const staff = await createStaff("ADMIN");
  const secret = await staffSignInViaUi(page, staff);
  // Hawa's Day Pass comes the only way mobile money access can: an admin approves her claim.
  const claim = await seedClaim(hawa.userId, hawa.phone.e164, "MM_DAY", "ORANGE_MONEY");
  const { data: dayPlan } = await admin.from("subscription_plans").select("price").eq("code", "MM_DAY").single();
  const staffDb = await staffClientAal2(staff, secret);
  expect((await staffDb.rpc("log_evidence_view", { p_claim: claim.claimId })).error).toBeNull();
  expect(
    (await staffDb.rpc("approve_payment_claim", { p_claim: claim.claimId, p_wallet_amount: Number(dayPlan!.price) }))
      .error,
  ).toBeNull();
  await page.reload();

  // Dashboard (§21): members, access by plan, available now, revenue, queues.
  await expect(page.getByTestId("users-total")).toBeVisible();
  await expect(page.getByTestId("access-now")).not.toHaveText("0");
  await expect(page.getByTestId("revenue-30d")).toContainText("$");
  await page.screenshot({ path: `${SHOTS_P10}/admin-dashboard.png`, fullPage: true });

  // Users: search by name, open, then find by phone (posted; never in the URL).
  await page.getByRole("link", { name: "Users" }).click();
  await page.getByLabel("Name or account ID").fill("Musu");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/admin\/users\?q=Musu/);
  await page.screenshot({ path: `${SHOTS_P10}/admin-users.png`, fullPage: true });
  await page.getByLabel("Phone number").fill(musu.phone.national);
  await page.getByRole("button", { name: "Find by phone" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/users/${musu.userId}$`));
  expect(page.url()).not.toContain(musu.phone.national.replace(/\D/g, "").slice(-6));
  await expect(page.getByRole("heading", { name: /^Musu, \d+$/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Subscriptions" })).toContainText("Card");
  await page.screenshot({ path: `${SHOTS_P10}/admin-user-detail.png`, fullPage: true });

  // DOB correction: reason required, audited without the date.
  const dob = page.getByRole("form", { name: "Correct date of birth" });
  await dob.getByLabel("Corrected date of birth").fill("1996-05-20");
  await dob.getByLabel("Reason").fill("ID card checked, typo at signup");
  await dob.getByRole("button", { name: "Correct date of birth" }).click();
  await expect(dob.getByRole("status")).toHaveText("Date of birth corrected.");

  // Subscriptions: a card period belongs to the processor; a mobile money pass is extended with a
  // reason (OD-30 cap; audited).
  await page.getByRole("link", { name: "Subscriptions" }).first().click();
  const musuCard = page
    .getByRole("row")
    .filter({ hasText: "Musu" })
    .first()
    .getByRole("link", { name: /Weekly · Card/ });
  await musuCard.click();
  await expect(page.getByText("Card plans are extended at the card processor, not here.")).toBeVisible();
  const hawaPass = page
    .getByRole("row")
    .filter({ hasText: "Hawa" })
    .first()
    .getByRole("link", { name: /Day Pass/ });
  const hawaHref = (await hawaPass.getAttribute("href"))!;
  await hawaPass.click();
  await page.waitForURL((url) => url.href.endsWith(hawaHref));
  const extend = page.getByRole("form", { name: "Extend subscription" });
  await extend.getByLabel(/Days to add/).fill("2");
  await extend.getByLabel("Reason").fill("Outage compensation");
  await extend.getByRole("button", { name: "Extend" }).click();
  await expect(extend.getByRole("status")).toHaveText("Extended by 2 days.");
  await page.screenshot({ path: `${SHOTS_P10}/admin-subscriptions.png`, fullPage: true });

  // Payments & events: the charge, its history, the webhook log; record a refund.
  await page.getByRole("link", { name: "Payments & events" }).click();
  const { data: payment } = await admin
    .from("payments")
    .select("id")
    .eq("processor_subscription_ref", pass.subscriptionRef)
    .single();
  await page.goto(`/admin/transactions?id=${payment!.id}`);
  await expect(page.getByRole("region", { name: "Payment" })).toContainText("Card charge recorded");
  const refund = page.getByRole("form", { name: "Record refund" });
  await refund.getByLabel("Refund reason").fill("Charged twice by mistake");
  await expect(refund.getByLabel("The money has been sent back")).toHaveAttribute("required", "");
  await refund.getByLabel("The money has been sent back").check();
  await refund.getByRole("button", { name: "Record refund" }).click();
  await expect(refund.getByRole("status")).toHaveText("Refund recorded. The access it paid for has ended.");
  await page.reload();
  await expect(page.getByRole("region", { name: "Payment" })).toContainText("Status changed");
  await page.screenshot({ path: `${SHOTS_P10}/admin-payments-events.png`, fullPage: true });
  const { data: sub } = await admin
    .from("subscriptions")
    .select("status")
    .eq("processor_subscription_id", pass.subscriptionRef)
    .single();
  expect(sub!.status).toBe("REFUNDED");
  await page.getByRole("link", { name: "Card webhook log" }).click();
  await expect(page.getByRole("table", { name: "Card webhook log" })).toContainText("Valid");
  await page.screenshot({ path: `${SHOTS_P10}/admin-webhook-log.png`, fullPage: true });

  // Analytics.
  await page.getByRole("link", { name: "Analytics" }).click();
  await expect(page.getByRole("table", { name: "Daily figures" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P10}/admin-analytics.png`, fullPage: true });

  // Settings: a limit changes and is audited; system config is locked for an ADMIN (§7).
  await page.getByRole("link", { name: "Settings" }).click();
  const setting = page.getByTestId("setting-messages.max_per_minute");
  await setting.getByRole("spinbutton").fill("59");
  await setting.getByRole("button", { name: "Save" }).click();
  await expect(setting.getByRole("status")).toHaveText("Saved.");
  await expect(page.getByTestId("setting-geo.enforcement_mode")).toContainText("Only a super admin can change this.");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SHOTS_P10}/admin-settings.png`, fullPage: false });
  await page.getByRole("link", { name: "Plans & prices" }).click();
  await expect(page.getByRole("region", { name: "Day Pass · Mobile money", exact: true })).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P10}/admin-settings-plans.png`, fullPage: false });
  await admin.from("app_settings").update({ value: 60 }).eq("key", "messages.max_per_minute");

  // Audit log: every action above, with the actor.
  await page.getByRole("link", { name: "Audit logs" }).click();
  await page.getByLabel("Staff email").fill(staff.email);
  await page.getByRole("button", { name: "Filter" }).click();
  const log = page.getByRole("table", { name: "Audit log" });
  for (const action of ["Dob corrected", "Subscription modified", "Payment refunded", "Setting changed"]) {
    await expect(log.getByRole("cell", { name: action, exact: true })).toBeVisible();
  }
  await expect(log).not.toContainText("1996-05-20");
  await page.screenshot({ path: `${SHOTS_P10}/admin-audit-logs.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("§7: a super admin creates a moderator, who signs in with MFA and sees only moderation", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const errors = trackPageErrors(page);
  const boss = await createStaff("SUPER_ADMIN");
  await staffSignInViaUi(page, boss);
  await page.getByRole("link", { name: "Staff" }).click();
  const email = `mod-${Date.now()}@example.test`;
  const form = page.getByRole("form", { name: "Add staff" });
  await form.getByLabel("Work email").fill(email);
  await form.getByLabel("Role").selectOption("MODERATOR");
  await form.getByRole("button", { name: "Create account" }).click();
  const temp = (await page.getByTestId("temp-password").textContent())!.trim();
  expect(temp.length).toBeGreaterThanOrEqual(12);
  await expect(page.getByRole("table", { name: "Staff accounts" })).toContainText(email);
  await page.screenshot({ path: `${SHOTS_P10}/admin-staff.png`, fullPage: true });

  // The new moderator: password + authenticator, then queues only; admin screens refuse.
  const modPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const mod: TestStaff = { id: "", email, password: temp };
  await staffSignInViaUi(modPage, mod);
  await expect(modPage.getByTestId("users-total")).toHaveCount(0);
  await expect(modPage.getByRole("link", { name: "Settings" })).toHaveCount(0);
  await modPage.goto("/admin/settings");
  await expect(modPage).toHaveURL(/\/admin$/);
  // Changes the temporary password.
  await modPage.goto("/admin/account");
  await modPage.getByLabel("New password", { exact: true }).fill("Moderator-Pass-2026");
  await modPage.getByLabel("Repeat new password").fill("Moderator-Pass-2026");
  await modPage.getByRole("button", { name: "Change password" }).click();
  await expect(modPage.getByRole("status")).toHaveText("Password changed.");
  await modPage.close();

  // Promote, then turn off (audited); the account can't sign in any more.
  const row = page.getByRole("row").filter({ hasText: email });
  await page.reload();
  await row.getByLabel(`Role for ${email}`, { exact: true }).selectOption("ADMIN");
  await row.getByRole("button", { name: "Change role" }).click();
  await expect(row.getByRole("status")).toHaveText("Role changed.");
  await row.getByRole("button", { name: "Turn off" }).click();
  await expect(row.getByRole("status").filter({ hasText: "Account turned off." })).toBeVisible();
  const admin = adminClient();
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const created = list!.users.find((u) => u.email === email)!;
  const { data: row2 } = await admin.from("users").select("role, status").eq("id", created.id).single();
  expect(row2).toEqual({ role: "ADMIN", status: "BANNED" });
  const { count } = await admin
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("entity_id", created.id)
    .in("action", ["ADMIN_CREATED", "ROLE_CHANGED"]);
  expect(count).toBe(3);
  expect(errors).toEqual([]);
});
