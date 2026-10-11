import { z } from "zod";

/**
 * The browsers' own push services. The server only ever sends to these, never to an address a member
 * chose (the database checks the same list).
 */
export const PUSH_HOSTS =
  /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)$/;

export const pushEndpointSchema = z.url({ protocol: /^https$/, hostname: PUSH_HOSTS }).max(1000);

/** A browser's push subscription (PushSubscription.toJSON()), checked before it is stored. */
export const pushSubscriptionSchema = z.object({
  endpoint: pushEndpointSchema,
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{20,200}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
  }),
});
