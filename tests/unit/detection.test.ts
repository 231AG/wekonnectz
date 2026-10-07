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
const name = (text: string) => detect(text, "name", TERMS);
const chat = (text: string) => detect(text, "conversation", TERMS);

// Every string here was a real bypass or false positive found in review (Phase 2 audit).
const MUST_BLOCK: Record<string, string[]> = {
  "phone numbers, any format": [
    "Call 0770123456",
    "+231 77 012 3456",
    "231-770-123-456",
    "0 7 7 0 1 2 3 4 5 6",
    "(077) 012.3456",
    "my num 0880 555 123",
    "77 012 345",
    "077.012.3456",
    "077,012,3456",
    "077, 012, 3456",
    "077 | 012 | 3456",
    "077~012~3456",
    "077+012+3456",
    "077#012#3456",
    "077:012:3456",
    "077/012/3456",
    "077_012_3456",
    "077*012*3456",
    "077 & 012 & 3456",
    "077-012\n3456",
    "0 7 7 0\n1 2 3\n4 5 6",
  ],
  "phone numbers, disguised": [
    "770 is my orange line, 123456",
    "770 (orange) and the rest: 123 456",
    "seven seven 0123456",
    "seven seven, 012 3456",
    "seven seven zero 123 456",
    "7 seven 0 123456",
    "zero seven seven, zero twelve, three four five six",
    "077 0 twelve 3456",
    "zero seven seven zero, twelve, thirty four, fifty six",
    "(77) 012 3456",
    "77-012-3456",
    "0 double 7 0123456",
    "zero double seven 012 3456",
    "O double 7, 012 3456",
    "+231 double 7 012 3456",
    "zero seventy-seven, zero one two, three four five six",
    "oh seventy seven 0123456",
    "zero seven seven zero, one twenty three, four fifty six",
    "077 012 34 fifty six",
    "0770 (that's my orange line) 123456",
    "077 is the start, the rest is 0123456",
    "first part 0770 second part 123456",
    "⓿❼❼⓿❶❷❸❹❺❻",
    "⓿➆➆ ⓿➀➁ ➂➃➄➅",
    "77 012 3456",
    "Family is my number one. My number is 0770123456",
    "077 x 012 x 3456",
    "077 abc 012 abc 3456",
    "077 also 012 also 3456",
    "077....012....3456",
    "077 🔥🔥 012 🔥🔥 3456",
    "077 01 2 2019",
    "088 6 12 2019",
    "0886 1 2 2019",
    "+44 7700 900123",
    "077o123456",
    "0770l23456",
    "O77O I23 456",
    "077o i23456",
    "o770123456",
    "0770 i23 456",
    "zero seven seven zero one two three four five six",
    "zerosevenseven 0123456",
    "seven7 0123 456",
    "0770 one 23456",
    "077 0123 45six",
    "oh seven seven 0123456",
    "077 dash 012 dash 3456",
    "077 and 012 and 3456",
    "077  then  012 then 3456",
    "first 077 then 0123456",
    "call me on: o seven seven, o one two, three four five six",
    "０７７０１２３４５６",
    "٠٧٧٠١٢٣٤٥٦",
    "⁰⁷⁷⁰¹²³⁴⁵⁶",
    "⓪⑦⑦⓪①②③④⑤⑥",
    "0️⃣7️⃣7️⃣0️⃣1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣",
  ],
  links: [
    "kofi dot com",
    "kofi,com",
    "kofi。com",
    "see www.example.com",
    "https://example.lr/me",
    "wa.me/231770123456",
    "find me at musu dot com",
    "linktr.ee/musu",
    "kofi[.]com",
    "kofi . c o m",
    "kofi dotcom",
    "kofi.c0m",
    "kofi .net",
    "kofi dot co dot lr",
    "kofi.lr",
    "t.me/kofi",
    "t . me/kofi",
    "Monrovia.com",
    "kofi@gmail",
    "kofi at gmail",
  ],
  "handles and contact apps": [
    "IG is kofi",
    "IG @musu_k",
    "WhatsApp only",
    "w h a t s a p p me",
    "W.H.A.T.S.A.P.P",
    "w-h-a-t-s-a-p-p",
    "what's app",
    "whats-app",
    "whats\napp",
    "watsap",
    "whatsaap",
    "wassap me",
    "whatapp",
    "whtsapp",
    "wh4tsapp",
    "whatsαpp",
    "whаtsapp",
    "w/app",
    "wapp me",
    "telegr@m",
    "tele gram",
    "text me on telegram",
    "my number is in my photos",
    "snap: kofi_23",
    "ig kofi23",
    "IG: kofi.lib",
    "fb: kofi",
    "my insta",
    "add me on snapchat",
  ],
  "prices and payment": [
    "five hundred LD",
    "20/hr",
    "20 dolla",
    "500 for the night",
    "$50",
    "50 USD",
    "LD 500 for short time",
    "500lrd",
    "momo accepted",
    "send it by momo",
    "my momo number 0770",
    "per hour",
    "transport money needed",
    "orange money",
    "L$1000",
    "500 L$",
    "USD50",
    "$ 20",
    "20$",
    "LD500",
    "100 usd",
    "Ｌ＄500",
    "＄20",
    "€20",
    "£20",
    "5000L",
    "20 dollars",
    "ten dollars",
    "20 bucks",
    "charge 50",
    "rate 100",
    "price: $20",
    "short-time",
    "shorttime",
    "5k per night",
    "orange-money",
    "lone star money",
    "cash app",
    "cashapp",
  ],
  "money requests": [
    "give some money pls",
    "send me money",
    "I need money for school fees",
    "lend me money",
    "send me sum money",
    "send small money",
    "give me money",
    "pay my rent",
  ],
};

