import { expect, test } from "@playwright/test";

import {
  adminClient,
  createMember,
  enterCode,
  enterDob,
  findAuthUserIdByPhone,
  outboxHasCodeSince,
  randomLiberianPhone,
  readOtp,
} from "./auth-helpers";
import { SHOTS_P1, trackPageErrors } from "./helpers";

// Default: requests come from Liberia (the header Vercel would set). Individual tests override it.
test.use({ extraHTTPHeaders: { "x-vercel-ip-country": "LR" } });

const adultYear = String(new Date().getUTCFullYear() - 27);

test("welcome screen matches the mock-up layout and links work", async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Meet with intention." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/signup");
  await expect(page.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  await expect(page.getByText("18+ only · Available in Liberia only")).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P1}/onboarding-welcome.png` });
  for (const [name, path] of [
    ["About", "/about"],
    ["Safety", "/safety"],
    ["Community rules", "/rules"],
    ["Terms", "/terms"],
    ["Privacy", "/privacy"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (name === "Safety") await page.screenshot({ path: `${SHOTS_P1}/public-safety.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});

test("BR-1/BR-2/BR-4: a Liberian adult signs up with a +231 OTP and lands on onboarding", async ({ page }) => {
  const errors = trackPageErrors(page);
  const phone = randomLiberianPhone();

  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "You must be 18 or older" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Sign-up progress" })).toHaveAttribute(
    "aria-valuetext",
    "Step 1 of 8",
  );
  await page.getByLabel("Day").fill("14");
  await page.getByLabel("Month").fill("03");
  await page.getByLabel("Year").fill(adultYear);
  await page.screenshot({ path: `${SHOTS_P1}/onboarding-age-gate.png` });
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/signup\/phone$/);
  await expect(page.getByRole("heading", { name: "Your Liberian number" })).toBeVisible();
  await page.getByLabel("Phone number, Liberian (+231)").fill(`0${phone.national}`);
  const since = Date.now();
  await page.getByRole("button", { name: "Send code" }).click();

  const code = await readOtp(phone.e164, since);
  await expect(page.getByText(/Resend code in [01]:\d\d/)).toBeVisible();
  await page.locator("#code").fill(code.slice(0, 4));
  await page.screenshot({ path: `${SHOTS_P1}/onboarding-phone-otp.png` });
  await page.locator("#code").fill(code);
  await page.getByRole("button", { name: "Verify" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("heading", { name: "You’re in" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P1}/onboarding-phone-verified.png` });

  // Database: account PENDING / USER, DOB stored and locked (BR-4).
  const id = await findAuthUserIdByPhone(phone.e164);
  expect(id).not.toBeNull();
  const admin = adminClient();
  const { data: user } = await admin.from("users").select("role, status").eq("id", id!).single();
  expect(user).toEqual({ role: "USER", status: "PENDING" });
  const { data: profile } = await admin
    .from("profiles")
    .select("date_of_birth, dob_locked")
    .eq("user_id", id!)
    .single();
  expect(profile).toEqual({ date_of_birth: `${adultYear}-03-14`, dob_locked: true });

  // Signed in: the welcome page sends a member onward.
  await page.goto("/");
  await expect(page).toHaveURL(/\/onboarding$/);
  expect(errors).toEqual([]);
});

test.describe("from outside Liberia", () => {
  test.use({ extraHTTPHeaders: { "x-vercel-ip-country": "GB" } });

  test("BR-1: non-LR signup is blocked before any OTP is sent; attempt recorded with country only", async ({
    page,
  }) => {
    const phone = randomLiberianPhone();
    await page.goto("/signup");
    await enterDob(page, "14", "03", adultYear);
    await page.getByLabel("Phone number, Liberian (+231)").fill(phone.national);
    const since = Date.now();
    await page.getByRole("button", { name: "Send code" }).click();

    await expect(page).toHaveURL(/\/region-blocked$/);
    await expect(
      page.getByRole("heading", { name: "This platform is currently available only in Liberia." }),
    ).toBeVisible();
    await page.screenshot({ path: `${SHOTS_P1}/region-blocked.png` });

    await page.waitForTimeout(1500);
    expect(outboxHasCodeSince(phone.e164, since), "no SMS may be sent").toBe(false);
    expect(await findAuthUserIdByPhone(phone.e164)).toBeNull();

    const { data: checks } = await adminClient()
      .from("geo_checks")
      .select("ip_country, phone_country, result")
      .gte("created_at", new Date(since - 1000).toISOString())
      .eq("ip_country", "GB");
    expect(checks).toContainEqual({ ip_country: "GB", phone_country: "LR", result: "BLOCKED_COUNTRY" });
  });

  test("§3 rule 9: public pages stay reachable from anywhere", async ({ page }) => {
    for (const path of ["/", "/about", "/safety", "/rules", "/terms", "/privacy", "/login"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
    }
  });
});

test("BR-2: a non-Liberian number is refused with a clear message", async ({ page }) => {
  await page.goto("/signup");
  await enterDob(page, "14", "03", adultYear);
  await page.getByLabel("Phone number, Liberian (+231)").fill("+44 7700 900123");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Only +231 numbers can sign up." })).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P1}/onboarding-phone-error-not-liberian.png` });
});

