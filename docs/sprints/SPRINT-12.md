# Sprint 12 — Hardening & launch

**Goal:** make the app safe and ready to put online: strict headers, a whole-database security sweep, rate limits
that can't be skipped, performance at launch scale, an installable app, accessibility, and a deployment guide.

## Scope

- **Content-Security-Policy with a per-request nonce** (`proxy.ts`), `strict-dynamic`, no inline scripts; API routes
  get a locked-down policy. HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP.
- **Security sweep** (`170_security_sweep.test.sql`): no client writes (table or column), a fixed set of
  client-readable tables, RLS everywhere, empty `search_path` on SECURITY DEFINER functions, nothing executable by
  PUBLIC, no views, no Realtime tables, no storage policies, private size-limited buckets.
- **Sign-in codes checked by our server only:** the SMS carries our own code; attempts limited per phone and per
  client IP; a custom access token hook refuses member sessions our server didn't approve.
- **Staff password limit** per account inside the password hook.
- **Abandoned sign-ups** purged after a set number of idle days (owner value, T-19).
- **Performance:** set-based Discover (≈700 ms → ≈140 ms with 3,000 members, `scripts/load-check.sql`).
- **Dependencies:** patch updates, `pnpm audit --prod` clean.
- **PWA:** manifest, icons, one service worker (push + offline screen only).
- **Accessibility:** axe WCAG 2.1 A/AA checks on public, member and admin pages; fixes.
- **Deployment guide** for Vercel + hosted Supabase, backup restore drill runbook, rate-limit review.

## Out of scope / blocked

Backup restore drill (needs T-08 → T-31). Legal sign-off (T-12). Real SMS provider (T-04). CAPTCHA (T-25).

## Acceptance checklist

- [x] CSP nonce on every page, no CSP errors in e2e (all specs track console errors)
- [x] Security sweep passes (pgTAP)
- [x] Code guessing: limits per phone and IP; a code verified straight at Supabase opens no session (pgTAP + e2e)
- [x] Staff password failures limited per account in the hook (pgTAP)
- [x] Abandoned sign-ups purged only when nothing worth keeping exists (pgTAP)
- [x] Discover rewrite returns exactly the per-member rules (pgTAP) and is fast at 3,000 members (load check)
- [x] App installs; offline screen; nothing private cached (e2e)
- [x] axe: no WCAG 2.1 A/AA violations on the pages scanned (e2e)
- [x] Deployment guide, restore runbook, rate-limit table
- [ ] Owner: T-19 values (OTP attempts, abandoned days), T-08 + T-31 restore drill, T-12 legal, T-04 SMS

## Self-audit

- **Round 1** (1 HIGH, 2 MEDIUM, 12 LOW):
  - 🔴 The code-attempt limit lived only in our server action. Anyone could guess codes straight at Supabase Auth's public `/verify` endpoint. Fixed:
    - the SMS now carries our own code;
    - our server checks it, with the limits;
    - a custom access token hook refuses member sessions our server didn't approve.
  - 🟠 The staff per-account failure limit could be skipped in the same way. It now lives in the password hook.
  - 🟠 The abandoned sign-up purge could delete a member whose ban had just been lifted, or one still onboarding with a live session. It now only takes accounts that never went live and have no history, and the idle clock counts session refreshes and onboarding activity.
  - LOW fixes:
    - API responses keep the API content policy;
    - the sweep demands an empty `search_path` and checks column grants and storage policies;
    - the Discover test covers more rules;
    - several corrections to the deployment guide and the rate-limit table.
- **Round 2** (0 HIGH, 0 MEDIUM, 5 LOW): confirmed the fixes; no member path to a session without our check. Taken:
  - a launch check that the token hook is on;
  - staff lockout recovery steps;
  - stale codes cleared after an hour;
  - the sweep checks that only Supabase Auth can call the hooks.

  Noted, not changed: a tiny race in the one-minute ticket window. The attacker would need Auth's code and to beat our server by milliseconds.
