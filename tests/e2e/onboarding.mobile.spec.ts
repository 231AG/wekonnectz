import { expect, test, type Page } from "@playwright/test";

import {
  adminClient,
  createMember,
  enterDob,
  findAuthUserIdByPhone,
  loginViaUi,
  randomLiberianPhone,
} from "./auth-helpers";
import { SHOTS_P2, trackPageErrors } from "./helpers";

test.use({ extraHTTPHeaders: { "x-vercel-ip-country": "LR" } });

const adultYear = String(new Date().getUTCFullYear() - 27);

/** A fresh member who has verified their phone and passed the age gate: lands on the rules step. */
async function memberAtRules(page: Page) {
  const phone = randomLiberianPhone();
  await createMember(phone.e164);
  await loginViaUi(page, phone);
  await expect(page).toHaveURL(/\/signup$/);
  await enterDob(page, "14", "03", adultYear);
  await expect(page).toHaveURL(/\/onboarding\/rules$/);
  return phone;
}

async function acceptRules(page: Page) {
  await page.getByLabel(/I agree to the Community rules/).check();
  await page.getByRole("button", { name: "I agree" }).click();
  await expect(page).toHaveURL(/\/onboarding\/about$/);
}

async function fillAbout(page: Page, name = "Musu") {
  await page.getByLabel("Display name").fill(name);
  await page.getByText("Woman", { exact: true }).click();
  await page.getByText("Men", { exact: true }).click();
  await page.getByLabel("County").selectOption("Montserrado");
  await page.getByLabel("Community").selectOption({ label: "Sinkor" });
  await page.getByText("Both", { exact: true }).click();
}

async function pickInterests(page: Page, names: string[]) {
  for (const n of names) await page.getByText(n, { exact: true }).click();
}

test("§10 steps 4–8: a new member completes rules, about you, interests and bio, and the answers are stored", async ({
  page,
}) => {
  const errors = trackPageErrors(page);
  const phone = await memberAtRules(page);

  // Step 4: rules — must tick the box.
  await expect(page.getByRole("heading", { name: "Community rules" })).toBeVisible();
  await expect(page.getByText("No selling or buying sex")).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P2}/onboarding-community-rules.png`, fullPage: true });
  await page.getByRole("button", { name: "I agree" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Tick the box" })).toBeVisible();
  await acceptRules(page);

  // Steps 5–6: about you — required fields first.
  await expect(page.getByRole("heading", { name: "About you" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Choose what you’re looking for." })).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P2}/onboarding-about-you-errors.png`, fullPage: true });
  await fillAbout(page);
  await page.screenshot({ path: `${SHOTS_P2}/onboarding-about-you.png`, fullPage: true });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/onboarding\/interests$/);

  // Steps 7–8: interests and bio — BR-31 rejects contact details / prices with the neutral message.
  await pickInterests(page, ["Music", "Food"]);
  await page.getByLabel("Bio").fill("Teacher by day. WhatsApp me on 0770 123 456");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Choose at least 3 interests." })).toBeVisible();
  await pickInterests(page, ["Travel"]);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Contact details and prices aren’t allowed." })).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P2}/onboarding-interests-bio-rejected.png`, fullPage: true });
  await page.getByLabel("Bio").fill("Teacher by day, jollof critic by night. Looking for something real.");
  await page.screenshot({ path: `${SHOTS_P2}/onboarding-interests-bio.png`, fullPage: true });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/onboarding\/photos$/);
  await expect(page.getByRole("heading", { name: "Add your photos" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P2}/onboarding-photos-next.png` });

  // Database: consents with versions, profile fields, interests.
  const id = (await findAuthUserIdByPhone(phone.e164))!;
  const admin = adminClient();
  const { data: consents } = await admin.from("consents").select("document, version").eq("user_id", id);
  expect(consents?.map((c) => c.document).sort()).toEqual(["PRIVACY", "RULES", "TERMS"]);
  expect(consents?.every((c) => c.version.length > 0)).toBe(true);
  const { data: profile } = await admin
    .from("profiles")
    .select(
      "display_name, gender, seeking_genders, intent_relationship, intent_casual, bio, is_profile_complete, areas(name)",
    )
    .eq("user_id", id)
    .single();
  expect(profile).toMatchObject({
    display_name: "Musu",
    gender: "WOMAN",
    seeking_genders: ["MAN"],
    intent_relationship: true,
    intent_casual: true,
    bio: "Teacher by day, jollof critic by night. Looking for something real.",
    is_profile_complete: true,
    areas: { name: "Sinkor" },
  });
  const { count } = await admin.from("user_interests").select("*", { count: "exact", head: true }).eq("user_id", id);
  expect(count).toBe(3);

  // Log out from the last step works.
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});

test("§10: progress is saved per step; a member who leaves returns to the first incomplete step", async ({ page }) => {
  const phone = await memberAtRules(page);
  await acceptRules(page);
  await fillAbout(page, "Kemah");
  await page.getByText("Man", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/onboarding\/interests$/);

  // Leaving and coming back (start page, onboarding index, login page) resumes at interests.
  // Progress is read from the database, not the browser (a second OTP login within 60 s is not
  // possible: Supabase allows one code per number per minute).
  for (const path of ["/", "/onboarding", "/login", "/signup"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/onboarding\/interests$/);
  }
  const id = (await findAuthUserIdByPhone(phone.e164))!;
  const { data: profile } = await adminClient()
    .from("profiles")
    .select("display_name, is_profile_complete")
    .eq("user_id", id)
    .single();
  expect(profile).toEqual({ display_name: "Kemah", is_profile_complete: false });

  // Going back shows the saved answers for editing.
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/onboarding\/about$/);
  await expect(page.getByLabel("Display name")).toHaveValue("Kemah");
  await expect(page.getByLabel("Community")).toHaveValue(/.+/);
});

test("steps cannot be skipped by typing a later URL", async ({ page }) => {
  await memberAtRules(page);
  for (const path of ["/onboarding/about", "/onboarding/interests", "/onboarding/photos"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/onboarding\/rules$/);
  }
});

test("BR-31: a display name advertising a contact app is refused", async ({ page }) => {
  await memberAtRules(page);
  await acceptRules(page);
  await fillAbout(page, "Whatsapp Musu");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Contact details and prices aren’t allowed." })).toBeVisible();
  await expect(page).toHaveURL(/\/onboarding\/about$/);
});

test("signed-out visitors cannot open onboarding steps", async ({ page }) => {
  for (const path of ["/onboarding/rules", "/onboarding/about", "/onboarding/interests", "/onboarding/photos"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});
