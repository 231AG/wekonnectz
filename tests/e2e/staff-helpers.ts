import { createHmac, randomBytes } from "node:crypto";

import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

import { adminClient } from "./auth-helpers";

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s), as an authenticator app computes it. Test-only. */
export function totp(secretBase32: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secretBase32.replace(/=+$/, "").toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, "0");
}

export type TestStaff = { id: string; email: string; password: string };

/**
 * A fictional staff account (email + password). Production staff are created only by the first-admin
 * script or by a SUPER_ADMIN; tests set the role directly with the service role.
 */
export async function createStaff(role: "MODERATOR" | "ADMIN" = "MODERATOR"): Promise<TestStaff> {
  const admin = adminClient();
  const email = `moderator-${randomBytes(4).toString("hex")}@example.test`;
  const password = `Test-${randomBytes(9).toString("base64url")}9a`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(error).toBeNull();
  const { error: roleError } = await admin.from("users").update({ role, status: "ACTIVE" }).eq("id", data.user!.id);
  expect(roleError).toBeNull();
  return { id: data.user!.id, email, password };
}

/** Signs a staff member in through the UI, enrols TOTP on first sign-in, ends on the dashboard. */
export async function staffSignInViaUi(page: Page, staff: TestStaff, onMfa?: () => Promise<void>) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(staff.email);
  await page.getByLabel("Password").fill(staff.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/admin\/mfa$/);
  await page.getByRole("button", { name: "Set up authenticator app" }).click();
  const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await onMfa?.();
  await page.getByLabel("Code from your app").fill(totp(secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  return secret;
}

/** Staff signed in through the Auth API with password only (aal1, no TOTP). */
export async function staffClientAal1(staff: TestStaff) {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email: staff.email, password: staff.password });
  expect(error).toBeNull();
  return client;
}

/**
 * Puts photos in the review queue for a member through the same database functions and storage the
 * server uses, and dates them a week back so they lead the queue (oldest first).
 */
export async function seedPendingPhotos(userId: string, files: string[]): Promise<string[]> {
  const admin = adminClient();
  const ids: string[] = [];
  for (const file of files) {
    const { data: id, error } = await admin.rpc("begin_photo_upload", { p_user_id: userId });
    expect(error).toBeNull();
    const path = `${id}.webp`;
    const webp = await sharp(file).webp().toBuffer();
    expect((await admin.storage.from("photos").upload(path, webp, { contentType: "image/webp" })).error).toBeNull();
    expect(
      (await admin.rpc("complete_photo_upload", { p_user_id: userId, p_photo_id: id, p_storage_path: path })).error,
    ).toBeNull();
    ids.push(id as string);
  }
  // A week old: ahead of anything a test run leaves pending, one second apart so the order is stable.
  const start = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [n, id] of ids.entries()) {
    const submitted = new Date(start + n * 1000).toISOString();
    expect((await admin.from("profile_photos").update({ submitted_at: submitted }).eq("id", id)).error).toBeNull();
  }
  return ids;
}

/**
 * Puts a verification selfie in the queue for a member who has 3 photos, through the same database
 * functions and storage the server uses. Dated a week back so it leads the queue.
 */
export async function seedPendingVerification(userId: string, file = "docs/mockups/html/images/musu1.jpg") {
  const admin = adminClient();
  const { data: started, error } = await admin.rpc("start_verification", { p_user_id: userId });
  expect(error).toBeNull();
  const verificationId = (started as { verification_id: string }[])[0].verification_id;
  const path = `${verificationId}.webp`;
  const webp = await sharp(file).webp().toBuffer();
  expect((await admin.storage.from("verification").upload(path, webp, { contentType: "image/webp" })).error).toBeNull();
  expect(
    (await admin.rpc("claim_verification_selfie", { p_user_id: userId, p_verification_id: verificationId })).data,
  ).toBe(true);
  expect(
    (
      await admin.rpc("submit_verification", {
        p_user_id: userId,
        p_verification_id: verificationId,
        p_storage_path: path,
      })
    ).error,
  ).toBeNull();
  const submitted = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  expect(
    (await admin.from("verifications").update({ submitted_at: submitted }).eq("id", verificationId)).error,
  ).toBeNull();
  return verificationId;
}
