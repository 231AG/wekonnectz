import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { seal, unseal } = await import("@/lib/auth/sealed");
const { verifyStandardWebhook } = await import("@/lib/auth/webhook-signature");

const SECRET = "x".repeat(48);

describe("sealed cookie values", () => {
  it("round-trips a value before expiry", () => {
    const token = seal({ dob: "1999-03-14" }, SECRET, 60, 1_000);
    expect(unseal(token, SECRET, 2_000)).toEqual({ dob: "1999-03-14" });
  });

  it("does not reveal the value in the token", () => {
    expect(seal({ dob: "1999-03-14" }, SECRET, 60)).not.toContain("1999");
  });

  it("refuses expired, tampered or wrong-key tokens", () => {
    const token = seal({ dob: "1999-03-14" }, SECRET, 60, 1_000);
    expect(unseal(token, SECRET, 1_000 + 61_000)).toBeNull();
    const [iv, tag, data] = token.split(".");
    const flipped = `${iv}.${tag}.${data.slice(0, -2)}${data.endsWith("A") ? "B" : "A"}${data.slice(-1)}`;
    expect(unseal(flipped, SECRET, 2_000)).toBeNull();
    expect(unseal(token, "y".repeat(48), 2_000)).toBeNull();
    expect(unseal("garbage", SECRET)).toBeNull();
    expect(unseal(undefined, SECRET)).toBeNull();
  });
});

describe("Standard Webhooks signature (Supabase Auth hooks)", () => {
  const key = Buffer.from("k".repeat(32));
  const secret = `v1,whsec_${key.toString("base64")}`;
  const body = '{"user":{"phone":"231770000001"},"sms":{"otp":"123456"}}';
  const sign = (id: string, ts: number, raw: string) =>
    `v1,${createHmac("sha256", key).update(`${id}.${ts}.${raw}`).digest("base64")}`;

  it("accepts a valid signature", () => {
    const ts = 1_760_000_000;
    expect(
      verifyStandardWebhook(
        secret,
        { id: "msg_1", timestamp: String(ts), signature: sign("msg_1", ts, body) },
        body,
        ts,
      ),
    ).toBe(true);
  });

  it("accepts when one of several signatures matches (key rotation)", () => {
    const ts = 1_760_000_000;
    const signature = `v1,AAAA ${sign("msg_1", ts, body)}`;
    expect(verifyStandardWebhook(secret, { id: "msg_1", timestamp: String(ts), signature }, body, ts)).toBe(true);
  });

  it("rejects a modified body, wrong id, old timestamp or missing headers", () => {
    const ts = 1_760_000_000;
    const signature = sign("msg_1", ts, body);
    expect(verifyStandardWebhook(secret, { id: "msg_1", timestamp: String(ts), signature }, `${body} `, ts)).toBe(
      false,
    );
    expect(verifyStandardWebhook(secret, { id: "msg_2", timestamp: String(ts), signature }, body, ts)).toBe(false);
    expect(verifyStandardWebhook(secret, { id: "msg_1", timestamp: String(ts), signature }, body, ts + 301)).toBe(
      false,
    );
    expect(verifyStandardWebhook(secret, { id: null, timestamp: String(ts), signature }, body, ts)).toBe(false);
  });
});
