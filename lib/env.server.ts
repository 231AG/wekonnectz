import "server-only";

import { z } from "zod";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

// Server-only config (spec §6 rule 3). Values are validated, never logged.
const schema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  APP_COOKIE_SECRET: z.string().min(32),
  SEND_SMS_HOOK_SECRET: z.string().regex(/^v1,whsec_[A-Za-z0-9+/=]+$/),
  SMS_PROVIDER: z.enum(["fake"]),
  VERCEL: z.string().optional(),
  GEO_TRUST_HEADER: z.string().optional(),
  DEV_GEO_COUNTRY: z.string().optional(),
  SMS_DEV_OUTBOX_DIR: z.string().default(".dev-sms-outbox"),
  // Vercel Cron sends it as a bearer token to /api/cron/*. Unset → the cron routes refuse to run.
  CRON_SECRET: z.string().min(16).optional(),
  // Card payments (Phase 7b scaffold). Off unless CARD_PAYMENTS_ENABLED=1 and a processor is configured.
  // "fake" is for local development and tests only and refuses to run in production (OD-4: no real
  // processor yet).
  CARD_PAYMENTS_ENABLED: z.preprocess(emptyToUndefined, z.enum(["0", "1"]).default("0")),
  CARD_PROCESSOR: z.preprocess(emptyToUndefined, z.enum(["fake"]).optional()),
  FAKE_CARD_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= schema.parse(process.env);
  return cached;
}
