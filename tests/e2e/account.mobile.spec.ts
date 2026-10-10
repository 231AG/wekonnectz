import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { adminClient, loginViaUi } from "./auth-helpers";
import { SHOTS_P10, trackPageErrors } from "./helpers";
import { activeMember, givePassViaCard } from "./member-helpers";

test.use({ extraHTTPHeaders: { "x-vercel-ip-country": "LR" } });

const IMG = (f: string) => `docs/mockups/html/images/${f}`;

test("§8, §22: a member downloads their data, then deletes their account — card plan stopped, hidden at once (BR-7)", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const errors = trackPageErrors(page);
  const admin = adminClient();
  const musu = await activeMember("Musu", [IMG("musu1.jpg"), IMG("musu2.jpg"), IMG("musu3.jpg")], { gender: "WOMAN" });
  const pass = await givePassViaCard(request, musu.userId);

  await loginViaUi(page, musu.phone);
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/me");
  await page.screenshot({ path: `${SHOTS_P10}/member-me.png`, fullPage: true });

  await page.getByRole("link", { name: "Verification" }).click();
  await expect(page.getByTestId("verification-status")).toContainText("You’re verified");
  await page.screenshot({ path: `${SHOTS_P10}/member-verification.png`, fullPage: true });

  await page.goto("/account/privacy");
  await page.getByRole("button", { name: "Nobody" }).click();
  await expect(page.getByRole("button", { name: "Nobody" })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: `${SHOTS_P10}/member-privacy.png`, fullPage: true });

  await page.goto("/account/settings");
  await page.screenshot({ path: `${SHOTS_P10}/member-settings.png`, fullPage: true });

  // Data export: the member's own data, no storage paths, no phone in a URL.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: /Download my data/ }).click(),
  ]);
  const json = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(json.profile.display_name).toBe("Musu");
  expect(json.photos).toHaveLength(3);
  expect(json.subscriptions.length).toBeGreaterThan(0);
  expect(JSON.stringify(json)).not.toMatch(/storage_path|\.webp/);

  // Delete: typed confirmation; the card plan is cancelled at the processor first.
  await page.getByRole("link", { name: "Delete account" }).click();
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByText("Type DELETE to confirm.", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P10}/member-delete-account.png`, fullPage: true });
  await page.getByLabel("Type DELETE to confirm").fill("delete");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/goodbye$/);
  await expect(page.getByRole("heading", { name: "Your account is deleted" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P10}/member-goodbye.png`, fullPage: true });

  const { data: user } = await admin.from("users").select("status, deleted_at").eq("id", musu.userId).single();
  expect(user!.status).toBe("DELETED");
  const { data: sub } = await admin
    .from("subscriptions")
    .select("cancel_at_period_end")
    .eq("processor_subscription_id", pass.subscriptionRef)
    .single();
  expect(sub!.cancel_at_period_end).toBe(true);

  // BR-7: the session is gone and the account can't come back in.
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login/);
  expect(errors).toEqual([]);
});
