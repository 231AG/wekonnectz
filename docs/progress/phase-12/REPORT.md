## Phase 12 — Hardening & launch: COMPLETE

### ⛔ Blockers

Nothing blocks the code. **Launch** still waits on your tasks:

- a real SMS provider (T-04);
- the production database with backups, plus one restore test (T-08, T-31);
- reviewed legal texts (T-12);
- the limit values (T-19).

### What I built

**Sign-in codes can't be guessed.**

- The code in the SMS is now our own. Supabase's code stays on our server.
- Our server checks every attempt and limits it per number and per connection.
- A new database hook refuses to open a member session unless our server approved it. A code tried directly against Supabase opens nothing.
- Staff password guessing is limited per account inside Supabase itself.

**Strict browser security.**

- Every page gets a fresh secret value, and only scripts carrying it can run. An injected script is blocked.
- Also on: HTTPS-only, no framing by other sites, and no camera or location access except the selfie camera.

**Whole-database security test.** It fails if a later change ever:

- lets the app write a table directly;
- widens what members can read;
- leaves a table unprotected;
- makes a file bucket public;
- lets anyone but Supabase call the sign-in hooks.

**Unfinished sign-ups are cleaned up.**

- An account that never went live is deleted after a set number of quiet days (your value).
- The count includes its photos and selfie.
- It only happens when nothing is waiting for review and there's no history (payments, chats, staff action).

**Speed.** Discover now loads in about 0.14 s instead of 0.7 s with 3,000 members (tested with fictional members).

**Installable app.**

- "Add to Home Screen" gives a WeKonnectz icon that opens straight to Home.
- Without signal, it shows a "You're offline" screen.
- Nothing a member sees is stored on the phone.

**Accessibility.** Automatic WCAG 2.1 AA checks ran on 44 screens (public, member and staff), and all pass now. The checks found two real problems, now fixed:

- a settings form whose field name broke the browser's own form handling;
- an invalid accessibility attribute on a staff filter link.

**Updates.**

- Security patch releases of two packages.
- The production dependency audit is clean.

**Guides.**

- `docs/DEPLOYMENT.md`: how to put the app on Vercel with a hosted Supabase project, a restore-test runbook, and how to unlock a staff account.
- The rate-limit review is in `docs/SECURITY.md`.

### Screenshots

`docs/progress/phase-12/screenshots/member-offline.png`: the offline screen. The other Phase 12 work is not visual.

### How I checked it

| Check                                                          | Result                                   |
| -------------------------------------------------------------- | ---------------------------------------- |
| Unit tests                                                     | 562 passed                               |
| Database tests                                                 | 1,096 passed, 48 of them new             |
| End-to-end tests (incl. accessibility scans)                   | 73 passed, 5 of them new                 |
| Build, lint, type and format checks; client-bundle secret scan | Clean                                    |
| Load check (`scripts/load-check.sql`, 3,000 fictional members) | Discover ≈ 140 ms, Available Now ≈ 75 ms |

One new browser test signs in the way an attacker would, straight against Supabase. Both the texted code and Supabase's real code are refused there, and the normal sign-in still works.

### Problems found and fixed during self-audit

There were 2 review rounds.

**Round 1.**

- 🔴 The new code-attempt limit could be skipped by sending guesses straight to Supabase. Fixed with our own code in the SMS and the session hook (above).
- 🟠 The staff password limit could be skipped the same way. It now lives inside Supabase's password check.
- 🟠 Cleaning up unfinished sign-ups could have deleted a member whose ban was just lifted, or someone still signed in during onboarding. Fixed: only accounts that never went live and have no history, with the quiet time counting all activity.
- Smaller fixes:
  - stricter database checks;
  - more Discover tests;
  - corrections to the guides.

**Round 2.** Confirmed the fixes and found no other way in. Also added:

- a launch check that the new hook is on;
- staff unlock steps;
- cleanup of old codes.

