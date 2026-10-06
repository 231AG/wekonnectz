import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { containsLink, detect, type DetectionTerms } from "@/lib/domain/detection";

// The real seeded term list, read from the migration so the test can't drift from production.
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

const profile = (text: string) => detect(text, "profile", TERMS);
const chat = (text: string) => detect(text, "conversation", TERMS);

describe("BR-31 profile mode: contact details and prices are rejected", () => {
  it.each([
    // Phone numbers, Liberian formats and disguises
    "Call 0770123456",
    "+231 77 012 3456",
    "231-770-123-456",
    "0 7 7 0 1 2 3 4 5 6",
    "077o123456",
    "0770l23456",
    "zero seven seven zero one two three four five six",
    "(077) 012.3456",
    "my num 0880 555 123",
    // Links
    "see www.example.com",
    "https://example.lr/me",
    "wa.me/231770123456",
    "find me at musu dot com",
    "linktr.ee/musu",
    // Handles and contact terms
    "IG @musu_k",
    "WhatsApp only",
    "w h a t s a p p me",
    "W.H.A.T.S.A.P.P",
    "add me on snapchat",
    "text me on telegram",
    "my number is in my photos",
    // Prices and payment (spec §17 examples)
    "$50",
    "50 USD",
    "LD 500 for short time",
    "500lrd",
    "momo accepted",
    "per hour",
    "transport money needed",
    "orange money",
    "L$1000",
    // Money requests
    "send me money",
    "I need money for school fees",
    "lend me small",
  ])("rejects %j", (text) => {
    expect(profile(text).blocked).toBe(true);
  });

  it.each([
    "Teacher by day, jollof critic by night. Looking for something real.",
    "Graphic designer. Good food, Afrobeats and long talks. Let's chat first.",
    "I love the beach at Sinkor and church on Sundays",
    "Born in 1999, love football",
    "5 ft 7, 2 kids, 1 dog",
    "Cashier at a supermarket",
    "I rate jollof 10/10",
    "Transported by music",
    "Hold on, I'm almost there",
    "Grand Gedeh to Monrovia",
    "Looking for someone kind",
    "",
  ])("allows %j", (text) => {
    expect(profile(text)).toEqual({ blocked: false, flagged: false, categories: [] });
  });

  it("reports what matched (for moderation), never in the user message", () => {
    expect(profile("WhatsApp 0770123456").categories.sort()).toEqual(["CONTACT_TERM", "PHONE"]);
  });
});

describe("OD-31 conversation mode", () => {
  it("does NOT flag phone numbers or handles in an accepted chat", () => {
    expect(chat("Here's my number 0770123456")).toEqual({ blocked: false, flagged: false, categories: [] });
    expect(chat("Add me on WhatsApp, @musu")).toEqual({ blocked: false, flagged: false, categories: [] });
  });

  it.each(["It's $50 for short time", "send me money for transport", "500 LD", "pay me first", "momo me"])(
    "flags price / payment / money request %j (delivered, not blocked)",
    (text) => {
      const r = chat(text);
      expect(r.blocked).toBe(false);
      expect(r.flagged).toBe(true);
      expect(r.categories.every((c) => c === "PRICE" || c === "MONEY_REQUEST")).toBe(true);
    },
  );

  it("does not flag ordinary chat", () => {
    expect(chat("Mostly old-school highlife. You?").flagged).toBe(false);
  });
});

describe("containsLink (§14 no links in chat)", () => {
  it.each(["www.x.com", "http://a.b", "go to example dot com", "t.me/someone"])("detects %j", (t) => {
    expect(containsLink(t)).toBe(true);
  });
  it.each(["see you at 7.30", "ok.bye", "Monrovia"])("ignores %j", (t) => {
    expect(containsLink(t)).toBe(false);
  });
});
