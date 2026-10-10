import { expect, test, type Browser } from "@playwright/test";

import { adminClient, loginViaUi } from "./auth-helpers";
import { SHOTS_P7, trackPageErrors } from "./helpers";
import { activeMember } from "./member-helpers";
import { createStaff, seedClaim, staffSignInViaUi } from "./staff-helpers";

const IMG = (f: string) => `docs/mockups/html/images/${f}`;
const ref = (id: string) => `Account #${id.replace(/-/g, "").slice(0, 4).toUpperCase()}`;

async function memberPage(browser: Browser, phone: { national: string; e164: string }) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    extraHTTPHeaders: { "x-vercel-ip-country": "LR" },
  });
  const p = await ctx.newPage();
  await loginViaUi(p, phone);
  await expect(p).toHaveURL(/\/home$/);
  return { ctx, page: p };
}

test("§16 / §21: an admin verifies a claim against the wallet records and approves it — the only way access starts", async ({
  page,
  browser,
}) => {
  const errors = trackPageErrors(page);
  const admin = adminClient();
  const member = await activeMember("Fatu", [IMG("musu1.jpg"), IMG("musu2.jpg"), IMG("musu3.jpg")], {
    gender: "WOMAN",
  });
  const first = await seedClaim(member.userId, member.phone.e164, "MM_7DAY", "ORANGE_MONEY");
  const second = await seedClaim(member.userId, member.phone.e164, "MM_DAY", "MTN_MOMO");

  const staff = await createStaff("ADMIN");
  await staffSignInViaUi(page, staff);
  await expect(page.getByTestId("claims-pending")).not.toHaveText("0");
  await page.goto(`/admin/payments?id=${first.claimId}`);
  const panel = page.getByRole("region", { name: "Claim" });
  await expect(panel.getByText(first.txn)).toBeVisible();
  await expect(panel.getByText(ref(member.userId)).first()).toBeVisible();

  // BR-38: the checks are required, and the screenshot must be opened first.
  await panel.getByRole("button", { name: "Approve and start the pass" }).click();
  await expect(panel.getByRole("alert").filter({ hasText: "Tick every check" })).toBeVisible();
  for (const label of [
    /merchant wallet’s own records/,
    /exactly the plan price/,
    /sender number matches/,
    /date and time match/,
  ]) {
    await panel.getByLabel(label).check();
  }
  await panel.getByLabel("Amount in the wallet record (USD)").fill("5.00");
  await panel.getByRole("button", { name: "Approve and start the pass" }).click();
  await expect(panel.getByRole("alert").filter({ hasText: "Open the screenshot" })).toBeVisible();
  await panel.getByRole("button", { name: "Show screenshot" }).click();
  await expect(panel.getByRole("img", { name: "Payment screenshot" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P7}/admin-claims-queue.png` });
  for (const label of [
    /merchant wallet’s own records/,
    /exactly the plan price/,
    /sender number matches/,
    /date and time match/,
  ]) {
    await panel.getByLabel(label).check();
  }
  await panel.getByLabel("Amount in the wallet record (USD)").fill("5.00");
  await panel.getByRole("button", { name: "Approve and start the pass" }).click();
  await expect(panel.getByRole("status").filter({ hasText: "This claim is approved." })).toBeVisible();

  const { data: access } = await admin.rpc("has_casual_access", { p_user: member.userId });
  expect(access).toBe(true);
  const { data: views } = await admin
    .from("audit_logs")
    .select("action, actor_id")
    .eq("entity_id", first.claimId)
    .in("action", ["EVIDENCE_VIEWED", "PAYMENT_CLAIM_APPROVED"]);
  expect(views?.map((v) => v.action).sort()).toEqual(["EVIDENCE_VIEWED", "PAYMENT_CLAIM_APPROVED"]);
  expect(views?.every((v) => v.actor_id === staff.id)).toBe(true);

  // The second claim: ask for more information.
  await page.goto(`/admin/payments?id=${second.claimId}`);
  await panel.getByLabel("Ask the member (they see this)").fill("Please send a screenshot showing the transaction ID.");
  await panel.getByRole("button", { name: "Ask for more information" }).click();
  await expect(panel.getByRole("status").filter({ hasText: "Waiting for the member to answer" })).toBeVisible();

  // The member sees both outcomes, answers the question.
  const m = await memberPage(browser, member.phone);
  await m.page.goto("/me/payments");
  await expect(m.page.getByTestId("access-summary")).toContainText("Casual access is active");
  await expect(m.page.getByText("Please send a screenshot showing the transaction ID.")).toBeVisible();
  await expect(m.page.getByTestId("claim").filter({ hasText: first.txn })).toContainText("Approved");
  await m.page.screenshot({ path: `${SHOTS_P7}/member-claim-status-needs-info.png`, fullPage: true });
  await m.page.getByLabel("Your answer").fill("The ID is in the confirmation SMS; screenshot attached earlier.");
  await m.page.getByRole("button", { name: "Send answer" }).click();
  // The claim goes back to review (the page re-renders without the question).
  await expect(m.page.getByTestId("claim").filter({ hasText: second.txn })).toContainText("Checking");

  // OD-17: a wrong amount is rejected; the member reads a neutral reason.
  await page.goto(`/admin/payments?id=${second.claimId}`);
  await expect(panel.getByText("The ID is in the confirmation SMS; screenshot attached earlier.")).toBeVisible();
  await panel.getByLabel("Rejection reason").first().selectOption("AMOUNT_MISMATCH");
  await panel.getByRole("button", { name: "Reject" }).first().click();
  await expect(panel.getByRole("status").filter({ hasText: "This claim is rejected." })).toBeVisible();

  await m.page.reload();
  await expect(m.page.getByTestId("claim").filter({ hasText: second.txn })).toContainText("Not approved");
  await expect(m.page.getByText(/We’ll refund it to the number you paid from/)).toBeVisible();
  await m.page.screenshot({ path: `${SHOTS_P7}/member-subscription-payments.png`, fullPage: true });
  await m.page.goto("/casual");
  await expect(m.page.getByTestId("pass-status")).toHaveText(/^(Your pass is active|Pass active · .+ left)$/); // Phase 9: eligible members see Available Now
  await m.ctx.close();
  expect(errors).toEqual([]);
});

test("§21 / Q9: moderators can't open the payment claims queue", async ({ page }) => {
  const moderator = await createStaff("MODERATOR");
  await staffSignInViaUi(page, moderator);
  await expect(page.getByRole("link", { name: "Payments" })).toHaveCount(0);
  await page.goto("/admin/payments");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId("claims-pending")).toHaveCount(0);
});
