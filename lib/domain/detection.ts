/**
 * Contact-detail and price detection (spec §17, BR-31, owner decision OD-31). Pure: no Next.js or
 * Supabase imports, so the mobile apps can reuse it.
 *
 * Modes:
 * - "profile"      — bios and first message requests. Phone numbers, links, social handles, contact
 *                    terms, prices and money requests are all REJECTED.
 * - "name"         — display names. Contact checks only (phone, link, handle, contact terms): money
 *                    words in names are too often real names ("Momo").
 * - "conversation" — messages in an accepted chat. Phone numbers and handles are fine; only prices,
 *                    payment terms and money requests are FLAGGED (delivered, then reviewed).
 *
 * The text is looked at through several normalised "views" so disguises don't work: Unicode digits
 * and look-alike letters are folded, spelled-out digits and filler words between digits are turned
 * into digits, punctuation inside words is dropped, and leetspeak is undone for contact names.
 * Ambiguous words ("momo", "transport", "LD", "dollars") only count next to numbers or money words.
 *
 * Editable term lists come from app_settings `detection.terms`; the patterns below are built in.
 */

export type DetectionTerms = {
  contact: string[];
  price: string[];
  money_request: string[];
};

export type DetectionCategory = "PHONE" | "LINK" | "HANDLE" | "CONTACT_TERM" | "PRICE" | "MONEY_REQUEST";
export type DetectionMode = "profile" | "name" | "conversation";

export type DetectionResult = {
  /** Profile and name modes: the text must be refused. */
  blocked: boolean;
  /** Conversation mode: deliver, but send to the moderation queue. */
  flagged: boolean;
  categories: DetectionCategory[];
};

/** Neutral message shown when a profile text is refused (§17). Never says which check matched. */
export const CONTACT_OR_PRICE_MESSAGE = "Contact details and prices aren’t allowed.";

/** Texts are analysed up to this length. Callers cap inputs far below it; this bounds regex work. */
export const MAX_DETECTION_LENGTH = 5000;

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/** Cyrillic and Greek letters that look like Latin ones. */
const CONFUSABLES: Record<string, string> = {
  а: "a",
  в: "b",
  е: "e",
  ё: "e",
  к: "k",
  м: "m",
  н: "h",
  о: "o",
  р: "p",
  с: "c",
  т: "t",
  у: "y",
  х: "x",
  і: "i",
  ї: "i",
  ј: "j",
  ѕ: "s",
  ԁ: "d",
  ӏ: "l",
  һ: "h",
  ԛ: "q",
  ԝ: "w",
  α: "a",
  β: "b",
  ε: "e",
  η: "n",
  ι: "i",
  κ: "k",
  μ: "u",
  ν: "v",
  ο: "o",
  ρ: "p",
  σ: "s",
  ς: "s",
  τ: "t",
  υ: "u",
  χ: "x",
  ω: "w",
};

/** Any Unicode decimal digit (Arabic-Indic, Devanagari, …) → ASCII. Digit blocks are runs of ten. */
function asciiDigit(ch: string): string {
  const cp = ch.codePointAt(0)!;
  let start = cp;
  while (start - 1 >= 0 && /\p{Nd}/u.test(String.fromCodePoint(start - 1)) && cp - start < 50) start -= 1;
  return String((cp - start) % 10);
}

export function normalizeForDetection(text: string): string {
  let t = text.slice(0, MAX_DETECTION_LENGTH).normalize("NFKC").toLowerCase();
  t = t
    // Emoji keycaps (0️⃣), variation selectors and other combining marks.
    .replace(/[⃣︎️]/g, "")
    .replace(/\p{M}/gu, "")
    // Zero-width and directional characters used to split words.
    .replace(/[​-‏⁠﻿]/g, "")
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[‐-―]/g, "-");
  t = t.replace(/\p{Nd}/gu, (d) => (/[0-9]/.test(d) ? d : asciiDigit(d)));
  t = t.replace(/[Ͱ-ϿЀ-ӿԀ-ԯ]/g, (c) => CONFUSABLES[c] ?? c);
  return t;
}

/** "w h a t s a p p", "w.h.a.t.s.a.p.p", "c o m" → joined (runs of 3+ single letters). */
function collapseSpacedLetters(text: string): string {
  return text.replace(/(?<![a-z])(?:[a-z][\s._*\-/]{1,3}){2,}[a-z](?![a-z])/g, (run) =>
    run.replace(/[\s._*\-/]+/g, ""),
  );
}

