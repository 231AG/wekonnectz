import "server-only";

import * as Sentry from "@sentry/nextjs";
import { after } from "next/server";
import webpush from "web-push";

import { describeNotification } from "@/lib/domain/notifications";
import { vapidPublicKey } from "@/lib/env.public";
import { serverEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Web push (OD-25). Off until the VAPID keys are set (T-20). The push payload holds only the generic
 * title, text and link from describeNotification(): no names, no message text (§6 rule 7).
 */

export function pushConfigured(): boolean {
  const env = serverEnv();
  return Boolean(vapidPublicKey() && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

type Device = { endpoint: string; p256dh: string; auth: string };

/** What the service worker receives. */
export function pushPayload(type: string, payload: Record<string, unknown>): string {
  const t = describeNotification(type, payload);
  return JSON.stringify({
    title: t.title,
    body: t.body,
    url: t.href,
    tag: type === "MESSAGE_RECEIVED" ? t.href : undefined,
  });
}

/** Sends the notices not yet pushed (all members, or just these) and returns how many were sent. */
export async function deliverPush(users?: string[]): Promise<number> {
  if (!pushConfigured()) return 0;
  const env = serverEnv();
  webpush.setVapidDetails(env.VAPID_SUBJECT!, vapidPublicKey()!, env.VAPID_PRIVATE_KEY!);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_push_batch", { p_users: users ?? undefined, p_limit: 100 });
  if (error) {
    Sentry.captureMessage("push: claim failed", { level: "warning" });
    return 0;
  }
  let sent = 0;
  for (const n of data ?? []) {
    const body = pushPayload(n.type, (n.payload ?? {}) as Record<string, unknown>);
    for (const d of (n.devices ?? []) as Device[]) {
      try {
        await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, body, {
          TTL: 3600,
          urgency: "normal",
        });
        sent += 1;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.rpc("drop_push_endpoint", { p_endpoint: d.endpoint });
        } else {
          // Never log the endpoint (it identifies a device).
          Sentry.captureMessage("push: send failed", { level: "warning", extra: { status } });
        }
      }
    }
  }
  return sent;
}

/** After the response: push whatever this request just created (best effort; never blocks the action). */
export function pushSoon(users?: string[]): void {
  if (!pushConfigured()) return;
  after(async () => {
    try {
      await deliverPush(users);
    } catch (e) {
      Sentry.captureException(e);
    }
  });
}
