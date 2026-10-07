import { timingSafeEqual } from "node:crypto";

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/lib/env.server";
import { purgeExpiredSelfies } from "@/lib/storage/verification";

/**
 * OD-6 selfie retention: deletes verification selfie images past the retention period (decision
 * records stay). Called daily by Vercel Cron with `Authorization: Bearer $CRON_SECRET`.
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
    const deleted = await purgeExpiredSelfies();
    return NextResponse.json({ deleted });
  } catch (e) {
    // Never echo details back; report to Sentry (the scrubber removes paths and personal data).
    Sentry.captureException(e);
    return NextResponse.json({ error: "retention job failed" }, { status: 500 });
  }
}
