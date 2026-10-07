import sharp from "sharp";
import { expect, test } from "@playwright/test";

import { adminClient } from "./auth-helpers";
import { SHOTS_P4, trackPageErrors } from "./helpers";
import { memberAtPhotos, PHOTO_FIXTURES } from "./member-helpers";
import { seedPendingPhotos } from "./staff-helpers";

test.use({ extraHTTPHeaders: { "x-vercel-ip-country": "LR" } });

test("§9 / §10 steps 10–11: a member takes an in-app selfie with the server's pose and waits for review", async ({
  page,
}) => {
  const errors = trackPageErrors(page);
  const { userId, phone } = await memberAtPhotos(page);
  await seedPendingPhotos(userId, PHOTO_FIXTURES.slice(0, 3));

  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/onboarding\/verify$/);
  await expect(page.getByRole("heading", { name: "Verify it’s you" })).toBeVisible();

  // The pose comes from the server's list and survives a reload (no re-rolling).
  const { data: poses } = await adminClient().rpc("get_setting", { p_key: "verification.pose_prompts" });
  const pose = (await page.getByTestId("pose-prompt").textContent())!.trim();
  expect(poses as string[]).toContain(pose);
  await page.reload();
  await expect(page.getByTestId("pose-prompt")).toHaveText(pose);

  // Camera only: no file input anywhere on the page (spec §9: not a gallery upload).
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Take selfie" })).toBeEnabled({ timeout: 15_000 });
  await page.screenshot({ path: `${SHOTS_P4}/onboarding-verification-selfie.png`, fullPage: true });

  await page.getByRole("button", { name: "Take selfie" }).click();
  await expect(page.getByRole("img", { name: "Your selfie" })).toBeVisible();
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page).toHaveURL(/\/onboarding\/review$/, { timeout: 30_000 });

  await expect(page.getByRole("heading", { name: "We’re reviewing your profile" })).toBeVisible();
  await expect(page.getByText("Usually done within 24 hours.")).toBeVisible();
  await expect(page.getByText(`+231 ${phone.national.slice(0, 2)} • • • • ${phone.national.slice(-3)}`)).toBeVisible();
  await expect(page.getByText("0 approved · 3 in review")).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P4}/onboarding-under-review.png`, fullPage: true });

  // Stored privately, processed (WebP, no metadata); the member's pages never reference it (BR-10).
  const admin = adminClient();
  const { data: rows } = await admin
    .from("verifications")
    .select("id, status, selfie_storage_path, pose_prompt")
    .eq("user_id", userId);
  expect(rows).toHaveLength(1);
  expect(rows![0]).toMatchObject({ status: "PENDING", pose_prompt: pose, selfie_storage_path: `${rows![0].id}.webp` });
  const { data: file } = await admin.storage.from("verification").download(rows![0].selfie_storage_path!);
  const meta = await sharp(Buffer.from(await file!.arrayBuffer())).metadata();
  expect(meta.format).toBe("webp");
  expect(meta.exif).toBeUndefined();
  expect(await page.content()).not.toContain("/verification/");
  const { data: quarantine } = await admin.storage.from("photos-quarantine").list(userId);
  expect(quarantine ?? []).toHaveLength(0);

  // Resuming lands on the review screen; the selfie step can't be redone while one is waiting.
  await page.goto("/onboarding/verify");
  await expect(page).toHaveURL(/\/onboarding\/review$/);

  // "Edit profile while you wait" (§10 step 11).
  await page.getByRole("button", { name: "Edit profile while you wait" }).click();
  await page.getByRole("link", { name: "Photos" }).click();
  await expect(page).toHaveURL(/\/onboarding\/photos$/);

  // Log out while waiting.
  await page.goto("/onboarding/review");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});
