import { createHmac, randomInt } from "node:crypto";
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
  return join(OUTBOX, `${createHmac("sha256", process.env.APP_COOKIE_SECRET!).update(e164).digest("hex")}.json`);
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
  // The trigger creates the users row; make sure it exists before tests rely on it.
  const { data: row } = await admin.from("users").select("id").eq("id", data.user!.id).single();
  expect(row).not.toBeNull();
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

/** Signs a member in through the real Auth API with an OTP from the dev outbox; returns their client. */
export async function signInMemberViaApi(e164: string) {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const since = Date.now();
  const { error: otpError } = await client.auth.signInWithOtp({ phone: e164, options: { shouldCreateUser: false } });
  expect(otpError).toBeNull();
  const { error } = await client.auth.verifyOtp({ phone: e164, token: await readOtp(e164, since), type: "sms" });
  expect(error).toBeNull();
  return client;
}

/** Signs a Send-SMS hook request the way Supabase Auth does (Standard Webhooks). */
export function signHook(body: string, id = `msg_${randomInt(1e9)}`, ts = Math.floor(Date.now() / 1000)) {
  const key = Buffer.from(process.env.SEND_SMS_HOOK_SECRET!.replace(/^v1,whsec_/, ""), "base64");
  const signature = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  return {
    "webhook-id": id,
    "webhook-timestamp": String(ts),
    "webhook-signature": `v1,${signature}`,
    "content-type": "application/json",
  };
}
