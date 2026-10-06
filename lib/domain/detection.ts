/**
 * Contact-detail and price detection (spec §17, BR-31, owner decision OD-31). Pure: no Next.js or
 * Supabase imports, so the mobile apps can reuse it.
 *
 * Two modes:
 * - "profile"      — bios, display names and first message requests. Phone numbers, links, social
 *                    handles, contact terms, prices and money requests are all REJECTED.
 * - "conversation" — messages in an accepted chat. Phone numbers and handles are fine; only prices,
 *                    payment terms and money requests are FLAGGED (delivered, then reviewed).
 *
 * Term lists come from app_settings `detection.terms` so moderators can update them. Patterns for
 * phone numbers, links and handles are built in here.
 */

export type DetectionTerms = {
  contact: string[];
  price: string[];
  money_request: string[];
};

export type DetectionCategory = "PHONE" | "LINK" | "HANDLE" | "CONTACT_TERM" | "PRICE" | "MONEY_REQUEST";
export type DetectionMode = "profile" | "conversation";

export type DetectionResult = {
  /** Profile mode: the text must be refused. */
  blocked: boolean;
  /** Conversation mode: deliver, but send to the moderation queue. */
  flagged: boolean;
  categories: DetectionCategory[];
};

/** Neutral message shown when a profile text is refused (§17). Never says which check matched. */
export const CONTACT_OR_PRICE_MESSAGE = "Contact details and prices aren’t allowed.";

const NUMBER_WORDS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

/** Lower-case, Unicode-normalised, with look-alike characters folded. */
export function normalizeForDetection(text: string): string {
  return (
    text
      .normalize("NFKC")
      .toLowerCase()
      // Zero-width and directional characters used to split words.
      .replace(/[​-‏⁠﻿]/g, "")
      // Fancy quotes and dashes.
      .replace(/[‘’]/g, "'")
      .replace(/[‐-―]/g, "-")
  );
}

/** "w h a t s a p p", "w.h.a.t.s.a.p.p" → "whatsapp" (runs of 4+ single letters). */
function collapseSpacedLetters(text: string): string {
  return text.replace(/\b(?:[a-z][\s._*-]+){3,}[a-z]\b/g, (run) => run.replace(/[\s._*-]+/g, ""));
}

/** Digits with letters standing in for them (o→0, l/i→1) and spelled-out digits, for phone checks. */
function digitView(text: string): string {
  let t = text.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/g, (w) => NUMBER_WORDS[w]);
  // Letters that sit between digits are almost always disguised digits: 077o123456, 0770l23456.
  for (let i = 0; i < 2; i += 1) {
    t = t
      .replace(/(\d[\s.\-()/_*]*)[o](?=[\s.\-()/_*]*\d)/g, "$10")
      .replace(/(\d[\s.\-()/_*]*)[li](?=[\s.\-()/_*]*\d)/g, "$11");
  }
  return t;
}

const PHONE = /\+?\d(?:[\s.\-()/_*]*\d){6,}/;
const LINK = [
  /\bhttps?:\/\//,
  /\bwww\s*\./,
  /\b(?:wa\.me|t\.me|bit\.ly|tinyurl|linktr\.ee)\b/,
  /\b[a-z0-9-]{2,}\s*(?:\.|\(dot\)|\[dot\]|\sdot\s)\s*(?:com|net|org|lr|me|io|co|ly|app|link|info|biz|xyz|gg|tv|online|site)\b/,
];
const HANDLE = /(?:^|[\s(])@[a-z0-9_.]{2,}/;

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whole-word / whole-phrase match. Boundaries are letters only, so currency stuck to a number still
 * matches ("500lrd") while words that merely contain a term don't ("cashier"). Symbol-only terms
 * like "$" match anywhere.
 */
function containsTerm(haystack: string, term: string): boolean {
  const t = normalizeForDetection(term).trim();
  if (!t) return false;
  if (!/[a-z0-9]/.test(t)) return haystack.includes(t);
  const startsWord = /^[a-z0-9]/.test(t);
  const endsWord = /[a-z0-9]$/.test(t);
  const pattern = `${startsWord ? "(?<![a-z])" : ""}${escapeRegExp(t).replace(/\s+/g, "\\s+")}${endsWord ? "(?![a-z])" : ""}`;
  return new RegExp(pattern).test(haystack);
}

export function detect(text: string, mode: DetectionMode, terms: DetectionTerms): DetectionResult {
  const base = normalizeForDetection(text);
  const views = [base, collapseSpacedLetters(base)];
  const categories = new Set<DetectionCategory>();

  if (PHONE.test(digitView(base))) categories.add("PHONE");
  for (const v of views) {
    if (LINK.some((re) => re.test(v))) categories.add("LINK");
    if (HANDLE.test(v)) categories.add("HANDLE");
    if (terms.contact.some((t) => containsTerm(v, t))) categories.add("CONTACT_TERM");
    if (terms.price.some((t) => containsTerm(v, t))) categories.add("PRICE");
    if (terms.money_request.some((t) => containsTerm(v, t))) categories.add("MONEY_REQUEST");
  }

  const found = [...categories];
  if (mode === "profile") return { blocked: found.length > 0, flagged: false, categories: found };

  // OD-31: in accepted conversations only prices, payment terms and money requests are flagged.
  const money = found.filter((c) => c === "PRICE" || c === "MONEY_REQUEST");
  return { blocked: false, flagged: money.length > 0, categories: money };
}

/** True when the text contains a link (used by the Phase 6 send rule: no links in chat, §14). */
export function containsLink(text: string): boolean {
  const base = normalizeForDetection(text);
  return [base, collapseSpacedLetters(base)].some((v) => LINK.some((re) => re.test(v)));
}
