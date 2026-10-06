import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Small encrypted, tamper-proof cookie values (AES-256-GCM). Used to carry the date of birth from
 * the age gate to account creation without storing it anywhere else first.
 */

function key(secret: string) {
  return createHash("sha256").update(`wk-sealed-v1:${secret}`).digest();
}

export function seal(value: unknown, secret: string, ttlSeconds: number, now = Date.now()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const payload = JSON.stringify({ v: value, exp: now + ttlSeconds * 1000 });
  const data = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function unseal<T>(token: string | undefined, secret: string, now = Date.now()): T | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, data] = parts.map((p) => Buffer.from(p, "base64url"));
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(secret), iv, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(plain) as { v: T; exp: number };
    return parsed.exp > now ? parsed.v : null;
  } catch {
    return null;
  }
}
