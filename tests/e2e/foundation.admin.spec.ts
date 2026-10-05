import { expect, test } from "@playwright/test";

import { SHOTS, trackPageErrors } from "./helpers";

test("admin shell skeleton: moderator does not see Payments or Settings (§7, Q9)", async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto("/ui-kit/admin");
  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Reports" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Payments" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/foundation-admin-shell.png` });
  expect(errors).toEqual([]);
});
