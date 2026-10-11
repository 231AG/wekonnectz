import { timingSafeEqual } from "node:crypto";

import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";

import { sendReminders } from "@/lib/notifications/reminders";
import { serverEnv } from "@/lib/env.server";

/**
 * Daily reminders (spec §16): a pass about to end, a card plan about to renew — each sent once, then
 * pushed. Runs mid-morning Liberia time (GMT) so nobody is woken at night. Counts only in the response.
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
    return NextResponse.json(await sendReminders());
  } catch (e) {
    Sentry.captureException(e);
    return NextResponse.json({ error: "reminders failed" }, { status: 500 });
  }
}