test("BR-4: under-18 is blocked, no account is created, and the result sticks", async ({ page }) => {
  await page.goto("/signup");
  const year = String(new Date().getUTCFullYear() - 17);
  await enterDob(page, "1", "1", year);
  await expect(page).toHaveURL(/\/signup\/not-eligible$/);
  await expect(page.getByRole("heading", { name: "WeKonnectz is for adults only" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P1}/onboarding-under-18.png` });

  // Going back to try another date lands on the same screen (24 h).
  await page.goto("/signup");
  await expect(page).toHaveURL(/\/signup\/not-eligible$/);
  // The phone step is unreachable without a valid age gate.
  await page.goto("/signup/phone");
  await expect(page).toHaveURL(/\/signup(\/not-eligible)?$/);
});

test("age gate rejects impossible dates without leaving the page", async ({ page }) => {
  await page.goto("/signup");
  await enterDob(page, "31", "04", "1999");
  await expect(page.getByRole("alert").filter({ hasText: "Enter a real date of birth." })).toBeVisible();
  await expect(page).toHaveURL(/\/signup$/);
  await page.screenshot({ path: `${SHOTS_P1}/onboarding-age-gate-error.png` });
});

test("plan §1.5: a direct Supabase API signup that skips our server is refused, no account, no SMS", async ({
  request,
}) => {
  const phone = randomLiberianPhone();
  const since = Date.now();
  const res = await request.post(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/otp`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "Content-Type": "application/json" },
    data: { phone: phone.e164, create_user: true },
  });
  expect(res.status()).toBe(403);
  await new Promise((r) => setTimeout(r, 1000));
  expect(outboxHasCodeSince(phone.e164, since)).toBe(false);
  expect(await findAuthUserIdByPhone(phone.e164)).toBeNull();
});

test("BR-2: a phone + password signUp through the API is not auto-confirmed", async ({ request }) => {
  const phone = randomLiberianPhone();
  // Even with a valid geo pass, a password signUp must still prove the SIM with an OTP.
  await adminClient().rpc("begin_signup", { p_phone: phone.e164, p_ip_country: "LR", p_ip: "203.0.113.201" });
  const res = await request.post(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/signup`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "Content-Type": "application/json" },
    data: { phone: phone.e164, password: "Test-password-123" },
  });
  const body = (await res.json()) as { access_token?: string; phone_confirmed_at?: string | null };
  expect(body.access_token, "no session without OTP").toBeUndefined();
  expect(body.phone_confirmed_at ?? null).toBeNull();
});

test("returning member logs in with an OTP; a member without a DOB is sent to the age gate first", async ({ page }) => {
  const phone = randomLiberianPhone();
  await createMember(phone.e164);

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P1}/login.png` });
  await page.getByLabel("Phone number, Liberian (+231)").fill(phone.national);
  const since = Date.now();
  await page.getByRole("button", { name: "Send code" }).click();
  await enterCode(page, await readOtp(phone.e164, since));

  await expect(page).toHaveURL(/\/signup$/);
  await enterDob(page, "2", "2", adultYear);
  await expect(page).toHaveURL(/\/onboarding$/);
});

test("login does not reveal whether a number has an account", async ({ page }) => {
  const phone = randomLiberianPhone();
  await page.goto("/login");
  await page.getByLabel("Phone number, Liberian (+231)").fill(phone.national);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("If this number has an account, we've sent it a code.")).toBeVisible();
  expect(await findAuthUserIdByPhone(phone.e164), "login never creates accounts").toBeNull();
});

test("wrong code shows a neutral error", async ({ page }) => {
  const phone = randomLiberianPhone();
  await createMember(phone.e164);
  await page.goto("/login");
  await page.getByLabel("Phone number, Liberian (+231)").fill(phone.national);
  const since = Date.now();
  await page.getByRole("button", { name: "Send code" }).click();
  const code = await readOtp(phone.e164, since);
  await enterCode(page, code === "000000" ? "111111" : "000000");
  await expect(page.getByRole("alert").filter({ hasText: "That code is wrong or has expired." })).toBeVisible();
  await page.screenshot({ path: `${SHOTS_P1}/login-error-wrong-code.png` });
});

test("BR-6: a banned member cannot sign in, and BR-3: their number cannot sign up again", async ({ page }) => {
  const phone = randomLiberianPhone();
  const id = await createMember(phone.e164);
  const admin = adminClient();
  await admin.from("users").update({ status: "BANNED" }).eq("id", id);
  // The Phase 5 ban function will also add the number to the blocklist; simulate that here.
  const { data: hash } = await admin.rpc("phone_hash", { p_phone: phone.e164 });
  await admin.from("phone_blocklist").insert({ phone_hash: hash as string, reason: "e2e test ban" });

  await page.goto("/login");
  await page.getByLabel("Phone number, Liberian (+231)").fill(phone.national);
  const since = Date.now();
  await page.getByRole("button", { name: "Send code" }).click();
  await page.waitForTimeout(1500);
  if (outboxHasCodeSince(phone.e164, since)) {
    await enterCode(page, await readOtp(phone.e164, since));
  } else {
    await enterCode(page, "123456");
  }
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("alert").filter({ hasText: /wrong or has expired|isn’t available|isn't available/ }),
  ).toBeVisible();

  // BR-3: the banned number cannot start a new signup either.
  await page.goto("/signup");
  await enterDob(page, "14", "03", adultYear);
  await page.getByLabel("Phone number, Liberian (+231)").fill(phone.national);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This number can't be used to sign up." })).toBeVisible();
});

test("signed-out visitors cannot open member pages", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/login$/);
});

test("public email signup is closed (only SUPER_ADMIN creates email staff accounts)", async ({ request }) => {
  const res = await request.post(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/signup`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "Content-Type": "application/json" },
    data: { email: `e2e-${Date.now()}@example.test`, password: "Test-password-123" },
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
  const body = (await res.json()) as { access_token?: string };
  expect(body.access_token).toBeUndefined();
});
