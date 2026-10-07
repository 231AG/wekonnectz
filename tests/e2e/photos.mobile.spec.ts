import sharp from "sharp";
import { expect, test } from "@playwright/test";

import { adminClient, createMember, randomLiberianPhone, signInMemberViaApi } from "./auth-helpers";
import { SHOTS_P3, trackPageErrors } from "./helpers";
import { memberAtPhotos, PHOTO_FIXTURES, uploadPhotos } from "./member-helpers";

test.use({ extraHTTPHeaders: { "x-vercel-ip-country": "LR" } });

async function storedPhotos(userId: string) {
  const { data } = await adminClient()
    .from("profile_photos")
    .select("id, status, is_primary, storage_path, sort_order")
    .eq("user_id", userId)
    .neq("status", "DELETED")
    .order("sort_order");
  return data ?? [];
}

test("§11: a member uploads 3 photos; each is processed, stored privately and waits for review", async ({ page }) => {
  const errors = trackPageErrors(page);
  const { userId } = await memberAtPhotos(page);

  await expect(page.getByRole("heading", { name: "Add your photos" })).toBeVisible();
  await expect(page.getByText("0 of 3 required photos added.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();

  await uploadPhotos(page, PHOTO_FIXTURES.slice(0, 3));
  await expect(page.getByRole("button", { name: /^Photo 1, main photo, in review/ })).toBeVisible();
  await expect(page.getByText("In review")).toHaveCount(3);
  await page.screenshot({ path: `${SHOTS_P3}/onboarding-photos.png`, fullPage: true });

  // Stored as processed WebP in the private bucket, PENDING_REVIEW, first one is the main photo.
  const rows = await storedPhotos(userId);
  expect(rows.map((r) => r.status)).toEqual(["PENDING_REVIEW", "PENDING_REVIEW", "PENDING_REVIEW"]);
  expect(rows[0].is_primary).toBe(true);
  for (const r of rows) expect(r.storage_path).toBe(`${r.id}.webp`); // opaque: no user id in signed URLs

  // The page never contains a storage path, only signed URLs (spec §6 rule 5, BR-11).
  const html = await page.content();
  for (const r of rows) expect(html).not.toContain(`photos/${r.storage_path}"`);
  for (const src of await page
    .locator('img[src*="/storage/v1/"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("src")!))) {
    expect(src).toMatch(/\/storage\/v1\/object\/sign\/photos\/.+\?token=/);
  }

  // Quarantine is emptied once a file is processed.
  const { data: quarantine } = await adminClient().storage.from("photos-quarantine").list(userId);
  expect(quarantine ?? []).toHaveLength(0);

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/onboarding\/verify$/);
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/onboarding\/verify$/);

  // Log out from the last step available so far.
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});

test("BR-12: the stored file carries no EXIF or GPS, whatever the upload contained", async ({ page }) => {
  const { userId } = await memberAtPhotos(page);
  const withGps = await sharp("docs/mockups/html/images/varney.jpg")
    .withExif({ IFD0: { Make: "FictionalPhone" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "6/1 18/1 0/1" } })
    .jpeg()
    .toBuffer();
  await page.getByTestId("photo-input").setInputFiles({ name: "gps.jpg", mimeType: "image/jpeg", buffer: withGps });
  await expect(page.getByRole("button", { name: /^Photo 1/ })).toBeVisible({ timeout: 30_000 });

  const [row] = await storedPhotos(userId);
  const { data: file } = await adminClient().storage.from("photos").download(row.storage_path);
  const bytes = Buffer.from(await file!.arrayBuffer());
  const meta = await sharp(bytes).metadata();
  expect(meta.format).toBe("webp");
  expect(meta.exif).toBeUndefined();
  expect(bytes.toString("latin1")).not.toContain("FictionalPhone");
});

test("§4: a non-image renamed .jpg is refused and frees its slot", async ({ page }) => {
  const errors = trackPageErrors(page);
  const { userId } = await memberAtPhotos(page);
  await page.getByTestId("photo-input").setInputFiles({
    name: "holiday.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("This is a text file pretending to be a photo. ".repeat(50)),
  });
  await expect(page.getByRole("alert").filter({ hasText: "isn’t a photo we can use" })).toBeVisible({
    timeout: 30_000,
  });
  expect(await storedPhotos(userId)).toHaveLength(0);
  const { data } = await adminClient().from("profile_photos").select("id").eq("user_id", userId);
  expect(data ?? []).toHaveLength(0);
  // The quarantine bucket only accepts image types, so the text upload may be refused there already;
  // either way nothing is stored and no request failed in a way the member sees beyond the message.
  expect(errors.filter((e) => !e.includes("/storage/v1/object/upload/sign/"))).toEqual([]);
});

test("a member can choose the main photo and remove photos", async ({ page }) => {
  const { userId } = await memberAtPhotos(page);
  await uploadPhotos(page, PHOTO_FIXTURES.slice(0, 2));
  const [first, second] = await storedPhotos(userId);

  await page.getByRole("button", { name: /^Photo 2, in review/ }).click();
  await page.getByRole("button", { name: "Make main photo" }).click();
  await expect(page.getByRole("button", { name: /^Photo 1, main photo/ })).toBeVisible();
  expect((await storedPhotos(userId)).map((r) => r.id)).toEqual([second.id, first.id]);

  await page.getByRole("button", { name: /^Photo 1, main photo/ }).click();
  await page.getByRole("button", { name: "Remove photo" }).click();
  await expect(page.getByRole("button", { name: /^Photo \d/ })).toHaveCount(1);
  const rows = await storedPhotos(userId);
  expect(rows.map((r) => [r.id, r.is_primary])).toEqual([[first.id, true]]);
  const photos = adminClient().storage.from("photos");
  expect((await photos.list("", { search: second.id })).data ?? []).toHaveLength(0);
  expect(((await photos.list("", { search: first.id })).data ?? []).map((f) => f.name)).toEqual([`${first.id}.webp`]);
});

test("BR-11: another member cannot read a photo by path, even signed in", async ({ page }) => {
  const { userId } = await memberAtPhotos(page);
  await uploadPhotos(page, PHOTO_FIXTURES.slice(0, 1));
  const [row] = await storedPhotos(userId);

  // A second member with a real session (members never get storage access, signed in or not).
  const other = randomLiberianPhone();
  await createMember(other.e164);
  const otherClient = await signInMemberViaApi(other.e164);
  const { data, error } = await otherClient.storage.from("photos").download(row.storage_path);
  expect(data).toBeNull();
  expect(error).not.toBeNull();
  const { data: signed } = await otherClient.storage.from("photos").createSignedUrl(row.storage_path, 60);
  expect(signed).toBeNull();
  const { data: listed } = await otherClient.storage.from("photos").list("", { search: row.id });
  expect(listed ?? []).toHaveLength(0);
});
