/**
 * Security headers (spec §22). The page Content-Security-Policy is nonce-based and built per request
 * in proxy.ts (buildCsp); everything else is static and set in next.config.ts. Pure functions so they
 * are unit-tested.
 */

/** Strict CSP for one page response: scripts only with this request's nonce ('strict-dynamic'). */
export function buildCsp({
  isDev,
  supabaseUrl,
  nonce,
}: {
  isDev: boolean;
  supabaseUrl?: string;
  nonce: string;
}): string {
  const supabase = supabaseUrl ? new URL(supabaseUrl).origin : "";
  const supabaseWs = supabase ? supabase.replace(/^http/, "ws") : "";
  const join = (...parts: string[]) => parts.filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    // Dev needs eval for React's debug stacks; production never.
    join(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`, isDev ? "'unsafe-eval'" : ""),
    // React style attributes (e.g. widths) need inline styles; scripts are the XSS risk and are nonce-only.
    "style-src 'self' 'unsafe-inline'",
    join("img-src 'self' data: blob:", supabase),
    "font-src 'self'",
    join(
      "connect-src 'self'",
      supabase,
      supabaseWs,
      "https://*.ingest.sentry.io https://*.ingest.de.sentry.io",
      isDev ? "ws://localhost:* ws://127.0.0.1:*" : "",
    ),
    "media-src 'self' blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** For API responses (JSON, files): nothing may run or be framed. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/** Headers for every response. The page CSP comes from the proxy (see buildCsp). */
export function buildSecurityHeaders(): { key: string; value: string }[] {
  return [
    // No `preload` until the production domain is settled (T-16); preload is hard to undo.
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Camera for the in-app verification selfie only. Never geolocation (BR-20).
    { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}
