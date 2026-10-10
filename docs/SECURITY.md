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
| Webhooks         | Signature, raw-body log, idempotent on event id, replay protection                                               | Phase 7b ✅                                                                                                                                               |
| Payment evidence | Private bucket, reviewer-only signed URLs, every view audited, SHA-256                                           | Phase 7 ✅                                                                                                                                                |
| Rate limits      | OTP per phone and per IP; requests, likes, reports, uploads per user per day                                     | OTP (P1), uploads (P3), reports (P5); requests and likes later                                                                                            |
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
- **Upload pipeline (§11).** `begin_photo_upload()` reserves a slot (max 6, rate limit `photos.max_uploads_per_hour`, members only, steps 4–8 done) → the server signs an upload URL for `photos-quarantine/<user>/<photo>` (bucket limit 10 MB, JPEG/PNG/WebP) → the browser uploads → the server reads the file back and `processPhoto()` checks magic bytes and size, decodes it (pixel limit against decompression bombs, first frame only), applies the orientation, resizes to 1600 px and re-encodes to WebP **with no metadata** (EXIF, GPS, XMP, ICC — BR-12) → stored at `photos/<photo>.webp` (opaque name: a signed URL never reveals whose photo it is), `PENDING_REVIEW`. The quarantine copy is deleted in every outcome. Paths are built from the session's user id, never from client input. `claim_photo_upload()` lets only one "finish" process a slot.
- **Reads (BR-11, rule 5).** Paths never leave `lib/storage/photos.ts`. Members get 120-second signed URLs for their own photos; staff get signed URLs only for photos still `PENDING_REVIEW`, after `requireStaff()`. `photos_for_viewer()` / `can_view_profile()` decide who sees whose photos (owner; otherwise both ACTIVE and APPROVED photos only — OD-3 = A). Phase 5 adds blocks.
- **Main photo (§11).** The main photo is the first photo that is approved or in review — never a rejected or hidden one. A photo approved as a secondary photo goes back to review when it becomes the main photo, so the "face clearly visible" check can't be skipped by reordering.
- **Known gaps.** A signed upload URL stays valid for 2 hours (Supabase default, not configurable in the SDK); a re-upload with an old token only recreates a quarantine object nobody reads. Each new upload sweeps that member's stray quarantine files; a project-wide sweep for members who never return is planned with the other scheduled jobs (Phase 12).

## Staff accounts and the admin console (Phase 3)

- **Separate accounts (§7).** Staff accounts are email + password + TOTP (OD-27). Members have no password (the password-verification hook and a database trigger refuse one) and are sent away from `/admin`; staff are sent away from the member app.
- **MFA everywhere.** `requireStaff()` checks the role from the database and that the session was opened with the **password and a TOTP code** (`aal2`) on every console page and action; every staff database function checks `is_staff()` (role + `aal2` + `amr` containing both `password` and `totp`) again, so a page that forgot the check still can't read or change anything. A password-only (aal1) session gets `NOT_STAFF`.
- **Email links don't count.** Turning on the email provider for staff also turns on email magic links and email codes. A session opened that way never counts as staff — even if it then enrols its own authenticator and reaches aal2 (tested), because its `amr` has no `password`.
- **Brute force.** Supabase Auth's per-IP limits only see our server's address, so failed staff password and code attempts are limited in the database (`staff_sign_in_allowed` / `record_staff_sign_in_failure`, settings `staff_login.*`, T-19): per client IP, per account from one IP (tight), and per account from all IPs (loose backstop). Only failures count, so a stranger who knows a staff email can't lock that person out from their own connection — only an attacker spread over many IPs can reach the backstop. The client IP comes from Vercel's headers; a self-hosted deployment would need a trusted proxy.
- **First admin.** `pnpm admin:create-first` creates the first SUPER_ADMIN from a hidden password prompt; `bootstrap_super_admin()` refuses if one exists and only accepts a fresh email-only account (never a member). It writes `ADMIN_CREATED` to the audit log.
- **Audit (BR-34).** `review_photo()` writes `PHOTO_APPROVED` / `PHOTO_REJECTED` with the reason in the same transaction; metadata holds ids and the reason code only, never paths.
- **Account guards on `auth.users` (Phase 3 audit).** Supabase Auth does not run the before-user-created hook for admin-API creates — the path our server uses for members. A trigger now enforces the same rules on every user Auth creates: +231 only, not blocklisted, a valid geo pass, and no email on member accounts. A second trigger stops a member adding an email later (`updateUser({email})` would otherwise open an email sign-in path). Email-only accounts are staff.
- **Hosted settings to match `supabase/config.toml`:** Email provider on, sign-ups off; TOTP MFA on; minimum password length 12 with upper, lower and digits. Supabase's own per-IP rate limits apply to password and MFA attempts.

