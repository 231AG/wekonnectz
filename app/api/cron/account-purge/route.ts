import { timingSafeEqual } from "node:crypto";

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";

import { purgeDeletedAccounts } from "@/lib/account/purge";
import { serverEnv } from "@/lib/env.server";

/**
 * Daily account purge (spec §8, OD-7): deleted accounts past the retention period lose their photos,
 * selfie and Auth account. Nothing is purged while OD-7 is unset. Counts only in the response.
 * Called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`.
 */
export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const secret = serverEnv().CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await purgeDeletedAccounts());
  } catch (e) {
    Sentry.captureException(e);
    return NextResponse.json({ error: "account purge failed" }, { status: 500 });
  }
}
