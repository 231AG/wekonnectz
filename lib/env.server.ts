import "server-only";

import { z } from "zod";

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
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= schema.parse(process.env);
  return cached;
}
