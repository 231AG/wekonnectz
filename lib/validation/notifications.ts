import { z } from "zod";

/** A browser's push subscription (PushSubscription.toJSON()), checked before it is stored. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(1000),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{20,200}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
  }),
});

export const pushEndpointSchema = z.url({ protocol: /^https$/ }).max(1000);
