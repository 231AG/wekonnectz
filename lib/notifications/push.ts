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

const SEND_TIMEOUT_MS = 8_000;

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

/**
 * Sends one batch of notices not yet pushed (all members, or just these). Devices are sent to in
 * parallel with a timeout, so one slow push service can't hold up the rest. Returns how many arrived;
 * `claimed` tells the caller whether there may be more.
 */
async function deliverBatch(users?: string[]): Promise<{ sent: number; claimed: number }> {
  const env = serverEnv();
  webpush.setVapidDetails(env.VAPID_SUBJECT!, vapidPublicKey()!, env.VAPID_PRIVATE_KEY!);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_push_batch", { p_users: users ?? undefined, p_limit: 100 });
  if (error) {
    Sentry.captureMessage("push: claim failed", { level: "warning" });
    return { sent: 0, claimed: 0 };
  }
  let sent = 0;
  const retry: string[] = [];
  await Promise.all(
    (data ?? []).map(async (n) => {
      const body = pushPayload(n.type, (n.payload ?? {}) as Record<string, unknown>);
      const results = await Promise.allSettled(
        ((n.devices ?? []) as Device[]).map(async (d) => {
          try {
            await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, body, {
              TTL: 3600,
              urgency: "normal",
              timeout: SEND_TIMEOUT_MS,
            });
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              await admin.rpc("drop_push_endpoint", { p_endpoint: d.endpoint });
              return "gone";
            }
            // Never log the endpoint (it identifies a device).
            Sentry.captureMessage("push: send failed", { level: "warning", extra: { status } });
            throw e;
          }
          return "sent";
        }),
      );
      sent += results.filter((r) => r.status === "fulfilled" && r.value === "sent").length;
      if (results.length && results.every((r) => r.status === "rejected")) retry.push(n.notification_id);
    }),
  );
  if (retry.length) await admin.rpc("unclaim_push", { p_ids: retry });
  return { sent, claimed: data?.length ?? 0 };
}

/** Sends everything due (up to 20 batches), e.g. after the daily reminders. */
export async function deliverPush(users?: string[]): Promise<number> {
  if (!pushConfigured()) return 0;
  let total = 0;
  for (let i = 0; i < 20; i += 1) {
    const { sent, claimed } = await deliverBatch(users);
    total += sent;
    if (claimed < 100) break;
  }
  return total;
}

/** After the response: push whatever this request just created (best effort; never blocks the action). */
export function pushSoon(users?: string[]): void {
  if (!pushConfigured()) return;
  after(async () => {
    try {
      await deliverBatch(users);
    } catch (e) {
      Sentry.captureException(e);
    }
  });
}
