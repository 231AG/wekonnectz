#!/usr/bin/env node
// Creates the FIRST SUPER_ADMIN staff account (spec §7, owner task T-07). Run once, by the owner.
//
//   node scripts/create-first-admin.mjs --email you@example.com [--env-file .env.production.local]
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, from the environment or the env file
// (default .env.local). The password is typed into a hidden prompt — it is never an argument, never
// printed and never logged. The database refuses if a SUPER_ADMIN already exists; later staff are
// created by a SUPER_ADMIN in the console (Phase 10). After this, sign in at /admin/login and set up
// an authenticator app.
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

import { createClient } from "@supabase/supabase-js";

const { values } = parseArgs({
  options: { email: { type: "string" }, "env-file": { type: "string", default: ".env.local" } },
});

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function loadEnv(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, "")];
      }),
  );
}

/** Reads a line without echoing it. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.includes(question)) process.stdout.write(question);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const email = values.email?.trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("Pass --email with the new admin's email address.");

const env = { ...loadEnv(values["env-file"]), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  fail(`NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (environment or ${values["env-file"]}).`);
}
if (!process.stdin.isTTY) fail("Run this in a terminal: the password is typed into a hidden prompt.");

const password = await askHidden("New admin password (12+ characters, upper and lower case, a digit): ");
if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
  fail("Password too weak: use 12+ characters with upper and lower case letters and a digit.");
}
if ((await askHidden("Repeat the password: ")) !== password) fail("The passwords don't match.");

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (createError || !created.user) fail(`Could not create the account: ${createError?.message ?? "unknown error"}`);

const { error: roleError } = await admin.rpc("bootstrap_super_admin", { p_user_id: created.user.id });
if (roleError) {
  // Leave nothing half-made behind.
  await admin.auth.admin.deleteUser(created.user.id);
  fail(
    roleError.message.includes("SUPER_ADMIN_EXISTS")
      ? "A SUPER_ADMIN already exists. Further staff are created from the admin console."
      : `Could not make the account a SUPER_ADMIN: ${roleError.message}`,
  );
}

console.log(`✓ SUPER_ADMIN created for ${email}.`);
console.log("  Next: open /admin/login, sign in, and scan the QR code with an authenticator app.");
