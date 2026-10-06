import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Standard Webhooks signature check (used by Supabase Auth HTTP hooks).
 * Secret format: "v1,whsec_<base64 key>". Signed content: "<id>.<timestamp>.<raw body>".
 */
export function verifyStandardWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  rawBody: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) return false;

  const base64Key = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  const expected = createHmac("sha256", Buffer.from(base64Key, "base64"))
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest();

  return signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
