import { scrubBreadcrumb, scrubEvent } from "@/lib/observability/scrub";

/**
 * Shared Sentry options. With no DSN set, Sentry stays disabled (owner task T-17).
 * PII never leaves the process: sendDefaultPii is off and every event is scrubbed.
 */
export function sentryOptions(dsn: string | undefined) {
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    // Console and fetch breadcrumbs can carry message text or phone numbers; keep navigation only.
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
