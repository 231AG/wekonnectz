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

| Layer                      | Where                                                                | What it enforces                                                                                                                                                                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth config                | `supabase/config.toml`                                               | **No public signup of any kind** (`[auth] enable_signup = false`). Members cannot be created through the public API, with or without a password. Anonymous sign-in off. 60 s between OTPs.                                                                                                                |
| Registration server action | `lib/auth/actions/signup.ts` → `begin_signup()` → admin `createUser` | Per-IP limit, request country = LR (from `x-vercel-ip-country`, trusted only on Vercel), +231, blocklist. Writes `geo_checks` (country codes only) and a single-use 10-minute geo pass, then creates the account server-side and requests the OTP. Runs **before** any OTP is sent.                       |
| Before-user-created hook   | `hook_before_user_created()`                                         | Defence in depth for every user creation (including the admin API): +231, not blocklisted, unused geo pass. Email-only users are allowed: only SUPER_ADMIN creates them (Phase 3).                                                                                                                        |
| Password hook              | `hook_password_verification_attempt()`                               | Members (`role = USER`) can never sign in with a password, even if one is set. Staff can (then TOTP).                                                                                                                                                                                                     |
| Send-SMS hook              | `app/api/auth/hooks/send-sms/route.ts`                               | Standard Webhooks signature, each message processed once (replays refused; a failed delivery releases its id so a retry still sends), destination must be the account's own number (no SMS to a new number), +231 only, per-phone hourly limit, then the SMS provider adapter. Never logs number or code. |
| Phone change               | `guard_auth_phone_change()` trigger on `auth.users`                  | Phone numbers cannot be changed in the MVP; a change would bypass BR-2/BR-3.                                                                                                                                                                                                                              |

**Account possession.** The server creates the account already "confirmed" so Auth can send a login code. Nobody gets a session without the OTP, and passwords are refused for members, so an account created by someone typing another person's number is useless to them. It stays PENDING with no date of birth. (Cleanup of never-used accounts: Phase 10.)

**Known limits.**

- VPNs defeat the country check (accepted, spec §3 audit note).
- Off Vercel the country header is spoofable, so it is ignored unless `GEO_TRUST_HEADER=1` (tests only). The dev fallback `DEV_GEO_COUNTRY` is ignored in production builds.
- On Vercel, `x-vercel-ip-country` and `x-real-ip` are set by Vercel's edge [VERIFY T-02].
- Anyone can ask Supabase Auth directly to text a code to an **existing** member's number. Each request is limited per phone (our hook) and by Supabase's per-IP limits. Repeated requests can still use up a member's hourly limit. Mitigation: Cloudflare Turnstile CAPTCHA on Auth (owner task T-25, recommended before launch).
- Server-side OTP calls reach Supabase Auth from the server's IP, so Supabase's own per-IP limits apply to all users together. Our own per-IP limit (real client IP) is the effective one. Supabase's global limits (`sms_sent` per hour, `sign_in_sign_ups`) must be sized for launch traffic (T-19).

**Hosted setup must mirror local config** (T-06/T-08):

- Disable signups.
- Enable the Phone provider with the Send-SMS hook.
- Register the before-user-created and password-verification hooks.
- Disable anonymous sign-ins.
- Create the Vault secret `phone_hash_pepper` (T-24).

## Accounts (Phase 1)

- Members can read only their own `users`/`profiles` rows. Role, status and DOB are not member-writable (BR-30, BR-4).
- DOB is written once by `set_date_of_birth()`, 18+ enforced in the database, then locked; only the audited Phase 10 admin path may correct it.
- BANNED and DELETED are mirrored into `auth.users.banned_until` (now + 100 years — Supabase Auth cannot read `infinity`) and **all their sessions are deleted**, so refresh fails at once. An access token issued earlier stays valid until it expires (≤ 1 h), so member writes and RPCs also check `current_user_can_act()` in the database, and `requireMember()` sends such sessions to sign-out.
- The age gate carries the DOB to account creation in an AES-256-GCM sealed, http-only cookie (30 min). An under-18 result is remembered on the device for 24 h. Clearing cookies resets that — accepted: the age gate cannot stop someone lying about their DOB; human review of the selfie (Phase 4) is the next check (spec §9).