/**
 * Punctuation inside a word dropped: "what's-app" → "whatsapp", "short-time" → "shorttime". Punctuation
 * between two digits is kept, so scores and decimals ("10/10", "175.10") stay what they are.
 */
function joinWords(text: string): string {
  return text.replace(/(?<=[a-z])['_.*|~/-]+(?=[a-z0-9])|(?<=[0-9])['_.*|~/-]+(?=[a-z])/g, "");
}

/** Leetspeak and symbol letters undone, for contact names only (never for prices). */
function unLeet(text: string): string {
  return text
    .replace(/[4@]/g, "a")
    .replace(/3/g, "e")
    .replace(/0/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/5/g, "s")
    .replace(/7/g, "t");
}

const NUMBER_WORD: Record<string, string> = {
  zero: "0",
  oh: "0",
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
const NUMBER_WORD_RUN = /(?<![a-z])(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)+(?![a-z])/g;

/** Everything turned towards digits, for phone checks. */
function digitView(text: string): string {
  // Whole runs of number words: "zerosevenseven" → "077" ("someone" is untouched).
  let t = text.replace(NUMBER_WORD_RUN, (run) =>
    run.replace(/zero|oh|one|two|three|four|five|six|seven|eight|nine/g, (w) => NUMBER_WORD[w]),
  );
  for (let i = 0; i < 3; i += 1) {
    t = t
      // A lone o / i / l touching digits is a disguised digit: "O77O I23 456", "077o i23456".
      .replace(/(?<![a-z])o(?=[^a-z0-9]{0,3}\d)|(?<=\d[^a-z0-9]{0,3})o(?![a-z])|(?<=\d)o|o(?=\d)/g, "0")
      .replace(/(?<![a-z])[il](?=[^a-z0-9]{0,3}\d)|(?<=\d[^a-z0-9]{0,3})[il](?![a-z])|(?<=\d)[il]|[il](?=\d)/g, "1")
      // Filler words between digit groups: "077 dash 012 and 3456" (separators around them folded too).
      .replace(/(?<=\d)[^a-z0-9]{0,3}(?:dash|and|then|hyphen|space|plus|comma|dot)[^a-z0-9]{0,3}(?=\d)/g, "-");
  }
  return t;
}

// ---------------------------------------------------------------------------
// Built-in patterns
// ---------------------------------------------------------------------------

/**
 * Phone numbers are found by shape, not by separators: digits that sit close together (anything up to
 * 12 characters apart, words included) form a cluster, and a cluster is a phone number when its digits
 * contain a Liberian mobile number (optionally with 231 or a leading 0) or an international number
 * written with "+". Dates, years, Bible verses, room numbers and ages don't have that shape.
 */
const LIBERIAN_MOBILE = /(?:231|0)?(?:77|88|55|33|22)\d{7}/;
const MAX_DIGIT_GAP = 12;

// Common look-alike spellings of the TLD are included ("c0m") because LINK checks don't undo leetspeak:
// doing so turns ordinary numbers into fake domains ("175.10" → "its.io").
const TLD = "(?:c[o0]m|n[e3]t|[o0]rg|lr|i[o0]|c[o0]|ly|app|link|inf[o0]|biz|xyz|gg|tv|[o0]nline|site|me)";
const LINK = [
  /(?<![a-z])https?:\/\//,
  /(?<![a-z])www\s*\./,
  /(?<![a-z])(?:wa|t)\s*\.\s*me\s*\//,
  /(?<![a-z])(?:bit\.ly|tinyurl|linktr\.ee)(?![a-z])/,
  // name.tld, name . tld, name[.]tld, name (dot) tld, name dot tld, name dotcom
  new RegExp(
    `(?<![a-z0-9])[a-z0-9-]{3,63}\\s*(?:\\.|。|,|\\[\\.\\]|\\(\\.\\)|\\(dot\\)|\\[dot\\]|\\sdot\\s|\\sdot)\\s*${TLD}(?![a-z])`,
  ),
  // email-like: kofi@gmail, kofi at gmail
  /(?<![a-z0-9])[a-z0-9._-]{2,64}\s*(?:@|\sat\s)\s*(?:gmail|yahoo|hotmail|outlook|icloud|proton|ymail)(?![a-z])/,
];

const PLATFORM = "(?:instagram|insta|ig|snapchat|snap|sc|facebook|fb|tiktok|tt|twitter|telegram|whatsapp|wa)";
const HANDLE = [
  /(?:^|[\s(:,])@[a-z0-9_.]{2,}/,
  // "IG: kofi.lib", "snap: kofi_23", "fb: kofi", "insta @kofi"
  new RegExp(`(?<![a-z])${PLATFORM}\\s*[:@=]\\s*@?[a-z0-9_.]{2,}`),
  // "ig kofi23", "snap kofi_23" — a handle-shaped word (starts with a letter or _, has a digit, _ or .)
  new RegExp(`(?<![a-z])${PLATFORM}(?![a-z])\\s+@?[a-z_](?=[a-z0-9_.]*[0-9_.])[a-z0-9_.]{2,}`),
  // "IG is kofi", "insta name kofi", "snap handle: kofi"
  new RegExp(`(?<![a-z])${PLATFORM}\\s+(?:is|name is|name|handle|id)\\s*:?\\s*@?[a-z][a-z0-9_.]{2,}`),
  // "my insta", "add me on snap", "find me on fb"
  new RegExp(
    `(?<![a-z])(?:my|add me on|find me on|follow me on|dm me on|inbox me on|reach me on)\\s+${PLATFORM}(?![a-z])`,
  ),
];

/** WhatsApp and its misspellings: watsap, wassap, whatapp, whtsapp, whatsaap (on joined/leet views). */
const WHATSAPP_FUZZY = /(?<![a-z])w+h*a*(?:t+s*|s+)a+p+s?(?![a-z])/;

const NUM_WORD =
  "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|thousand|million)";
const PRICE = [
  // currency then amount: $20, $ 20, USD50, LD500, L$ 1000, €20, £20
  /(?:\$|€|£|(?<![a-z])(?:usd|lrd|ld|us\$|l\$))\s*\d/,
  // amount then currency: 20$, 50 usd, 500lrd, 500 LD, 20 dollars, 20 bucks
  /\d\s*(?:\$|€|£|(?:usd|lrd|ld|l\$|us\$|dollars?|bucks)(?![a-z]))/,
  // 5000L (needs 3+ digits so "25 l" isn't a price)
  /(?<!\d)\d{3,}\s*l(?![a-z$])/,
  // 20/hr, 500 for the night, 50 a night
  /\d\s*\/\s*(?:hr|hour|night)(?![a-z])/,
  /\d\s*(?:for the|a|per|for a)\s+(?:night|hour)(?![a-z])/,
  // ten dollars, twenty bucks
  new RegExp(`(?<![a-z])${NUM_WORD}\\s+(?:us\\s+)?(?:dollars?|dollas?|bucks|ld|lrd|usd)(?![a-z])`),
  /\d\s*dollas?(?![a-z])/,
  // charge 50, rate: 100, price $20, fee 500 — not "rate 10/10" or "charge 4 christ"
  /(?<![a-z])(?:charge|rate|price|fee)s?\s*[:=-]?\s*(?:(?:\$|usd|lrd|ld|l\$)\s*\d|\d{2,}(?![\d\s]*\/))/,
  // momo only in a money context — it is also a common name ("I'm Momo, 25")
  /(?<![a-z])momo(?![a-z]).{0,20}\d{3}|(?<!\d)\d{3,}.{0,20}(?<![a-z])momo(?![a-z])/,
  /(?<![a-z])(?:send|pay|via|by|on|accept|accepted|accepting|my|use)\s+(?:me\s+)?(?:on\s+)?momo(?![a-z])/,
  /(?<![a-z])momo\s+(?:accepted|only|number|no|account|me)(?![a-z])/,
  // transport only as money: "transport money", "for transport", "give me transport"
  /(?<![a-z])transport(?:ation)?\s+(?:fare|money|fee|fees|cash)(?![a-z])/,
  /(?<![a-z])(?:give me|send me|send|my)\s+(?:small\s+)?transport(?![a-z])(?!\s+(?:company|ministry|business|job|work))/,
];

const MONEY_REQUEST = [
  // "I don't need money" / "not money" are not requests.
  /(?<![a-z])(?<!(?:n'?t|not|never|no)\s+)(?:send|give|lend|loan|borrow|need|want)\s+(?:me\s+)?(?:(?:some|sum|small|little|any)\s+)?money(?![a-z])/,
  /(?<![a-z])pay\s+(?:for\s+)?my\s+(?:bills?|rent|fees?|phone|school|transport|light|current|data)(?![a-z])/,
];

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const termCache = new Map<string, RegExp | null>();

/**
 * Term match with letter-only boundaries (so "500lrd" matches but "cashier" doesn't). Words of a
 * multi-word term may be joined by up to 3 punctuation characters or none ("short-time",
 * "shorttime"). Symbol-only terms like "$" match anywhere.
 */
function termRegex(term: string): RegExp | null {
  if (termCache.has(term)) return termCache.get(term)!;
  const t = normalizeForDetection(term).trim();
  let re: RegExp | null = null;
  if (t && /[a-z0-9]/.test(t)) {
    const body = t.split(/\s+/).map(escapeRegExp).join("[^a-z0-9]{0,3}");
    re = new RegExp(`${/^[a-z0-9]/.test(t) ? "(?<![a-z])" : ""}${body}${/[a-z0-9]$/.test(t) ? "(?![a-z])" : ""}`);
  }
  termCache.set(term, re);
  return re;
}

function containsTerm(haystack: string, term: string): boolean {
  const re = termRegex(term);
  if (re) return re.test(haystack);
  const t = normalizeForDetection(term).trim();
  return t.length > 0 && haystack.includes(t);
}

function isCountingRun(digits: string): boolean {
  return digits.length <= 10 && ("0123456789".includes(digits) || "9876543210".includes(digits));
}

function hasPhone(base: string): boolean {
  const view = digitView(base);
  const clusters: { digits: string; plus: boolean }[] = [];
  let current: { digits: string; plus: boolean; last: number } | null = null;
  for (let i = 0; i < view.length; i += 1) {
    if (!/\d/.test(view[i])) continue;
    if (!current || i - current.last > MAX_DIGIT_GAP) {
      if (current) clusters.push(current);
      current = { digits: "", plus: view.slice(Math.max(0, i - 2), i).includes("+"), last: i };
    }
    current.digits += view[i];
    current.last = i;
  }
  if (current) clusters.push(current);

  return clusters.some(({ digits, plus }) => {
    // "1 2 3 4 5 6 7 go" is counting, not a number.
    if (isCountingRun(digits)) return false;
    if (LIBERIAN_MOBILE.test(digits)) return true;
    // International numbers written with a plus: "+44 7700 900123".
    return plus && digits.length >= 10;
  });
}

export function detect(text: string, mode: DetectionMode, terms: DetectionTerms): DetectionResult {
  const base = normalizeForDetection(text);
  const spaced = collapseSpacedLetters(base);
  const joined = joinWords(spaced);
  const views = [base, spaced, joined];
  // Leetspeak undone for contact names and handles only ("wh4tsapp", "telegr@m") — never for links,
  // prices or phone numbers, where it would turn ordinary numbers into words.
  const contactViews = [...views, unLeet(spaced), unLeet(joined)];
  const categories = new Set<DetectionCategory>();

  if (hasPhone(base)) categories.add("PHONE");
  if (views.some((v) => LINK.some((re) => re.test(v)))) categories.add("LINK");
  if (contactViews.some((v) => HANDLE.some((re) => re.test(v)))) categories.add("HANDLE");
  if (contactViews.some((v) => WHATSAPP_FUZZY.test(v) || terms.contact.some((t) => containsTerm(v, t)))) {
    categories.add("CONTACT_TERM");
  }
  if (views.some((v) => PRICE.some((re) => re.test(v)) || terms.price.some((t) => containsTerm(v, t)))) {
    categories.add("PRICE");
  }
  if (
    views.some((v) => MONEY_REQUEST.some((re) => re.test(v)) || terms.money_request.some((t) => containsTerm(v, t)))
  ) {
    categories.add("MONEY_REQUEST");
  }

  const found = [...categories];
  if (mode === "profile") return { blocked: found.length > 0, flagged: false, categories: found };
  if (mode === "name") {
    const contact = found.filter((c) => c !== "PRICE" && c !== "MONEY_REQUEST");
    return { blocked: contact.length > 0, flagged: false, categories: contact };
  }
  // OD-31: in accepted conversations only prices, payment terms and money requests are flagged.
  const money = found.filter((c) => c === "PRICE" || c === "MONEY_REQUEST");
  return { blocked: false, flagged: money.length > 0, categories: money };
}

/** True when the text contains a link (used by the Phase 6 send rule: no links in chat, §14). */
export function containsLink(text: string): boolean {
  const base = normalizeForDetection(text);
  const spaced = collapseSpacedLetters(base);
  const joined = joinWords(spaced);
  return [base, spaced, joined].some((v) => LINK.some((re) => re.test(v)));
}
