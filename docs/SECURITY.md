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

- **Table privileges**: Supabase grants `anon`/`authenticated` every privilege by default, and RLS does not apply to TRUNCATE, REFERENCES or TRIGGER. The foundation migration revokes those three from client roles **by default for all future tables**, and revokes everything from clients on `app_settings` and `audit_logs`. A pgTAP guard fails if any public table gives a client role TRUNCATE/REFERENCES/TRIGGER.
- **Audit log** is append-only for every API role (`anon`, `authenticated`, `service_role`): UPDATE/DELETE/TRUNCATE are blocked by triggers and privileges. Only `audit()` writes. It is not callable from the API (not even with the service-role key), requires an authenticated actor (`actor_id NOT NULL`), and rejects PII keys in `metadata`.
- **Known limitation — database owner**: the `postgres` owner role can disable triggers or set `session_replication_role = replica` and so alter audit rows. Supabase cannot prevent this. Mitigations: nobody uses the owner role from the app; dashboard/SQL access is limited to the owner; Phase 12 adds an off-database export (or hash chain) of audit rows so tampering is detectable.
- **Settings** with an undecided value raise on read (`get_setting()`), so no invented number can silently reach business logic (§6 rule 9).
- **Error reporting**: `lib/observability/scrub.ts` drops request bodies, cookies, headers (IP, referer), env and query strings; strips query strings from request and breadcrumb URLs; keeps user id only; masks phone numbers, dates and storage paths in every string (UUIDs kept); drops message text, bios and notes by key. Breadcrumbs other than navigation are discarded. Sentry is disabled until a DSN exists.
- **Bundle check** scans client JS/CSS (`.next/static`) and prerendered HTML/RSC payloads (`.next/server/app`) for secret names, `sb_secret_` keys, service_role JWTs and the literal values of secret env vars.
- **Headers**: CSP (`frame-ancestors 'none'`, no `unsafe-eval` in production, explicit `worker-src`/`manifest-src`), HSTS 1 year with `includeSubDomains` (**no `preload`** until the production domain is settled, T-16 — preload is hard to undo), X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy (`geolocation=()` always — BR-20; `camera=(self)` for the verification selfie), COOP same-origin. `X-Powered-By` removed.
- **Known baseline gap**: production CSP still allows `'unsafe-inline'` scripts (Next.js inline bootstrap). Fixed in Phase 12 with nonces.

## Liberia-only signup

See `docs/plan/MASTER_PLAN.md` §1.5. The +231 OTP is the real control; the IP-country check is a
pre-filter that VPNs defeat. Auth hooks require a single-use geo pass so direct API calls cannot
skip the pre-filter.

## Logging rule (§6 rule 7)

Never log phone numbers, dates of birth, storage paths, selfie paths or message text — in app logs,
Sentry, analytics, audit metadata or test output.
