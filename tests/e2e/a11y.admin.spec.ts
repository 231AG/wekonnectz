import { test } from "@playwright/test";

import { expectAccessible } from "./a11y";
import { createStaff, staffSignInViaUi } from "./staff-helpers";

const ADMIN_PAGES = [
  "/admin",
  "/admin/verification",
  "/admin/photos",
  "/admin/payments",
  "/admin/reports",
  "/admin/flags",
  "/admin/users",
  "/admin/subscriptions",
  "/admin/transactions",
  "/admin/analytics",
  "/admin/audit",
  "/admin/settings",
  "/admin/staff",
  "/admin/account",
];

test("WCAG 2.1 AA: staff sign-in and console pages have no axe violations", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/admin/login");
  await expectAccessible(page, "/admin/login");
  const staff = await createStaff("SUPER_ADMIN");
  await staffSignInViaUi(page, staff, () => expectAccessible(page, "/admin/mfa"));
  for (const path of ADMIN_PAGES) {
    await test.step(path, async () => {
      await page.goto(path);
      await expectAccessible(page, path);
    });
  }
});