## Content checks and profile writes (Phase 2)

- The detection engine (`lib/domain/detection.ts`) runs in server actions. In **profile mode** (bios, display names, first message requests) any phone number, link, handle, contact term, price or money request is rejected with the neutral message "Contact details and prices aren’t allowed." (§17). It never says which check matched. **Conversation mode** (OD-31) flags only prices, payment terms and money requests.
- The term lists live in `app_settings.detection.terms` (moderators update them; Phase 10 adds the screen). If the setting is missing, content is refused rather than accepted unchecked.
- **Write pattern.** Profile fields are never member-writable through the API. A server action:
  1. authenticates (`requireMember`);
  2. validates with the shared Zod schema;
  3. runs detection;
  4. calls a `service_role`-only database function with the member's own id from the session.

  The function re-checks the account state (PENDING/ACTIVE only) and every rule SQL can enforce (lengths, ≥3 active interests, area from the list, current document versions, step order).

## Photos and private storage (Phase 3)

- **Buckets.** `photos-quarantine`, `photos`, `verification`, `payment-evidence` — all private (a pgTAP guard fails if any bucket is public). No storage policy exists for `anon` or `authenticated`, so members can't list, read or write any object directly, their own included. Only the server (service role, `server-only` modules) touches storage.
- **Upload pipeline (§11).** `begin_photo_upload()` reserves a slot (max 6, rate limit `photos.max_uploads_per_hour`, members only, steps 4–8 done) → the server signs an upload URL for `photos-quarantine/<user>/<photo>` (bucket limit 10 MB, JPEG/PNG/WebP) → the browser uploads → the server reads the file back and `processPhoto()` checks magic bytes and size, decodes it (pixel limit against decompression bombs, first frame only), applies the orientation, resizes to 1600 px and re-encodes to WebP **with no metadata** (EXIF, GPS, XMP, ICC — BR-12) → stored at `photos/<user>/<photo>.webp`, `PENDING_REVIEW`. The quarantine copy is deleted in every outcome. Paths are built from the session's user id, never from client input.
- **Reads (BR-11, rule 5).** Paths never leave `lib/storage/photos.ts`. Members get 120-second signed URLs for their own photos; staff get signed URLs only for photos still `PENDING_REVIEW`, after `requireStaff()`. `photos_for_viewer()` / `can_view_profile()` decide who sees whose photos (owner; otherwise both ACTIVE and APPROVED photos only — OD-3 = A). Phase 5 adds blocks.
- **Known gaps.** A signed upload URL stays valid for 2 hours (Supabase default); after its slot is finished or aborted, a re-upload with the same token can only recreate a quarantine object nobody reads. A clean-up job for abandoned quarantine objects is planned with the other scheduled jobs (Phase 12).

## Staff accounts and the admin console (Phase 3)

- **Separate accounts (§7).** Staff accounts are email + password + TOTP (OD-27). Members have no password (the password-verification hook and a database trigger refuse one) and are sent away from `/admin`; staff are sent away from the member app.
- **MFA everywhere.** `requireStaff()` checks the role from the database and the session's assurance level (`aal2`) on every console page and action; every staff database function checks `is_staff()` (role + `aal2` claim in the JWT) again, so a page that forgot the check still can't read or change anything. A password-only (aal1) session gets `NOT_STAFF` from every staff function.
- **First admin.** `pnpm admin:create-first` creates the first SUPER_ADMIN from a hidden password prompt; `bootstrap_super_admin()` refuses if one exists and only accepts a fresh email-only account (never a member). It writes `ADMIN_CREATED` to the audit log.
- **Audit (BR-34).** `review_photo()` writes `PHOTO_APPROVED` / `PHOTO_REJECTED` with the reason in the same transaction; metadata holds ids and the reason code only, never paths.
- **Hosted settings to match `supabase/config.toml`:** Email provider on, sign-ups off; TOTP MFA on; minimum password length 12 with upper, lower and digits. Supabase's own per-IP rate limits apply to password and MFA attempts.

## Logging rule (§6 rule 7)

Never log phone numbers, dates of birth, storage paths, selfie paths or message text — in app logs,
Sentry, analytics, audit metadata or test output.
