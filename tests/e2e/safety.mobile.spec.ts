import { expect, test } from "@playwright/test";

import { adminClient, loginViaUi } from "./auth-helpers";
import { SHOTS_P5, trackPageErrors } from "./helpers";
import { activeMember } from "./member-helpers";

test.use({ extraHTTPHeaders: { "x-vercel-ip-country": "LR" } });

const IMG = (f: string) => `docs/mockups/html/images/${f}`;

test("§17 / BR-24: report and block a member from their profile; blocks are silent and hide both ways", async ({
  page,
}) => {
  const errors = trackPageErrors(page);
  const viewer = await activeMember("Musu", [IMG("musu1.jpg"), IMG("musu2.jpg"), IMG("musu3.jpg")]);
  const prince = await activeMember("Prince", [IMG("prince.jpg"), IMG("joseph.jpg"), IMG("varney.jpg")]);
  const admin = adminClient();

  await loginViaUi(page, viewer.phone);
  await expect(page).toHaveURL(/\/home$/);
  await page.goto(`/m/${prince.userId}`);
  await expect(page.getByRole("heading", { name: /Prince, \d+/ })).toBeVisible();
  // BR-14: the verified badge; the profile never shows a storage path.
  await expect(page.getByRole("img", { name: "Verified" })).toBeVisible();
  await expect(page.getByText("Congo Town")).toBeVisible();
  expect(await page.content()).not.toMatch(new RegExp(`${prince.photoIds[0]}\\.webp(?!\\?token)`));
  await expect(page.getByRole("img", { name: "Prince’s main photo" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P5}/member-profile-view.png`, fullPage: true });

  // Report: two taps to reach it (flag → category).
  await page.getByRole("button", { name: "Report Prince" }).click();
  await expect(page.getByRole("dialog", { name: "Report Prince" })).toBeVisible();
  await page.getByLabel("Asking for money or a scam").check();
  await page.getByLabel("Details (optional)").fill("Asked me for transport money.");
  await page.screenshot({ path: `${SHOTS_P5}/member-report-sheet.png` });
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByRole("dialog", { name: "Thanks for telling us" })).toBeVisible();
  const { data: reports } = await admin
    .from("reports")
    .select("category, priority, status, description")
    .eq("reported_user_id", prince.userId);
  expect(reports).toEqual([
    { category: "MONEY_SCAM", priority: "HIGH", status: "OPEN", description: "Asked me for transport money." },
  ]);

  // Then block, from the same sheet.
  await page.getByRole("button", { name: "Also block Prince" }).click();
  await expect(page.getByRole("dialog", { name: "Block Prince?" })).toBeVisible();
  await expect(page.getByText("They won’t be told.")).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P5}/member-block-sheet.png` });
  await page.getByRole("button", { name: "Block", exact: true }).click();
  await expect(page).toHaveURL(/\/home\?blocked=1$/);
  await expect(page.getByRole("status")).toHaveText("Blocked. They won’t be told.");

  // BR-24: gone for the blocker, and the blocked member can't see the blocker either.
  const res = await page.goto(`/m/${prince.userId}`);
  expect(res?.status()).toBe(404);
  const { data: reverse } = await admin.rpc("member_profile_for_viewer", {
    p_viewer: prince.userId,
    p_owner: viewer.userId,
  });
  expect(reverse).toBeNull();
  // Silent: Prince has no notification about it.
  const { data: notes } = await admin.from("notifications").select("type").eq("user_id", prince.userId);
  expect((notes ?? []).map((n) => n.type)).not.toContain("BLOCKED");

  await page.goto("/account/blocked");
  await expect(page.getByText("Prince")).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P5}/member-blocked-list.png`, fullPage: true });
  await page.getByRole("button", { name: "Unblock" }).click();
  await expect(page.getByText("You haven’t blocked anyone.")).toBeVisible();
  await page.goto(`/m/${prince.userId}`);
  await expect(page.getByRole("heading", { name: /Prince, \d+/ })).toBeVisible();

  expect(errors.filter((e) => !e.includes(`/m/${prince.userId}`))).toEqual([]);
});

test("BR-32: an under-18 report removes the member from view at once; an inappropriate-photo report hides that photo", async ({
  page,
}) => {
  const viewer = await activeMember("Hawa", [IMG("musu1.jpg"), IMG("musu2.jpg"), IMG("musu3.jpg")]);
  const joseph = await activeMember("Joseph", [IMG("joseph.jpg"), IMG("varney.jpg"), IMG("emmanuel.jpg")]);
  const varney = await activeMember("Varney", [IMG("varney.jpg"), IMG("prince.jpg"), IMG("emmanuel.jpg")]);
  const admin = adminClient();
  await loginViaUi(page, viewer.phone);
  await expect(page).toHaveURL(/\/home$/);

  await page.goto(`/m/${joseph.userId}`);
  await page.getByRole("button", { name: "Report Joseph" }).click();
  await page.getByLabel("They look under 18").check();
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByRole("dialog", { name: "Thanks for telling us" })).toBeVisible();
  const { data: hidden } = await admin.from("users").select("hidden_reason, status").eq("id", joseph.userId).single();
  expect(hidden).toEqual({ hidden_reason: "UNDER_18_REPORT", status: "ACTIVE" });
  expect((await page.goto(`/m/${joseph.userId}`))?.status()).toBe(404);

  await page.goto(`/m/${varney.userId}`);
  await page.getByRole("button", { name: "Report Varney" }).click();
  await page.getByLabel("Inappropriate photo").check();
  // The photo must be chosen before the report can name it.
  await page.getByRole("radio", { name: "Photo 2" }).check();
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByRole("dialog", { name: "Thanks for telling us" })).toBeVisible();
  const { data: photo } = await admin.from("profile_photos").select("status").eq("id", varney.photoIds[1]).single();
  expect(photo?.status).toBe("HIDDEN");
  await page.goto(`/m/${varney.userId}`);
  await expect(page.getByRole("img", { name: /Varney’s/ })).toHaveCount(2);
});