## Verification (Phase 4)

- **Pose chosen by the server (§9).** `start_verification()` picks a pose from `verification.pose_prompts` and stores it on an `AWAITING_SELFIE` row; reloading shows the same pose, so a member can't re-roll for an easy one. The capture screen uses the live camera only (no file input). A determined member could still feed a picture to the camera — the human check (pose, same face as the photos, liveness signs) is the control.
- **Selfie pipeline.** Same as photos: signed upload into quarantine → server validation and re-encoding (no metadata) → private `verification` bucket as `<verification_id>.webp`. Paths never leave `lib/storage/verification.ts`; members never get a selfie URL (BR-10).
- **Every view audited (BR-34).** The selfie is never part of the queue page itself: a client component, on every mount, calls a server action that runs `log_selfie_view()` with the staff session (writing `SELFIE_VIEWED`) and only then signs the URL (120 s). A back/forward restore remounts it and is logged again; selfies are stored with no caching. Items open only from explicit links with prefetching off, so listing or hovering never counts as a view.
- **Escalation.** After `verification.rejections_before_escalation` rejections, or any rejection for doubt about age, the next selfie is escalated: moderators can see it but only ADMIN and above can decide (`ADMIN_REQUIRED`).
- **Account state.** `recompute_account_state()` turns PENDING into ACTIVE only when the latest verification is VERIFIED and 3 photos are APPROVED (BR-13); it never changes SUSPENDED, BANNED or DELETED accounts. After photo decisions it runs at commit (deferred trigger), so it judges the final state — e.g. after a rejected main photo's successor goes back to review — never an intermediate one.
- **Retention (OD-6).** `/api/cron/selfie-retention` (Vercel Cron, `Authorization: Bearer $CRON_SECRET`, constant-time compare; refuses when unset) deletes images past `verification.selfie_retention_days`; `mark_selfies_deleted()` re-checks the period, and the decision record stays.
- **Decisions need a view.** `review_verification()` refuses (`SELFIE_NOT_VIEWED`) unless this reviewer has a logged `SELFIE_VIEWED` for that verification, and the queue rebuilds its panel per submission with decisions locked until the selfie is on screen — so no one approves a face they never saw.
- **Known issue for Phase 5.** `effective_account_status()` (Phase 1) reads any expired suspension as ACTIVE. Once suspensions exist (Phase 5), a suspended never-verified PENDING account would come back as ACTIVE; Phase 5 must restore the previous status instead (TODO, Safety).
- **Notifications.** `notify()` is the only writer; payloads hold ids and reason codes, never personal data. Members read only their own rows.

## Safety (Phase 5)

- **Blocks are invisible.** No client can read `blocks`; a blocked profile reads as "not found" (404), exactly like a profile that doesn't exist, and nothing is sent to the blocked member (BR-24). Every profile and photo read goes through `can_view_profile()`, which later phases reuse for discovery, likes and messages.
- **Reports are anonymous to the reported member.** The reporter's id never leaves the database; the staff detail shows the category, details and the reported account, not who reported. Members can report only someone they can see (or have blocked), are rate-limited per day, and can't report themselves.
- **Automatic actions are narrow** (spec §17): under-18 hides immediately; HIGH categories hide only at the distinct-reporter threshold within 24 h (one member repeating reports counts once); an inappropriate-photo report hides only that photo. None of them bans; a person decides (`resolve_report`).
- **Staff powers by role** (§7): moderators dismiss, resolve, note and suspend (time-limited); only admins ban and restore (`is_staff('ADMIN')`). Staff can't act on their own account or on staff accounts. Every decision writes `audit_logs` in the same transaction (BR-34); member text (report details, notes) is never copied into the audit log.
- **Ban** (BR-6): status BANNED ends sessions and sets `banned_until` in Supabase Auth (Phase 1 trigger), and the phone's keyed hash joins `phone_blocklist`, so the number can't sign up again (BR-3). Restoring removes both.

## Relationship and messaging (Phase 6)

