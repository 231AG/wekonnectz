import { expect, test } from "@playwright/test";

import { loginViaUi } from "./auth-helpers";
import { SHOTS_P8, trackPageErrors } from "./helpers";
import { activeMember, givePassViaCard } from "./member-helpers";

test.use({ extraHTTPHeaders: { "x-vercel-ip-country": "LR" } });

const IMG = (f: string) => `docs/mockups/html/images/${f}`;
const local = (d: Date) => d.toISOString().slice(0, 16);
const clock = (d: Date) => d.toISOString().slice(11, 16);

test("§12: go available now, pause, schedule, choose who can send requests, leave the pool (BR-17, BR-18)", async ({
  page,
  request,
}) => {
  const errors = trackPageErrors(page);
  const member = await activeMember("Musu", [IMG("musu1.jpg"), IMG("musu2.jpg"), IMG("musu3.jpg")], {
    gender: "WOMAN",
  });
  await loginViaUi(page, member.phone);
  await expect(page).toHaveURL(/\/home$/);

  // BR-17: no pass, no window.
  await page.goto("/casual/availability");
  await expect(page.getByTestId("availability-blocked")).toContainText("You need an active pass to go available.");
  await expect(page.getByRole("button", { name: "Go available" })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS_P8}/member-availability-no-pass.png`, fullPage: true });

  await givePassViaCard(request, member.userId);
  await page.goto("/home");
  await expect(page.getByTestId("home-availability")).toContainText("You’re not available");
  await page.getByTestId("home-availability").click();
  await expect(page).toHaveURL(/\/casual\/availability$/);
  await expect(page.getByRole("button", { name: "Available now" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Longest window: 12 hours.")).toBeVisible();

  // OD-8 (DEV-ONLY 12 hours): a longer window is refused with a clear message.
  await page.getByLabel("Until").fill(clock(new Date(Date.now() + 14 * 3_600_000)));
  await page.getByRole("button", { name: "Go available" }).click();
  await expect(page.getByText("That window is longer than allowed. Choose an earlier end time.")).toBeVisible();

  await page.getByLabel("Until").fill(clock(new Date(Date.now() + 3 * 3_600_000)));
  await page.getByRole("button", { name: "Go available" }).click();
  await expect(page.getByTestId("availability-status")).toContainText("You’re available until");
  await page.screenshot({ path: `${SHOTS_P8}/member-availability-now.png`, fullPage: true });

  await page.goto("/home");
  await expect(page.getByTestId("home-availability")).toContainText("Available until");
  await expect(page.getByTestId("home-availability")).toContainText("You’re in the Available Now pool");
  await page.screenshot({ path: `${SHOTS_P8}/member-home-available.png`, fullPage: true });

  // Pause keeps the window; resume puts the member back.
  await page.goto("/casual/availability");
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByTestId("availability-status")).toContainText("Paused — you’re hidden from the pool");
  await page.screenshot({ path: `${SHOTS_P8}/member-availability-paused.png`, fullPage: true });
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByTestId("availability-status")).toContainText("You’re available until");

  // §13: with Nobody, the member is hidden from the pool even inside a live window.
  await page.getByRole("button", { name: "Nobody" }).click();
  await expect(page.getByTestId("availability-status")).toContainText("with Nobody you’re hidden from the pool");
  await page.goto("/home");
  await expect(page.getByTestId("home-availability")).toContainText("Not in the pool right now");
  await page.goto("/casual/availability");
  await page.getByRole("button", { name: "Anyone in the pool" }).click();
  await expect(page.getByTestId("availability-status")).toContainText("You’re available until");

  // Schedule replaces the current window (one active-or-scheduled window).
  await page.getByRole("button", { name: "Schedule" }).click();
  await page.getByLabel("From").fill(local(new Date(Date.now() + 2 * 3_600_000)));
  await page.getByLabel("Until").fill(local(new Date(Date.now() + 5 * 3_600_000)));
  await page.getByRole("button", { name: "Save schedule" }).click();
  await expect(page.getByTestId("availability-status")).toContainText("Scheduled:");
  await page.screenshot({ path: `${SHOTS_P8}/member-availability-schedule.png`, fullPage: true });

  // Who can send you requests.
  await page.getByRole("button", { name: "Nobody" }).click();
  await expect(page.getByRole("button", { name: "Nobody" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("With Nobody, you don’t appear in Available Now")).toBeVisible();
  await page.getByRole("button", { name: "Anyone in the pool" }).click();
  await expect(page.getByRole("button", { name: "Anyone in the pool" })).toHaveAttribute("aria-pressed", "true");

  // BR-18: leave at any time.
  await page.getByRole("button", { name: "Leave the pool" }).click();
  await expect(page.getByTestId("availability-status")).toHaveCount(0);
  await page.getByRole("button", { name: "Available now" }).click();
  await expect(page.getByRole("button", { name: "Go available" })).toBeVisible();
  expect(errors).toEqual([]);
});