const MUST_PASS = [
  "Cooking,music,tv",
  "Hiking,online games",
  "Born in Monrovia,LR",
  "Swimming,me time",
  "God first,family,me",
  "Food,info sessions",
  "Movies,series,tv shows",
  "Gym.Music.TV",
  "Love.Me.Love",
  "If you only want money, swipe left",
  "Don't message me if you need money",
  "Men who need money, pass",
  "Not for guys who want money",
  "I don't do men that need money",
  "You want money? Get a job",
  "22 / 175 / 2001",
  "Age, height, born: 22, 175, 2001",
  "22. 180. 2000.",
  "Scores 77, 100, 1000",
  "Psalm 22:1, Proverbs 3:5-6, John 3:16",
  "Matthew 22:37-39, 1 Cor 13:4-7",
  "33, born 1991, 5ft 11",
  "Born 22 05 1998, 5 ft 7",
  "Age 25. 5ft 5in. 55kg. Born 1999.",
  "88 kg, 188 cm, born 1988",
  "Born July 22, 1998 at 5:30am",
  "Best years: 2022, 2023, 2024",
  "Class of 2022, UL 2018-2022",
  "Grade 12, 2022 graduate, 2023 nursing",
  "Scores: 77, 88, 95, 100",
  "Love cooking, me too",
  "Mother, nurse, me",
  "Football, tv and music",
  "Music, online games and church",
  "Born in Monrovia, LR",
  "Love Liberia, LR forever",
  "Movies. TV. Food.",
  "Family. Me time. Church.",
  "Single. Me? Love music.",
  "Polka dot me",
  "Family is my number one",
  "God is my number one priority",
  "My number one fan is my mom",
  "Call me on weekends",
  "I learn fast, in a short time",
  "Come pay me a visit in Gbarnga",
  "I'm Momo, born 1999",
  "Momo, 28, 180cm",
  "Raised by Momo, my grandma",
  "I'm on Momo's team",
  "I send money home to my mum every month",
  "My mom always said: never borrow money",
  "I love to snap photos.",
  "I love to snap pics...",
  "Team captain of fb 11.",
  "I'm Momo, 25, love football",
  "Momo Kamara, 30 years",
  "I work at live music events",
  "Meet me at live shows",
  "I snap 100 photos a day",
  "fb 2019 memories",
  "I wa 25",
  "I am the sc 2 captain",
  "I need transport to church sometimes",
  "I work for transport ministry",
  "I don't need money, I need love",
  "I don't want money",
  "Ruth 1:16 1:17 1:18",
  "Room 1203 1204",
  "Rate 10/10 jollof",
  "Charge 4 Christ",
  "I weigh 175.10",
  "I am 25 l",
  "Teacher by day, jollof critic by night. Looking for something real.",
  "Graphic designer. Good food, Afrobeats and long talks. Let's chat first.",
  "I love the beach at Sinkor and church on Sundays",
  "I live in Monrovia",
  "Born in 1995",
  "Born in 1999, love football",
  "I am 5 ft 10",
  "I am 180 cm",
  "5 ft 7, 2 kids, 1 dog",
  "Sinkor, Old Road",
  "Grand Gedeh to Monrovia",
  "Cashier at a supermarket",
  "I rate jollof 10/10",
  "Rate my cooking",
  "Transported by music",
  "I work in transport logistics",
  "I'm into transportation engineering",
  "Hold on, I'm almost there",
  "Looking for someone kind",
  "I like to read the Bible John 3:16",
  "Psalm 23 1-6",
  "University of Liberia class of 2019",
  "I'm the one for you",
  "I love long time friendships",
  "I have been single a long time",
  "I live an hour from Monrovia",
  "I dance all night",
  "lend me your ear",
  "Pay my respects to my grandma",
  "I paid my own school fees",
  "My name is Imo",
  "momo is my nickname",
  "My name is Momo",
  "My ideal partner is negotiable lol",
  "I love Instagram-worthy sunsets",
  "I like snapchat filters",
  "love snapper fish",
  "I'm into dollar-store crafts",
  "I need someone who will be there, not money",
  "I watch Liberia vs Ghana 2-1",
  "I like LD (long distance)?",
  "I'm loud",
  "Phone addict lol",
  "Love the beach at 7am",
  "I was born on 12 05 1998",
  "My best year 2019 2020 2021",
  "Call me Kofi",
  "Text me back if you like jazz",
  "I can't wait till 20 25",
  "1 2 3 4 5 6 7 go",
  "Looking for something long term, I'm 25 years and 5 feet 6",
  "a.k.a. B.J.",
  "U.S.A born",
  "I.T. guy",
  "I'm a dr.me",
  "hi.me",
  "ok.so I love music",
  "Mr. Bean fan",
  "Wassup everyone",
  "Somewhat sappy about love songs",
  "whatsoever",
  "",
];

