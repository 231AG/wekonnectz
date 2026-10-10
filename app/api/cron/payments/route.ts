import { timingSafeEqual } from "node:crypto";

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/lib/env.server";
import { cardRenewalsDue } from "@/lib/payments/card/server";
import { paymentHousekeeping } from "@/lib/storage/payments";

/**
 * Daily payments housekeeping: records passes that have ended (access itself already ends by time,
 * BR-27), deletes payment screenshots past retention (OD-18) and lists card renewals due a reminder. Called by Vercel Cron with
 * `Authorization: Bearer $CRON_SECRET`.
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
    const housekeeping = await paymentHousekeeping();
    // Card renewal reminders (§16): listed here; sending arrives with notifications in Phase 11.
    return NextResponse.json({ ...housekeeping, cardRenewalsDue: await cardRenewalsDue() });
  } catch (e) {
    Sentry.captureException(e);
    return NextResponse.json({ error: "payments job failed" }, { status: 500 });
  }
}
