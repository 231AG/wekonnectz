# Security

Spec v3 §22 and §6, plus how this codebase implements them. Update with every phase.

## The request-flow rule

```
CLIENT -> SERVER ACTION / ROUTE -> AUTHENTICATE -> AUTHORIZE -> BUSINESS RULE -> DB / STORAGE
Never:  CLIENT -> "if (isPremium) showPhoto()"   <- this is not security
```

Entitlements (Casual access, verification, role, availability) are decided on the server from the
database. The rules that matter most also live inside Postgres functions, so a hand-crafted request
with a valid member JWT cannot skip them (plan §1.2).

## Requirements (§22) and status

| Area             | Requirement                                                                                                      | Status                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorization    | RLS on every table + server-side entitlement checks; pgTAP proves cross-user denial                              | Guard test enforces RLS + ≥1 policy on every public table (Phase 0). Per-table tests from Phase 1.                                                        |
| Secrets          | Service-role key and provider secrets only in `server-only` modules and Edge Function env; never `NEXT_PUBLIC_*` | `scripts/check-client-bundle.mjs` scans the built client bundle for secret names, `sb_secret_` keys, service_role JWTs and env secret values. Runs in CI. |
| Storage          | Private buckets, short-TTL signed URLs, paths never sent to clients                                              | Phase 3                                                                                                                                                   |
| Uploads          | Magic bytes, size limits, re-encode, EXIF strip, rate limit                                                      | Phase 3 / 7                                                                                                                                               |
| Webhooks         | Signature, raw-body log, idempotent on event id, replay protection                                               | Phase 7b                                                                                                                                                  |
| Payment evidence | Private bucket, reviewer-only signed URLs, every view audited, SHA-256                                           | Phase 7                                                                                                                                                   |
| Rate limits      | OTP per phone and per IP; requests, likes, reports, uploads per user per day                                     | Phase 1 onward                                                                                                                                            |
| Staff            | Separate accounts, MFA (aal2 checked in the DB), role checks on every admin route/action, audited                | Phase 3                                                                                                                                                   |
| Privacy          | No precise location; PII out of logs/analytics; export + deletion                                                | Sentry scrubber (Phase 0); export/deletion Phase 10                                                                                                       |
| Headers          | CSP, HSTS, X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin                                 | Baseline in `lib/security/headers.ts` (Phase 0). Nonce-based CSP in Phase 12.                                                                             |
| Backups          | PITR or daily backups; restore tested before launch                                                              | Phase 12 (needs T-08)                                                                                                                                     |

## Phase 0 controls in detail

