import * as Sentry from "@sentry/nextjs";
import { NextResponse, type NextRequest } from "next/server";

import { MAX_WEBHOOK_BYTES, processCardWebhook } from "@/lib/payments/card/server";

/**
 * Card processor webhooks (spec §16, §22): signature first, raw event stored, idempotent on the
 * processor event ID, replay window in the adapter. 401 for an untrusted delivery (logged as invalid);
 * 200 once stored, whether applied, a duplicate or rejected; 500 so the processor retries when we
 * can't apply it yet.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_WEBHOOK_BYTES) return NextResponse.json({ error: "too large" }, { status: 413 });
  try {
    const result = await processCardWebhook(request.headers, await request.text());
    if (result.status === 200) return NextResponse.json({ received: true, outcome: result.outcome });
    return NextResponse.json({ error: "not accepted" }, { status: result.status });
  } catch (e) {
    Sentry.captureException(e);
    return NextResponse.json({ error: "webhook failed" }, { status: 500 });
  }
}
