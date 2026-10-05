/**
 * PII scrubbing for error reports and logs (spec §5 Errors, §6 rule 7).
 * Never let phone numbers, dates of birth, storage paths or message text leave the server.
 * Pure module: no Next.js or Sentry imports, so it is unit-testable and reusable.
 */

export const FILTERED = "[Filtered]";

/** Keys whose values are always dropped, whatever they contain. Compared lower-case. */
const SENSITIVE_KEYS = new Set([
  "phone",
  "phone_number",
  "sender_phone",
  "dob",
  "date_of_birth",
  "dateofbirth",
  "storage_path",
  "selfie_storage_path",
  "evidence_path",
  "body",
  "text",
  "message_text",
  "bio",
  "note",
  "member_note",
  "query_string",
  "password",
  "otp",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "cookie",
  "cookies",
  "set-cookie",
  "apikey",
  "x-api-key",
  "ip_address",
]);

/** Technical keys left untouched so the event stays usable (ids and times look like numbers). */
const PASSTHROUGH_KEYS = new Set([
  "event_id",
  "trace_id",
  "span_id",
  "parent_span_id",
  "timestamp",
  "start_timestamp",
  "release",
  "dist",
  "environment",
  "level",
  "platform",
  "lineno",
  "colno",
]);

const PATTERNS: RegExp[] = [
  // Supabase Storage URLs and bucket-relative paths.
  /\/storage\/v1\/object\/[^\s"'<>]+/gi,
  /\b(?:photos-quarantine|photos|verification|payment-evidence)\/[^\s"'<>?#]+/gi,
  // Dates that could be a date of birth: 14/03/1999, 14-3-99, 1999-03-14, 1999-3-4.
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g,
  /\b\d{4}[/.-]\d{1,2}[/.-]\d{1,2}\b/g,
  // Phone numbers: any run of 7+ digits, optionally with +, spaces, dots, dashes or brackets.
  /\+?\(?\d(?:[\s.()-]*\d){6,}/g,
];

// UUIDs are ids, not PII; keep them readable instead of letting the digit pattern mangle them.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function scrubFragment(value: string): string {
  return PATTERNS.reduce((acc, pattern) => acc.replace(pattern, FILTERED), value);
}

export function scrubString(value: string): string {
  let out = "";
  let last = 0;
  for (const match of value.matchAll(UUID)) {
    out += scrubFragment(value.slice(last, match.index)) + match[0];
    last = match.index + match[0].length;
  }
  return out + scrubFragment(value.slice(last));
}

/** Removes the query string and fragment from a URL-like string (they can carry OTPs, tokens, DOB). */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/** Deep-copies `value`, dropping sensitive keys and masking PII patterns in strings. */
export function scrub<T>(value: T, depth = 0): T {
  if (depth > 12) return FILTERED as T;
  if (typeof value === "string") return scrubString(value) as T;
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lower)) out[key] = FILTERED;
      else if (PASSTHROUGH_KEYS.has(lower)) out[key] = inner;
      else out[key] = scrub(inner, depth + 1);
    }
    return out as T;
  }
  return value;
}

/** Sentry `beforeBreadcrumb` hook: keep navigation only, without query strings. */
export function scrubBreadcrumb<B extends { category?: string; data?: { [key: string]: unknown } }>(
  breadcrumb: B,
): B | null {
  if (breadcrumb.category !== "navigation") return null;
  const data = { ...breadcrumb.data };
  for (const key of ["from", "to", "url"]) {
    if (typeof data[key] === "string") data[key] = stripQuery(data[key] as string);
  }
  return scrub({ ...breadcrumb, data });
}

/** Sentry `beforeSend` / `beforeSendTransaction` hook. Removes request bodies, cookies and user PII. */
export function scrubEvent<E extends object>(event: E): E {
  const copy = { ...event } as Record<string, unknown>;
  if (copy.request && typeof copy.request === "object") {
    const request: Record<string, unknown> = { ...(copy.request as Record<string, unknown>) };
    // Bodies, cookies, headers (IP, referer with tokens), env and query strings never leave.
    delete request.data;
    delete request.cookies;
    delete request.headers;
    delete request.env;
    delete request.query_string;
    if (typeof request.url === "string") request.url = stripQuery(request.url);
    copy.request = request;
  }
  if (copy.user && typeof copy.user === "object") {
    const { id } = copy.user as { id?: unknown };
    copy.user = id === undefined ? undefined : { id };
  }
  return scrub(copy) as E;
}