### Known limitations / not verified

- **Hosted Supabase isn't tested yet.** Everything ran on the local copy. The new session hook must be switched on in the hosted dashboard. If it's off, the guessing protection is off. `DEPLOYMENT.md` has a check for it.
- **Anyone who knows a member's number can use up that number's code attempts for an hour.** Anyone who knows a staff email can do the same to that staff account; the unlock steps are in `DEPLOYMENT.md`. A CAPTCHA (T-25) makes this harder.
- **Carriers in Liberia often share one internet address among many phones**, so the per-connection limit must be generous (I recommend 100 an hour).
- **The backup restore test can't run** until the production project exists (T-08 → T-31).
- **Legal pages are still placeholders** (T-12).
- **One development-only package warning** (`braces`, via the linter) has no fix yet. It never ships to users.

### Your tasks

- 🔴 **Before real members** (also listed in `DEPLOYMENT.md` → "Before real members"):
  - T-04: SMS provider.
  - T-08 and T-31: production database, then the restore test.
  - T-12: legal texts.
  - T-19: values.
- 🟠 **Optional now:** T-30, a private staging copy on Vercel. See "Can I host on Vercel now?" below.
- 🟢 **Recommended:** T-25 CAPTCHA and T-17 Sentry.
- ↪ **Carried over:**
  - T-09/T-10: areas and interests.
  - T-13/T-29: wallets and prices.
  - T-20: push keys.
  - T-27: cron secret.
  - T-28: Realtime setting.
  - OD-7, OD-13 and T-22.

### Decisions I need from you

**T-19: new values**

| Setting                        | What it controls                   | I recommend      |
| ------------------------------ | ---------------------------------- | ---------------- |
| Code attempts per number       | Wrong or right codes per hour      | 10 an hour       |
| Code attempts per connection   | Codes per internet address an hour | 100 an hour      |
| Unfinished sign-ups            | Quiet days before cleanup          | 30 days          |
| Supabase "token verifications" | Dashboard setting                  | 30 per 5 minutes |

**Sign-off on Q62–Q65:**

- Q62: the code limits.
- Q63: when unfinished sign-ups are cleaned up.
- Q64: the app opens on Home, and nothing is stored offline.
- Q65: Vercel Pro for production, with the database in London or Frankfurt.

### Can I host on Vercel now?

**Yes, as a private staging site. Not yet for members.**

**What works there today:**

- the public pages;
- the staff console (sign-in with the authenticator app, queues, users, settings);
- the security headers;
- the scheduled jobs, once `CRON_SECRET` is set.

**Members can't sign up or log in yet.** The only SMS sender built is a local test one: it refuses to run in production and can't save its codes on Vercel. Once you choose an SMS provider (T-04), I add it, and sign-up works.

**What it needs, step by step in `docs/DEPLOYMENT.md`:**

1. A Supabase project.
2. `supabase db push` to set up the database.
3. Three dashboard hooks.
4. The phone-hashing secret.
5. The environment variables in Vercel.
6. The first staff account (`pnpm admin:create-first`).

**Notes:**

- Use the **Pro** plan for production. Hobby is for non-commercial use, but fine for a private staging copy.
- Set the Vercel function region next to your Supabase region.
- Card payments stay off (`CARD_PAYMENTS_ENABLED=0`).
- Put every key in Vercel's settings, **never in chat**. Then tell me the variable names, and I'll check they're set without displaying them.

### Next

This was the last phase in the plan. After your sign-off, what's left is your launch tasks above, plus the follow-ups you choose: the real SMS adapter (once T-04 is decided), a card processor (Phase 7c, T-18), and CAPTCHA (T-25).

### Whole-app progress

109 items done, 19 in progress, 6 not started and 3 blocked (backup drill, legal, SMS-dependent checks). See `docs/progress/TODO.md`.

Reply "Approve Phase 12" (with your T-19 values), or tell me what to change.
