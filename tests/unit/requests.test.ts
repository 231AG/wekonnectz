import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { detect, type DetectionTerms } from "@/lib/domain/detection";
import { poolFiltersSchema, requestSchema } from "@/lib/validation/requests";

const sql = readFileSync(
  new URL("../../supabase/migrations/20261007000000_profile_onboarding.sql", import.meta.url),
  "utf8",
);
function termList(name: keyof DetectionTerms): string[] {
  const block = sql.match(new RegExp(`'${name}', jsonb_build_array\\(([\\s\\S]*?)\\)`))?.[1];
  if (!block) throw new Error(`term list ${name} not found in migration`);
  return [...block.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
}
const TERMS: DetectionTerms = {
  contact: termList("contact"),
  price: termList("price"),
  money_request: termList("money_request"),
};
const ID = "11111111-1111-4111-8111-111111111111";

describe("message requests (spec §14)", () => {
  it("are 1–300 characters, trimmed", () => {
    expect(requestSchema.parse({ recipientId: ID, body: "  Hi there  " }).body).toBe("Hi there");
    expect(requestSchema.safeParse({ recipientId: ID, body: "   " }).success).toBe(false);
    expect(requestSchema.safeParse({ recipientId: ID, body: "a".repeat(300) }).success).toBe(true);
    expect(requestSchema.safeParse({ recipientId: ID, body: "a".repeat(301) }).success).toBe(false);
    expect(requestSchema.safeParse({ recipientId: "not-an-id", body: "Hi" }).success).toBe(false);
  });

  it("BR-31: contact details and prices in a request are refused (profile mode)", () => {
    expect(detect("Call me on 0770 123 456", "profile", TERMS).blocked).toBe(true);
    expect(detect("Add me on insta @musu_lr", "profile", TERMS).blocked).toBe(true);
    expect(detect("Short time $20", "profile", TERMS).blocked).toBe(true);
    expect(detect("Hey, saw we both love live music. Fancy a chat?", "profile", TERMS).blocked).toBe(false);
  });
});

describe("Available Now filters (spec §13)", () => {
  it("accept only known values", () => {
    expect(poolFiltersSchema.safeParse({ window: "tonight", minAge: "24", maxAge: "32" }).success).toBe(true);
    expect(poolFiltersSchema.safeParse({ window: "forever" }).success).toBe(false);
    expect(poolFiltersSchema.safeParse({ minAge: "17" }).success).toBe(false);
    expect(poolFiltersSchema.safeParse({ area: "Sinkor" }).success).toBe(false);
  });
});
