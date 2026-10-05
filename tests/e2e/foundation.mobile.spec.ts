import { expect, test } from "@playwright/test";

import { SHOTS, trackPageErrors } from "./helpers";

test("home placeholder renders with brand, no console or CSP errors", async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Meet with intention." })).toBeVisible();
  await expect(page.getByRole("img", { name: "WeKonnectz" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/foundation-home-placeholder.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("security headers required by §22 are present", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["permissions-policy"]).toContain("geolocation=()");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("UI kit: tokens and primitives render; every control is at least 44px", async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto("/ui-kit");
  await expect(page.getByRole("heading", { name: /UI kit/ })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Sign-up progress" })).toHaveAttribute(
    "aria-valuetext",
    "Step 1 of 8",
  );
  await expect(page.getByRole("radiogroup", { name: "I am" }).getByRole("radio", { name: "Woman" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();

  // Every interactive element on the page, not just those inside <main>.
  const controls = page.locator("button:visible, a:visible, input:visible, select:visible, textarea:visible");
  const count = await controls.count();
  expect(count).toBeGreaterThan(10);
  for (let i = 0; i < count; i += 1) {
    const box = await controls.nth(i).boundingBox();
    expect(box, `control ${i} has a box`).not.toBeNull();
    expect(box!.height, `control ${i} height`).toBeGreaterThanOrEqual(44);
    expect(box!.width, `control ${i} width`).toBeGreaterThanOrEqual(44);
  }

  await page.screenshot({ path: `${SHOTS}/foundation-ui-kit.png` });
  // Full page with the sticky nav un-stuck so it doesn't land mid-image.
  await page.screenshot({
    path: `${SHOTS}/foundation-ui-kit-full.png`,
    fullPage: true,
    style: "[data-sticky-nav]{position:static!important}",
  });
  expect(errors).toEqual([]);
});

test("keyboard focus is visible on the primary button", async ({ page }) => {
  await page.goto("/ui-kit");
  const button = page.getByRole("button", { name: "Continue" });
  for (let i = 0; i < 30 && !(await button.evaluate((el) => el === document.activeElement)); i += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(button).toBeFocused();
  const outline = await button.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe("none");
});