describe("BR-31 profile mode: contact details and prices are rejected", () => {
  for (const [group, texts] of Object.entries(MUST_BLOCK)) {
    it.each(texts.map((t) => t.replace(/\\n/g, "\n")))(`blocks ${group}: %j`, (text) => {
      expect(profile(text).blocked).toBe(true);
    });
  }

  it.each(MUST_PASS)("allows %j", (text) => {
    expect(profile(text)).toEqual({ blocked: false, flagged: false, categories: [] });
  });

  it("reports what matched (for moderation), never in the user message", () => {
    expect(profile("WhatsApp 0770123456").categories).toEqual(expect.arrayContaining(["CONTACT_TERM", "PHONE"]));
  });
});

describe("name mode (display names): contact checks only", () => {
  it.each(["Momo", "Momo Kamara", "Imo", "Ld", "Sia Musu"])("allows the name %j", (text) => {
    expect(name(text).blocked).toBe(false);
  });
  it.each(["IG: musu", "Kofi 0770123456", "kofi.com", "WhatsApp Kofi", "Whatsapp Musu", "@kofi"])(
    "blocks %j",
    (text) => {
      expect(name(text).blocked).toBe(true);
    },
  );
});

describe("OD-31 conversation mode", () => {
  it("does NOT flag phone numbers, handles or links in an accepted chat", () => {
    for (const text of ["Here's my number 0770123456", "Add me on WhatsApp, @musu", "my insta is kofi", "kofi.com"]) {
      expect(chat(text)).toEqual({ blocked: false, flagged: false, categories: [] });
    }
  });

  it.each([
    "It's $50 for short time",
    "send me money for transport",
    "500 LD",
    "pay me first",
    "momo me 500",
    "you owe me 20 dollars",
    "pay for my phone",
  ])("flags price / payment / money request %j (delivered, not blocked)", (text) => {
    const r = chat(text);
    expect(r.blocked).toBe(false);
    expect(r.flagged).toBe(true);
    expect(r.categories.every((c) => c === "PRICE" || c === "MONEY_REQUEST")).toBe(true);
  });

  it.each([
    "Mostly old-school highlife. You?",
    "I learn fast, in a short time",
    "Come pay me a visit in Gbarnga",
    "I send money home to my mum every month",
    "My mom always said: never borrow money",
    "Raised by Momo, my grandma",
    "Momo, 28, 180cm",
    "Don't message me if you need money",
  ])("does not flag ordinary chat %j", (text) => {
    expect(chat(text).flagged).toBe(false);
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

describe("performance (no catastrophic backtracking)", () => {
  const adversarial = [
    "1-".repeat(2500),
    "a-".repeat(2500),
    "1 ".repeat(2500),
    "a.".repeat(2500),
    "1o".repeat(2500),
    "1" + "-".repeat(5000),
    "a ".repeat(2500) + "1",
    "x".repeat(5000),
    "w".repeat(5000) + "a",
    "o".repeat(5000),
    "0 ".repeat(1000) + "o ".repeat(1000),
    "ﷺ".repeat(5000),
    "double 7 ".repeat(600),
    "seventy seven ".repeat(400),
    "❼ ".repeat(2500),
    "rate " + "1".repeat(4994) + "/",
    "fee " + "1".repeat(4995) + "/",
  ];
  it.each(adversarial.map((s, i) => [i, s] as const))("input #%i (%#) stays fast", (_i, text) => {
    const start = performance.now();
    detect(text, "profile", TERMS);
    detect(text, "conversation", TERMS);
    expect(performance.now() - start).toBeLessThan(250);
  });

  it("analyses at most MAX_DETECTION_LENGTH characters", () => {
    const start = performance.now();
    detect("1-".repeat(100_000), "profile", TERMS);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
