import "server-only";

import { cookies } from "next/headers";

import { seal, unseal } from "@/lib/auth/sealed";
import { serverEnv } from "@/lib/env.server";

/** Date of birth carried from the age gate to account creation (30 min). Encrypted; never logged. */
const DOB_COOKIE = "wk_dob";
/** Remembers an under-18 result for 24 h so the age gate isn't simply retried with another date. */
const AGE_BLOCK_COOKIE = "wk_age_block";

const base = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.VERCEL === "1",
  path: "/",
});

export async function setPendingDob(isoDate: string) {
  const ttl = 30 * 60;
  (await cookies()).set(DOB_COOKIE, seal({ dob: isoDate }, serverEnv().APP_COOKIE_SECRET, ttl), {
    ...base(),
    maxAge: ttl,
  });
}

export async function getPendingDob(): Promise<string | null> {
  const value = unseal<{ dob: string }>((await cookies()).get(DOB_COOKIE)?.value, serverEnv().APP_COOKIE_SECRET);
  return value?.dob ?? null;
}

export async function clearPendingDob() {
  (await cookies()).delete(DOB_COOKIE);
}

export async function setAgeBlock() {
  const ttl = 24 * 60 * 60;
  (await cookies()).set(AGE_BLOCK_COOKIE, seal({ blocked: true }, serverEnv().APP_COOKIE_SECRET, ttl), {
    ...base(),
    maxAge: ttl,
  });
}

export async function isAgeBlocked(): Promise<boolean> {
  return Boolean(unseal((await cookies()).get(AGE_BLOCK_COOKIE)?.value, serverEnv().APP_COOKIE_SECRET));
}
