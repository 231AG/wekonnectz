import { timingSafeEqual } from "node:crypto";

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";

import { tidyAvailability, tidyRequests } from "@/lib/availability/server";
import { serverEnv } from "@/lib/env.server";

/**
 * Daily availability tidy (spec §12): records ended windows and members who can no longer be in the
 * pool, and expired message requests (OD-24). Both are decided at query time, so this is bookkeeping only.
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
    return NextResponse.json({ tidied: await tidyAvailability(), requestsExpired: await tidyRequests() });
  } catch (e) {
    Sentry.captureException(e);
    return NextResponse.json({ error: "availability job failed" }, { status: 500 });
  }
}