- **No client reads any chat table.** Likes, matches, conversations and messages are closed to `anon` and `authenticated`; the server calls service-role functions with the member id from the session, and every function re-checks membership, eligibility and blocks.
- **Realtime uses private broadcast channels**, not table subscriptions. A trigger sends each new message (id, sender, body, time — never the moderation flag) to `conversation:<id>`; the `realtime.messages` policy admits only a member of that open conversation (`can_join_conversation_topic`, which answers only for `auth.uid()`). Nobody can broadcast from a client. Unmatch and block close the conversation, so it can't be joined again.
- **Matching is atomic:** `like_user()` takes a per-pair advisory lock; the match table stores each pair once (`user_a_id < user_b_id`, unique). Proven by a concurrency test firing both likes at once.
- **Messages:** text only, 1–1000 characters, links refused at send, rate-limited per minute. Detection runs in conversation mode (OD-31): money terms are delivered and flagged, contact details are not. Flags hold no text.
- **Staff and message text (OD-26, OD-33):** a report from a chat copies its recent messages; staff can read only those, and each view writes `REPORTED_MESSAGES_VIEWED` before the text is returned. Message text is never logged or put in audit rows.
- **Suspended members** read but can't send, browse or like (BR-5); members hidden by reports can't browse or send (Q26).

## Mobile money claims (Phase 7)

- **One path to access** (§6 rule 11): `approve_payment_claim()` is the only code that creates mobile money access. No role has write grants on the money tables — not members, not an admin's session, not the server key; an insert guard trigger refuses mobile money subscriptions outside the approval even for the database owner; the approval function is granted only to `authenticated` and checks `is_staff('ADMIN')` (role + password + TOTP), so the server key can't approve either.
- **Approval rules:** ADMIN+ only, never the reviewer's own account (BR-37); the reviewer must have opened the screenshot (audited `EVIDENCE_VIEWED`) and ticked the wallet-record checks (BR-38); amount equals the plan price exactly (BR-36); a transaction is approved once per provider (unique index + check, BR-35); no purchase during a card subscription (BR-41). Claim, payment, event, access, audit and notification are written in one transaction.
- **Money records:** payments' money fields are immutable and status changes are appended to `payment_events`, which is append-only (BR-29).
- **Screenshots:** uploaded to quarantine through a one-off signed URL, then magic-byte checked, size-capped, re-encoded to WebP without metadata and stored in the private `payment-evidence` bucket; the SHA-256 of the uploaded file flags reuse on another claim. Staff see a 120-second signed URL only after the audited view. Retention: OD-18 job.
- **Moderators** never see claims, payment flags or payment counts (Q9).
- Sender phone numbers and transaction IDs are stored for the reviewer but never logged or put in audit rows.

## Card webhooks (Phase 7b)

- **Signature first:** `/api/webhooks/card` (Next.js route handler) hands the raw body to the configured `CardProcessor.verifyWebhook()` before anything else. An untrusted delivery gets 401 and is logged as `CARD_WEBHOOK_INVALID` with `signature_valid = false` (only a SHA-256 and the first 256 characters of the body; logging pauses under a flood of 100 in 10 minutes, with a Sentry alert). Bodies over 64 KB get 413, also when sent in chunks.
- **Replay protection:** the adapter refuses signatures older or newer than 5 minutes; the database stores each verified event once (unique processor + event ID), so a replay inside the window returns `DUPLICATE` and changes nothing.
- **Binding:** a completed checkout is matched to the PENDING subscription the server created for the logged-in member (our reference), never to a member or plan named in the event. Later events are matched by the processor subscription ID. Stale state events (older than the last applied) are ignored.
- **One path to card access** (BR-26): only `apply_card_event()` and the checkout/cancel functions may write CARD subscriptions (`wk.card_event`), and they can't move a row to another member, plan or source. A well-signed event we can't apply is recorded as `CARD_EVENT_REJECTED` (200, so the processor stops retrying; Sentry warning without payload). A missing owner setting (e.g. OD-20), or an event for a checkout or charge that hasn't arrived yet (up to three days), fails with 500 and stores nothing, so the processor's retry is applied. A charge we won't give access for (second paid checkout, wrong amount, OD-19, refunded subscription) is kept as `CARD_NEEDS_REFUND` and renewals are cancelled at the processor; one grace period per paid period (BR-40).
- **Fake processor:** `CARD_PROCESSOR=fake` signs its own webhooks with `FAKE_CARD_WEBHOOK_SECRET` for local development and CI. It needs `ALLOW_FAKE_CARD_PROCESSOR=1` (written only by `pnpm env:setup`) and refuses to start on any Vercel deployment; its test checkout only completes the member's own open checkout at the plan's price, and the dev checkout page (`/dev/card-checkout`) returns 404 without it. Card UI is hidden unless `CARD_PAYMENTS_ENABLED=1` and a processor is configured. No card data reaches WeKonnectz (hosted checkout).
- The client-bundle scan also looks for `FAKE_CARD_WEBHOOK_SECRET` / `CARD_WEBHOOK_SECRET`.

## Logging rule (§6 rule 7)

Never log phone numbers, dates of birth, storage paths, selfie paths or message text — in app logs,
Sentry, analytics, audit metadata or test output.
