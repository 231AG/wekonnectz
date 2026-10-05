/**
 * Baseline security headers (spec §22). Phase 12 replaces the CSP with a nonce-based one.
 * Kept as a pure function so it is unit-tested and shared with next.config.ts.
 */
export function buildSecurityHeaders({
  isDev,
  supabaseUrl,
}: {
  isDev: boolean;
  supabaseUrl?: string;
}): { key: string; value: string }[] {
  const supabase = supabaseUrl ? new URL(supabaseUrl).origin : "";
  const supabaseWs = supabase ? supabase.replace(/^http/, "ws") : "";
  const join = (...parts: string[]) => parts.filter(Boolean).join(" ");

  const csp = [
    "default-src 'self'",
    // Next.js inlines bootstrap scripts; nonces arrive in Phase 12. Dev needs eval for HMR.
    join("script-src 'self' 'unsafe-inline'", isDev ? "'unsafe-eval'" : ""),
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
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: csp },
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
