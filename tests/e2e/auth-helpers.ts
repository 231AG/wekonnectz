import { createHash, randomInt } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

/** Fictional, random Liberian mobile number for one test (77 + 7 digits). */
export function randomLiberianPhone(): { national: string; e164: string } {
  const rest = String(randomInt(0, 10_000_000)).padStart(7, "0");
  return { national: `77${rest}`, e164: `+23177${rest}` };
}

const OUTBOX = process.env.SMS_DEV_OUTBOX_DIR ?? ".dev-sms-outbox";

function outboxFile(e164: string) {
  return join(OUTBOX, `${createHash("sha256").update(e164).digest("hex")}.json`);
}

export function outboxHasCodeSince(e164: string, since: number): boolean {
  try {
    return statSync(outboxFile(e164)).mtimeMs >= since;
  } catch {
    return false;
  }
}

/** Waits for the fake SMS provider to "deliver" a code to this number. */
export async function readOtp(e164: string, since: number): Promise<string> {
  let code = "";
  await expect
    .poll(
      () => {
        if (!outboxHasCodeSince(e164, since)) return "";
        code = (JSON.parse(readFileSync(outboxFile(e164), "utf8")) as { code: string }).code;
        return code;
      },
      { timeout: 15_000, message: "OTP was not delivered to the dev outbox" },
    )
    .toMatch(/^\d{6}$/);
  return code;
}

/** Service-role client for test setup and assertions only (local stack). */
export function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Creates a confirmed member directly (skips the UI), the way an earlier signup would have. */
export async function createMember(e164: string): Promise<string> {
  const admin = adminClient();
  const { data: geo, error: geoError } = await admin.rpc("begin_signup", {
    p_phone: e164,
    p_ip_country: "LR",
    p_ip: "203.0.113.200",
  });
  expect(geoError).toBeNull();
  expect(geo).toBe("PASS");
  const { data, error } = await admin.auth.admin.createUser({ phone: e164, phone_confirm: true });
  expect(error).toBeNull();
  return data.user!.id;
}

export async function findAuthUserIdByPhone(e164: string): Promise<string | null> {
  const { data, error } = await adminClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  return data.users.find((u) => u.phone === e164.replace(/^\+/, ""))?.id ?? null;
}

export async function enterDob(page: Page, d: string, m: string, y: string) {
  await page.getByLabel("Day").fill(d);
  await page.getByLabel("Month").fill(m);
  await page.getByLabel("Year").fill(y);
  await page.getByRole("button", { name: "Continue" }).click();
}

export async function enterCode(page: Page, code: string) {
  await page.locator("#code").fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
}
