#!/usr/bin/env node
// Spec §6 rule 3 / §22 Secrets: no service-role key or other secret may reach browser JavaScript.
// Scans everything the browser can download (.next/static) after `next build`. Prints file names
// only, never the matched value.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = ".next/static";
const FORBIDDEN_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "PHONE_HASH_PEPPER",
  "SENTRY_AUTH_TOKEN",
  "SMS_API_SECRET",
];
const SECRET_KEY_PREFIX = /\bsb_secret_[A-Za-z0-9_-]{10,}/;
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;

// Literal secret values from the environment, if present (CI exports the local Supabase keys).
const secretValues = ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "PHONE_HASH_PEPPER"]
  .map((name) => process.env[name])
  .filter((v) => typeof v === "string" && v.length >= 16);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(js|mjs|json|html|css|map)$/.test(entry)) yield path;
  }
}

let files = 0;
const problems = [];
try {
  statSync(ROOT);
} catch {
  console.error(`check-client-bundle: ${ROOT} not found. Run \`pnpm build\` first.`);
  process.exit(2);
}

for (const file of walk(ROOT)) {
  files += 1;
  const text = readFileSync(file, "utf8");
  for (const name of FORBIDDEN_NAMES) if (text.includes(name)) problems.push(`${file}: contains the name ${name}`);
  if (SECRET_KEY_PREFIX.test(text)) problems.push(`${file}: contains an sb_secret_ key`);
  for (const value of secretValues)
    if (text.includes(value)) problems.push(`${file}: contains a secret value from env`);
  for (const match of text.matchAll(JWT)) {
    try {
      const payload = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
      if (payload.role === "service_role") problems.push(`${file}: contains a service_role JWT`);
    } catch {
      // Not a decodable JWT payload; ignore.
    }
  }
}

if (problems.length) {
  console.error(`check-client-bundle: FAILED (${problems.length} problem(s))`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check-client-bundle: OK — ${files} client files scanned, no secrets found.`);