- **Deny by default**: Supabase grants `anon`/`authenticated` every table privilege and EXECUTE on every function by default, and RLS does not cover TRUNCATE. The foundation migration changes the defaults so new public tables, sequences and functions grant **nothing** to client roles (PUBLIC's function EXECUTE is revoked globally for `postgres`-owned functions). Each later migration grants exactly what it needs. Guard tests create probe objects and fail if a client role can reach them, and fail if any public function is executable by `anon`/`authenticated` without being on an explicit allow-list.
- **Audit log** is append-only for every API role (`anon`, `authenticated`, `service_role`): UPDATE/DELETE/TRUNCATE are blocked by triggers and privileges. Only `audit()` writes. It is not callable from the API (not even with the service-role key), requires an authenticated actor (`actor_id NOT NULL`), and rejects PII keys in `metadata`.
- **Known limitation — database owner**: the `postgres` owner role can disable triggers or set `session_replication_role = replica` and so alter audit rows. Supabase cannot prevent this. Mitigations: nobody uses the owner role from the app; dashboard/SQL access is limited to the owner; Phase 12 adds an off-database export (or hash chain) of audit rows so tampering is detectable.
- **Settings** with an undecided value raise on read (`get_setting()`), so no invented number can silently reach business logic (§6 rule 9).
- **Error reporting**: `lib/observability/scrub.ts` drops request bodies, cookies, headers (IP, referer), env and query strings; strips query strings from request and breadcrumb URLs; keeps user id only; masks phone numbers, dates and storage paths in every string (UUIDs kept); drops message text, bios and notes by key. Breadcrumbs other than navigation are discarded. Sentry is disabled until a DSN exists.
- **Bundle check** scans client JS/CSS (`.next/static`) and prerendered HTML/RSC payloads (`.next/server/app`) for secret names, `sb_secret_` keys, service_role JWTs and the literal values of secret env vars.
- **Headers**: CSP (`frame-ancestors 'none'`, no `unsafe-eval` in production, explicit `worker-src`/`manifest-src`), HSTS 1 year with `includeSubDomains` (**no `preload`** until the production domain is settled, T-16 — preload is hard to undo), X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy (`geolocation=()` always — BR-20; `camera=(self)` for the verification selfie), COOP same-origin. `X-Powered-By` removed.
- **Known baseline gap**: production CSP still allows `'unsafe-inline'` scripts (Next.js inline bootstrap). Fixed in Phase 12 with nonces.

## Liberia-only signup (Phase 1)

The **+231 OTP is the real control**; the IP-country check is a pre-filter that VPNs defeat (plan §1.5).

| Layer                      | Where                                                              | What it enforces                                                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registration server action | `lib/auth/actions/signup.ts` → `begin_signup()`                    | Per-IP limit, request country = LR (from `x-vercel-ip-country`, trusted only on Vercel), +231, blocklist. Writes `geo_checks` (country codes only) and a single-use 10-minute geo pass. Runs **before** any OTP is requested.                                        |
| Before-user-created hook   | `hook_before_user_created()` (Postgres, runs inside Supabase Auth) | Every new user — including direct API calls with the public anon key — needs +231, a non-blocklisted number and an unused geo pass. Email-only users are allowed because public email signup is disabled; only the admin API (SUPER_ADMIN, Phase 3) can create them. |
| Send-SMS hook              | `app/api/auth/hooks/send-sms/route.ts`                             | Standard Webhooks signature (only Supabase Auth can call it), +231, per-phone hourly limit, then the SMS provider adapter. Never logs number or code.                                                                                                                |
| Auth config                | `supabase/config.toml`                                             | Phone signup on, **phone confirmations on** (a phone + password signUp still needs the OTP), email signup off, anonymous sign-in off, 60 s between OTPs.                                                                                                             |

Known limits: VPNs defeat the country check (accepted, spec §3 audit note). Off Vercel the country header is spoofable, so it is ignored unless `GEO_TRUST_HEADER=1` (tests only). On Vercel the header and `x-real-ip` are set by Vercel's edge [VERIFY T-02].

**Hosted setup must mirror local config** (T-06/T-08): enable the Phone provider with the Send-SMS hook, enable phone confirmations, disable email signup and anonymous sign-ins, register the before-user-created hook, and create the Vault secret `phone_hash_pepper` (T-24).

## Accounts (Phase 1)

- Members can read only their own `users`/`profiles` rows. Role, status and DOB are not member-writable (BR-30, BR-4).
- DOB is written once by `set_date_of_birth()`, 18+ enforced in the database, then locked; only the audited Phase 10 admin path may correct it.
- BANNED and DELETED are mirrored into `auth.users.banned_until` (now + 100 years — Supabase Auth cannot read `infinity`), so Supabase Auth refuses sign-in and token refresh. `requireMember()` also signs such sessions out.
- The age gate carries the DOB to account creation in an AES-256-GCM sealed, http-only cookie (30 min). An under-18 result is remembered on the device for 24 h. Clearing cookies resets that — accepted: the age gate cannot stop someone lying about their DOB; human review of the selfie (Phase 4) is the next check (spec §9).

## Logging rule (§6 rule 7)

Never log phone numbers, dates of birth, storage paths, selfie paths or message text — in app logs,
Sentry, analytics, audit metadata or test output.
