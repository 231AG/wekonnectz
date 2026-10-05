# WeKonnectz — Master Plan

Status: **APPROVED 5 Oct 2026 (v2: owner changes applied).** Decisions are recorded in `docs/DECISIONS.md`.
Source of truth: `docs/spec/WeKonnectz_MVP_Build_Spec_v3.pdf` (cited below as §N, BR-N, OD-N).
Look and feel: `docs/mockups/`.

---

## 1. Architecture summary

### 1.1 In one paragraph

One Next.js App Router application serves the public site, the member PWA and the staff console (`/admin`). Browsers never talk to business logic directly: every mutation is a Server Action or Route Handler that runs **authenticate → authorize → business rule → database/storage** (§6). Supabase supplies phone-OTP auth, Postgres (RLS on every table), private Storage, Realtime for chat, `pg_cron` for clean-up, and Edge Functions for card webhooks. The core rules — entitlement, pool membership, matching, claim approval — live **inside Postgres functions** so that even a hand-crafted request with a valid member JWT cannot get around them. TypeScript domain rules in `lib/domain/` mirror them for UX and are unit-tested; the database is the final gate.

### 1.2 Where each guarantee is enforced

| Guarantee                                                | Enforced by                                                                                                                                                                                                                                             | Why there                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Member can only touch own rows                           | RLS policies (owner-only)                                                                                                                                                                                                                               | Works even if a server bug forgets a check                                 |
| Who may see whom (discovery, pool, profile view, photos) | `SECURITY DEFINER` read functions that check `auth.uid()` eligibility + blocks; base tables are **not** readable cross-user via RLS                                                                                                                     | One place to audit; no "select * from profiles" leak                       |
| Casual access                                            | `has_casual_access(uid)` compares `expires_at > now()` at query time (BR-27, BR-30)                                                                                                                                                                     | Cron is clean-up, never the gate (§5)                                      |
| Pool membership                                          | `is_in_pool(uid)` = AVAILABLE ∧ now ∈ [start,end] ∧ access ∧ eligible (BR-17)                                                                                                                                                                           | Query-time                                                                 |
| Mobile money access                                      | **only** `approve_payment_claim()`; `subscriptions` has no INSERT/UPDATE policy for anyone; function `EXECUTE` revoked from `anon`/`authenticated`, granted only to a staff path that checks ADMIN + aal2 MFA + not-own-account (BR-26, BR-37, rule 11) | Single code path                                                           |
| Matching                                                 | `like_user()` with unique constraint + ordered pair + `ON CONFLICT` (§15)                                                                                                                                                                               | Atomic under concurrency                                                   |
| Staff powers                                             | `is_staff(min_role)` helper checks `users.role` **and** `auth.jwt()->>'aal' = 'aal2'` (MFA)                                                                                                                                                             | MFA enforced in DB, not just UI                                            |
| Audit                                                    | Staff mutations are DB functions that write `audit_logs` in the same transaction (BR-34)                                                                                                                                                                | Can't forget                                                               |
| Photos/selfies/evidence                                  | Private buckets; no member storage policies; server-only module issues 120 s signed URLs after an access-check function says yes (BR-11)                                                                                                                | Paths never leave the server                                               |
| Liberia-only signup                                      | +231 OTP (real control) + server-action IP-country pre-filter + Supabase Auth hooks requiring a geo pass (see 1.5)                                                                                                                                      | Direct anon-key calls can't skip the pre-filter; VPNs still can (accepted) |

### 1.3 Folder structure

```
app/
  (public)/            landing, about, pricing, safety, terms, privacy, rules, login, register, region-blocked
  (onboarding)/        age, phone, rules, about-you, interests-bio, photos, selfie, review
  (member)/            home, relationship/{discover,likes,matches}, casual/{available,saved,access/...},
                       messages/{,requests,[id]}, notifications, m/[id] (profile view), me/...
  admin/               dashboard, users, verification, photos, flags, claims, reports, subscriptions,
                       payments, analytics, audit, settings, staff, (auth)/mfa
  api/                 route handlers (signed-upload callbacks, auth hooks, health)
components/ui/         shadcn/ui primitives (only component library)
components/            feature components (no business logic)
lib/domain/            pure TS rules: eligibility, entitlement, stacking, state machines, detection
                       (NO next/supabase imports — reusable by Expo later)
lib/validation/        Zod schemas, one per form, shared client+server
lib/auth/, lib/permissions/   session, role + MFA checks, called first in every action
lib/payments/claims/   claim submission + validation
lib/payments/card/     CardProcessor interface, fake adapter, (later) real adapter
lib/storage/           upload pipeline (sharp), signed URLs — `import "server-only"`
lib/supabase/          server/browser/admin clients — admin client is `server-only`
lib/observability/     Sentry init + PII scrubber
supabase/migrations/   the only way the schema changes
supabase/functions/    card-webhook, (scheduled helpers if pg_cron can't)
supabase/tests/        pgTAP
supabase/seed.sql      fictional seed data + DEV-ONLY settings
tests/unit, tests/e2e  Vitest, Playwright
docs/                  BUSINESS_RULES, DATA_MODEL, SECURITY, DECISIONS, sprints/, plan/, progress/
```

### 1.4 Key database functions (planned)

| Function                                                                                | Phase         | Purpose                                                                                  |
| --------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------- |
| `audit(action, entity_type, entity_id, metadata)`                                       | 1             | Internal; appends to `audit_logs`                                                        |
| `is_staff(min_role)`                                                                    | 1             | Role + MFA (aal2) check                                                                  |
| `get_setting(key)`                                                                      | 1             | Reads `app_settings`; **raises** if key missing (rule 9)                                 |
| `rate_limit_hit(bucket, subject, window, max)`                                          | 1             | Postgres counter rate limiting                                                           |
| `complete_onboarding_step(...)` family                                                  | 2             | Writes step data, locks DOB (BR-4)                                                       |
| `recompute_account_state(uid)`                                                          | 4             | PENDING→ACTIVE when VERIFIED ∧ ≥3 APPROVED photos; drops availability if <3 photos       |
| `review_photo()`, `review_verification()`, `get_selfie_for_review()`                    | 3–4           | Staff decisions + audit (+ SELFIE_VIEWED)                                                |
| `block_user()`, `report_user()`, `apply_report_auto_actions()`                          | 5             | Silent block; HIGH under-18 instant hide; threshold auto-hide (BR-32/33)                 |
| `suspend_user()`, `ban_user()`, `restore_user()`                                        | 5             | + phone blocklist on ban (BR-3/6)                                                        |
| `can_view_profile(viewer, target, context)`                                             | 5–9           | Single visibility gate                                                                   |
| `discover_relationship(filters, cursor)`, `like_user()`, `pass_user()`, `unmatch()`     | 6             | §15                                                                                      |
| `send_message()`                                                                        | 6             | Membership, block, suspension, read-only-on-expiry (BR-25), price/money flag only (§1.6) |
| `submit_payment_claim()`                                                                | 7             | Final DB-side checks (pending limit, BR-41, uniqueness)                                  |
| `approve_payment_claim()`, `reject_payment_claim()`, `request_claim_info()`             | 7             | §16; one transaction                                                                     |
| `has_casual_access(uid)`                                                                | 7             | Query-time entitlement                                                                   |
| `apply_card_event(...)`                                                                 | 7b            | Webhook state machine; idempotent on event id                                            |
| `set_availability()`, `is_in_pool(uid)`                                                 | 8             | §12                                                                                      |
| `discover_pool(filters, cursor)`, `send_message_request()`, `respond_message_request()` | 9             | §13–14                                                                                   |
| `notify(uid, type, payload)`                                                            | 4 (first use) | In-app notifications                                                                     |

### 1.5 Liberia-only signup — what each control does, and what it doesn't (§3)

**Honest framing.** The **+231 phone OTP is the real control** (§3 audit note): an OTP only arrives on a working Liberian SIM. The IP-country check is a cheap pre-filter that stops casual foreign signups and saves SMS spend. Any VPN with a Liberian exit defeats it, and nothing here claims otherwise.

**Where the country comes from.** Supabase Auth hooks do **not** see the browser's IP or the hosting edge's country header; they only receive the phone/user payload. So the country is read in exactly one place and handed to Supabase as a server-side record:

1. **Registration server action (Vercel, Node runtime).** Reads `x-vercel-ip-country` from the incoming request (OD-11 = Vercel; Vercel sets this header at its edge and overwrites any client-supplied value). Requires `LR` and a valid `+231` number. Writes one `geo_checks` row: `ip_country`, `phone_country`, `result`, `phone_hash` (HMAC), timestamp — **country code only, never the raw IP** (OD-12). Enforces the per-IP OTP rate limit here, because this is the only place the IP is visible (the IP is used in memory for the counter key as an HMAC and never stored raw).
2. If the check passes, the action writes a **single-use "geo pass"** (`phone_hash`, `expires_at` = now + a few minutes) and then calls Supabase `signInWithOtp` server-side.
3. **Before-user-created hook** (Postgres function): rejects a new auth user unless the phone is `+231`, its hash is not on `phone_blocklist` (BR-2, BR-3), and an unexpired, unused geo pass exists for that phone hash; it consumes the pass.
4. **Send-SMS hook** (our route handler, signed by Supabase): enforces per-phone OTP limits, refuses brand-new numbers without a geo pass, then sends via the SMS provider. Existing members logging in skip the geo rule (no re-checks, §3.6) unless `GEO_ENFORCEMENT_MODE = EVERY_SESSION`.
5. Email/password signup disabled for members (staff use email + password + TOTP; staff accounts are created only by SUPER_ADMIN, never by self-signup).

**What this achieves:** someone who calls Supabase's API directly with the public anon key, skipping our server action, cannot create an account or trigger an SMS for a new number. **What it doesn't:** it can't tell a VPN from a real Liberian connection, and it can't stop a person abroad who controls a working +231 SIM _and_ a Liberian VPN. Roaming +231 users abroad without a VPN are blocked — confirmed intended (OD-14).

Phone numbers are stored hashed (HMAC-SHA256 with a server-side pepper) everywhere except `auth.users`, which Supabase controls.

### 1.6 Contact / price detection — two modes (owner change, §17 as amended)

| Where                                                         | Phone numbers, handles, links | Prices, payment terms, money requests      |
| ------------------------------------------------------------- | ----------------------------- | ------------------------------------------ |
| Bios                                                          | **Rejected**                  | **Rejected**                               |
| First message request (Casual)                                | **Rejected**                  | **Rejected**                               |
| Messages in an accepted conversation (Relationship or Casual) | **Not flagged**               | Delivered, **flagged** to moderation queue |

Links in accepted conversations: §14 says MVP chat has "no links", so a message containing a URL is refused at send (a send rule, not a detection flag). Confirm in Phase 6 if you want links simply allowed instead.

---

## 2. Tech decisions

| Area            | Choice (pin at Phase 0, record in CLAUDE.md)                                        | Notes                                                                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime         | Node 22 LTS                                                                         | Installed here: v22.22                                                                                                                                                    |
| Package manager | pnpm 10                                                                             | Installed here: 10.28                                                                                                                                                     |
| Framework       | next 16.3.x, react 19.3.x                                                           | App Router, Server Components default                                                                                                                                     |
| Language        | TypeScript, `strict: true`                                                          | Latest npm is 7.0.2 (native compiler). **Risk:** Next/ESLint tooling compatibility. Phase 0 tries 7.x; if anything breaks I pin the newest 5.x/6.x that works and say so. |
| UI              | tailwindcss 4.3.x + shadcn/ui                                                       | Tokens as CSS variables                                                                                                                                                   |
| Forms           | react-hook-form 7.89.x + zod 4.6.x                                                  | One schema per form, reused server-side                                                                                                                                   |
| Client data     | @tanstack/react-query 5.x                                                           | Discovery, messages, admin tables only                                                                                                                                    |
| Motion          | framer-motion 14.x                                                                  | `prefers-reduced-motion` respected                                                                                                                                        |
| Supabase        | @supabase/supabase-js 2.117.x, @supabase/ssr 0.12.x, supabase CLI 2.119.x (dev dep) | Local stack via Docker                                                                                                                                                    |
| Images          | sharp 0.35.x                                                                        | Magic bytes, cap, resize, WebP, EXIF strip                                                                                                                                |
| Phone parsing   | libphonenumber-js 1.13.x                                                            | Reason: reliable +231 validation                                                                                                                                          |
| Errors          | @sentry/nextjs 11.x                                                                 | PII scrubber (`beforeSend`)                                                                                                                                               |
| Analytics       | PostHog — **not installed** unless you ask (optional in spec)                       |                                                                                                                                                                           |
| Tests           | vitest 5.x, @playwright/test 1.63.x, pgTAP (via `supabase test db`)                 |                                                                                                                                                                           |
| Lint/format     | eslint 10.x (next config), prettier                                                 |                                                                                                                                                                           |
| CI              | GitHub Actions: lint, typecheck, unit, `supabase start` + pgTAP, Playwright, build  | Runners have Docker                                                                                                                                                       |

**Local development:** `pnpm i` → `pnpm db:start` (Supabase CLI, Docker) → `pnpm db:reset` (migrations + seed) → `pnpm dev`. OTP in dev uses Supabase's test-OTP numbers (fictional +231 numbers, fixed codes) so no SMS is sent.

**What you must install on your own machine** (only if you want to run it yourself): Node 22, pnpm 10, Docker Desktop. Everything else comes through `pnpm`. In this cloud session I start Docker myself; Phase 0 adds a session-start hook so it starts automatically.

---

## 3. Phases

**Delivery:** one draft PR per phase into `main`. Each phase is developed on the designated session branch; after a phase's PR merges, the branch is restarted from the new `main` for the next phase.

Numbering follows the spec's sprints so documents line up (`docs/sprints/SPRINT-XX.md`). Changes to the spec's sprint content are justified in §3.0 and the Plan audit.

### 3.0 Changes to the spec's build plan, and why

| Change                                                                                                                                                                                                                                                                    | Reason                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Admin console split: shell + staff auth + MFA in **Phase 3**; each queue ships with its feature (photos 3, verification 4, flags/reports 5, claims 7); Phase 10 finishes the rest (dashboard, users, subscriptions, payments & events, analytics, audit, settings, staff) | A feature that needs moderation isn't testable without its queue. Spec Sprint 10 alone would leave Sprints 3–7 unverifiable. |
| `notifications` table + `notify()` arrive in **Phase 4** (first review outcome); Phase 11 adds the inbox polish, preferences, reminders and push                                                                                                                          | `approve_payment_claim()` (Phase 7) must notify inside its transaction (§16.8).                                              |
| Detection engine (contacts/prices) built in **Phase 2** (bios) and reused in 5/6/7/9                                                                                                                                                                                      | One engine, term list in `app_settings` (§17).                                                                               |
| Member profile view page in **Phase 5**                                                                                                                                                                                                                                   | Report/block must be reachable from a profile in two taps (§17); needs a page to live on.                                    |
| Account deletion + data export added to **Phase 10**                                                                                                                                                                                                                      | §8, §20 and §22 require them; spec build plan doesn't list them. OD-7 is due Sprint 10.                                      |
| Public pages (landing, about, safety, terms, privacy, rules, login, register, region-blocked) in **Phase 1**; Pricing in **Phase 7**                                                                                                                                      | Region-blocked and login are Phase 1 flows; Pricing needs plans from DB.                                                     |
| **7b after 7**, card UI behind feature flag `CARD_PAYMENTS_ENABLED` (off). Only interface + fake adapter + webhook function + state machine. Real processor = later, separate phase "7c" once OD-4 is decided                                                             | Your instruction; card must not block launch.                                                                                |

### Phase 0 — Foundation & agent docs

- **Goal:** an empty-but-real app that builds, deploys locally, runs every kind of test in CI, with the docs and rules in place.
- **Scope:** Next.js + TS strict + Tailwind + shadcn/ui; design tokens (palette reconciled with logo — needs T-01); fonts Sora/Manrope; base primitives (Button, Input, Card, Pill, Badge, BottomNav, StepHeader, AdminShell skeleton); Supabase CLI init; first migration: `app_settings` + `audit_logs` (RLS, append-only); Vitest, Playwright, pgTAP wired; GitHub Actions CI; Sentry with PII scrubber (no-op without DSN); security headers baseline; `CLAUDE.md`, `docs/BUSINESS_RULES.md` (§19 verbatim), `docs/DATA_MODEL.md`, `docs/SECURITY.md`, `docs/DECISIONS.md`, `docs/sprints/SPRINT-00.md`; session-start hook (start Docker, install deps).
- **Out of scope:** any feature screen, auth.
- **Acceptance:** `pnpm lint/typecheck/test/test:db/test:e2e/build` all pass locally and in CI; a pgTAP test proves RLS is on for every table (generic check that will catch future tables); a test proves the service-role key never appears in the client bundle; `get_setting()` raises on a missing key.
- **Tests:** unit (PII scrubber), pgTAP (RLS-on-all-tables, audit_logs append-only), e2e (home placeholder renders, headers present).
- **Screenshots:** token/primitive preview page `foundation-ui-kit.png` vs. all mock-ups for colour/type.
- **Skills:** `session-start-hook` (cloud hook), `init` not used (I write CLAUDE.md by hand to the spec's §6 list), Bash CLIs (pnpm, supabase, git, docker), disciplines: repo setup, CI, CSP.
- **Owner tasks:** T-01 (logo) to finalise tokens — **not blocking**, I'll ship provisional tokens and swap. T-02 (OD-11 hosting) affects the geo header in Phase 1. T-03 (GitHub Actions on). T-05 (OD-12, OD-14) before Phase 1.
- **ODs:** OD-11 (by end of Phase 0).
- **Risks:** TypeScript 7 / Next 16 incompatibilities → fall back pin. Docker not auto-started in cloud → session hook.

### Phase 1 — Auth, geo & age gate

- **Goal:** a Liberian adult can create an account with a +231 OTP; everyone else is stopped before an SMS is sent.
- **Scope:** tables `users`, `profiles` (DOB part), `geo_checks`, `phone_blocklist`, `consents` (table only), rate-limit counters; roles USER/MODERATOR/ADMIN/SUPER_ADMIN; account states; `is_staff`, `get_setting`, `rate_limit_hit`; Send-SMS hook + Before-user-created hook (§1.5); SMS provider adapter (fake in dev); `GEO_ENFORCEMENT_MODE` flag; ban → cannot authenticate (BR-6, enforced in middleware + RLS helper); suspended auto-lift by time comparison; public pages + Welcome, Age gate, Phone+OTP, Login, Region blocked. Age gate before phone (DOB held in a signed, http-only cookie, written + locked on account creation).
- **Rules:** BR-1, 2, 3, 4, 6 (auth side), 30 (pattern), 34 (pattern).
- **Out of scope:** onboarding steps 4+, staff login UI.
- **Acceptance:** non-LR country → "This platform is currently available only in Liberia." and **no SMS hook call**; non-+231 → rejected server-side and by hook; direct `signInWithOtp` call without geo pass → hook refuses; under-18 → blocked, no account; geo_checks row written with country codes only; banned phone hash cannot register; OTP rate limits per phone and per IP; user row created with role USER, status PENDING; DOB locked.
- **Tests:** unit (age calc incl. leap-day birthdays, phone normalisation, geo decision), pgTAP (users/profiles owner-only; member cannot change own role/status/DOB; geo_checks/blocklist not readable by members), e2e (happy path with test OTP; blocked country via header injection; under-18).
- **Screenshots:** `onboarding-welcome`, `onboarding-age-gate` (+ under-18 error), `onboarding-phone-otp`, `region-blocked`, `login` ↔ `screens/onboarding/01–03`.
- **Skills:** Supabase Auth hooks, Postgres/RLS design, server actions, Playwright; review subagent for audit.
- **Owner tasks:** T-05 (OD-12, OD-14) **blocks Phase 1 geo code**; T-04 SMS provider (blocks verification with real phones, not the build); T-06 Supabase dev project (to verify hooks on hosted Supabase); Q5 staff login (needed by Phase 3).
- **Risks:** hosted hook config differs from local → documented in `docs/SECURITY.md`, verified on dev project.

### Phase 2 — Profile & onboarding

- **Goal:** a new member finishes steps 4–8 (rules, about you, intent, interests, bio) and resumes at the first incomplete step.
- **Scope:** `areas`, `interests`, `user_interests`, `user_settings`, `consents` (with document version), rest of `profiles`; detection engine `lib/domain/detection` + DB term list in `app_settings`; screens Community rules, About you (name, gender, interested in, county+community, intent), Interests & bio (no mock-up — designed in the same style), resume logic; versioned Terms/Privacy/Rules pages (placeholder text clearly marked until T-12).
- **Rules:** BR-4 (lock), BR-20 (area list only, no GPS), BR-31 (bios).
- **Acceptance:** each step saves server-side; leaving and returning lands on first incomplete step; consents stored with version; ≥3 interests enforced; bio >500 chars or with phone/link/handle/price → "Contact details and prices aren't allowed"; DOB not editable.
- **Tests:** unit (detection: dozens of positive/negative Liberian-context cases e.g. "0777…", "+231…", "LD 500", "short time", "momo", spaced-out digits, "w h a t s a p p") for both modes in §1.6 — `profile` mode rejects contacts+prices, `conversation` mode flags only prices/payment/money requests, pgTAP (areas/interests read-only to members; consents insert-own only), e2e (full onboarding to photos step; resume).
- **Screenshots:** `onboarding-community-rules`, `onboarding-about-you`, `onboarding-interests-bio` (+ rejected-bio error) ↔ `04`, `05` (interests/bio has no mock-up).
- **Owner tasks:** T-09 areas list, T-10 interests list, T-11 detection terms review, T-12 legal drafts (placeholders OK until launch).

### Phase 3 — Photos & private storage (+ staff console shell)

- **Goal:** members upload photos safely; moderators approve/reject them; nobody can fetch a photo without an access check.
- **Scope:** buckets `photos-quarantine`, `photos` (+ create `verification`, `payment-evidence` now, all private); `profile_photos`; signed-upload flow with count/rate limit; processing job (magic bytes, size cap, resize, WebP, EXIF strip) → PENDING_REVIEW; reorder, primary, delete; signed read URLs (120 s) via `can_view_profile` gate; **staff accounts + MFA (TOTP) + admin shell + Photo queue**; first SUPER_ADMIN bootstrap script; Photos onboarding screen.
- **Rules:** BR-8, 9, 11, 12, 34; §7 staff separation.
- **Acceptance:** non-image renamed `.jpg` rejected; EXIF (incl. GPS) absent in stored file; only APPROVED count; reject requires reason; member can't read another member's object by path or by API; admin routes refuse without aal2; every decision audited.
- **Tests:** unit (magic bytes, EXIF strip on fixture with GPS tags), pgTAP (storage policies deny cross-user; photo status not member-writable), e2e (upload 3, moderator approves, statuses shown).
- **Screenshots:** `onboarding-photos` ↔ `06-photos.png`; `admin-photo-queue`, `admin-mfa` (no mock-up; built in admin style).
- **Owner tasks:** OD-3 (photo visibility) due here; T-07 staff list for bootstrap; Q5.

### Phase 4 — Verification

- **Goal:** every member is checked by a human, and becomes ACTIVE only when verified with 3 approved photos.
- **Scope:** `verifications`; pose prompt list in `app_settings`; in-camera capture (getUserMedia, no gallery input); Verification queue (photos beside selfie, checklist, reasons, oldest first); SELFIE_VIEWED audit per view; resubmission + escalation after N rejections; `recompute_account_state`; Under review screen with live progress; `notifications` + `notify()`; selfie retention job per OD-6; ID document step **only if OD-5 = yes** (adds scope — see Questions).
- **Rules:** BR-10, 13, 14, 15, 34.
- **Acceptance:** account flips to ACTIVE exactly when verified ∧ ≥3 approved; selfie never reachable by members; each view audited; rejection reason shown neutrally; escalation after threshold.
- **Tests:** unit (state transitions), pgTAP (verifications owner-insert only, staff read via function only), e2e (submit selfie with fake camera → approve → ACTIVE → Home).
- **Screenshots:** `onboarding-verification-selfie`, `onboarding-under-review` ↔ `07`, `08`; `admin-verification-queue` ↔ `admin/02`.
- **Owner tasks:** OD-5, OD-6, review-time text (Q1), escalation threshold (T-19).

### Phase 5 — Safety core

- **Goal:** members can block and report from any profile in two taps; staff can act on reports and auto-flags; bans stick.
- **Scope:** `blocks`, `reports`, `report_notes`, `moderation_flags`; report categories/priorities; under-18 instant hide; threshold auto-hide (distinct reporters / 24 h); suspend (with end), ban (+ phone blocklist), restore; staff never acts on own member account; Member profile view page (`/m/[id]`) with report/block; Safety page; Reports + Flags queues; behaviour signal: many reports.
- **Rules:** BR-5, 6, 7, 24, 32, 33, 34.
- **Acceptance:** after A blocks B neither can load the other's profile, photos, or (later) messages/likes/requests — enforced in `can_view_profile`; block is silent; under-18 report hides at once; 3rd distinct reporter in 24 h hides; suspended user blocked from discovery/sending; banned user can't log in and phone can't re-register.
- **Tests:** pgTAP (block symmetry in every read function), unit, e2e (report → admin resolves; ban → login refused).
- **Screenshots:** `member-profile-view`, `member-report-sheet`, `member-safety` ; `admin-reports` ↔ `admin/03`; `admin-flags`.
- **Owner tasks:** auto-hide threshold, report rate limit (T-19); Q4 (staff access to message text).

### Phase 6 — Relationship + messaging core

- **Goal:** free Relationship mode works end to end: discover, like, match, chat in real time.
- **Scope:** `likes`, `passes`, `matches`, `conversations`, `conversation_members`, `messages`; Discover (one card, filters area/age/gender/interests), Likes received, Matches; `like_user()` atomic; pass cool-down; unmatch; daily like cap (OD-10); text-only messages via `send_message()`; Realtime channels authorised by membership (Realtime RLS on `messages`); read receipts; in-chat safety reminder on first message; price/payment/money-request detection → flag (not block); phone numbers and handles **not** flagged (§1.6); Messages list (Chats tab); Conversation screen; Home screen (Relationship card; Casual card in "get access" state).
- **Rules:** BR-5, 8, 13, 23, 24.
- **Acceptance:** two simultaneous mutual likes → exactly one match (concurrency test); non-matched users can't message; blocked/unmatched closes for both; flagged messages still delivered; Realtime subscription to someone else's conversation denied.
- **Tests:** pgTAP (message RLS, like uniqueness, ordered pair check), unit (eligibility, filters), e2e (two browser contexts: like/like → match → chat live).
- **Screenshots:** `member-home`, `member-relationship-discover`, `member-likes`, `member-matches`, `member-messages-chats`, `member-conversation` ↔ `member/01, 02, 06`.
- **Owner tasks:** OD-10; pass cool-down value (T-19). Q6 answered: no Saved in Relationship — the mock-up's bookmark button is left out.

### Phase 7 — Mobile money access

- **Goal:** a member pays by Orange Money / MTN outside the app, submits a claim, an admin verifies it, and Casual access starts — with no other way to get it.
- **Scope:** `subscription_plans`, `subscriptions`, `payments`, `payment_events`, `payment_claims` (partial unique index), `merchant_accounts`, `card_customers` (table only); Get access → Choose plan (mobile money | card [card hidden until 7b flag]) → Instructions (merchant number, exact amount, reference code) → Submit claim (txn ID, sender, locked amount, date/time, screenshot) → Claim status; evidence pipeline (magic bytes, re-encode, SHA-256, duplicate hash auto-flag); pending limit (OD-21); BR-41 block; Payment claims queue (oldest first, checklist, earlier claims, approve/reject/needs-info, EVIDENCE_VIEWED audit); `approve_payment_claim()` (claim APPROVED + payment SUCCEEDED + access created/extended from current expiry + audit + notify, one transaction); expiry by time comparison + cron tidy; Subscription & payments page (claims, receipts); Pricing page; dashboard counters for pending claims.
- **Rules:** BR-26, 27, 28, 29, 30, 35, 36, 37, 38, 39, 41.
- **Acceptance:** no code path other than `approve_payment_claim()` creates mobile-money access (pgTAP: direct insert into `subscriptions` denied for all roles incl. admin JWT; function denied for MODERATOR, for no-MFA admin, for own claim); same txn ID can't be approved twice per provider; amount ≠ price → approval refused; extension stacks from current expiry; access ends exactly at `expires_at`; payment money columns immutable (trigger).
- **Tests:** heavy pgTAP + unit (stacking, state machine) + e2e (member submits → admin approves → pool unlocked).
- **Screenshots:** `member-get-access-choose-plan` ↔ `member/07-get-a-pass.png` (spec wins), `member-momo-instructions`, `member-submit-claim`, `member-claim-status` (pending / needs-info / rejected / approved), `member-subscription-payments`; `admin-claims-queue`.
- **Owner tasks:** OD-1, 2, 13, 16, 17, 18, 21, 22; T-14 transaction-ID formats; T-13 merchant wallets (launch).
- **Risks:** transaction-ID format unknown → validation regex stored in `app_settings` per provider (no guess).

### Phase 7b — Card subscriptions (scaffold only)

- **Goal:** card payments are designed and fully testable with a fake processor, ready for a real one, without blocking launch.
- **Scope:** `CardProcessor` interface (§16) + `FakeCardProcessor` (test-only, never enabled in production builds); `card-webhook` Edge Function (signature check first, raw event to `payment_events`, idempotent on event ID, replay window); `apply_card_event()` state machine PENDING→ACTIVE→(renew)→CANCELLED/PAYMENT_FAILED→EXPIRED, SUSPENDED, REFUNDED; cancel-at-period-end action; renewal reminder hook (notification in Phase 11); UI behind `CARD_PAYMENTS_ENABLED`.
- **Rules:** BR-26 (card), 29, 40.
- **Out of scope:** any real processor (needs OD-4), OD-19/20 behaviour beyond settings keys.
- **Acceptance:** replayed event = no-op; bad signature = 401 + logged invalid; failed renewal keeps access for grace (OD-20 setting) then expires; cancelled keeps access to period end.
- **Owner tasks:** T-18 — OD-4, 15, 19, 20 (not blocking launch).

### Phase 8 — Availability

- **Goal:** a pass-holder can go Available now or schedule a window, and leaves the pool automatically.
- **Scope:** `availability`; Available now / Schedule / Pause; caps (OD-8); one active-or-scheduled window; "Who can send you requests" (ANYONE | NOBODY) in `user_settings`; `is_in_pool()` query-time; pg_cron tidy job; leave pool when photos <3, pass expires, suspended, auto-hidden; behaviour signal: frequent short windows; Home availability card.
- **Rules:** BR-17, 18, 19, 20.
- **Acceptance:** window outside caps rejected; pass expiry mid-window removes from pool immediately (time-travel test); availability never returned outside pool functions.
- **Screenshots:** `member-availability` (now / schedule / paused) ↔ `member/08`.
- **Owner tasks:** OD-8; short-window signal threshold (T-19).

### Phase 9 — Casual discovery & requests

- **Goal:** pass-holders browse the Available Now pool and start conversations only through accepted requests.
- **Scope:** `message_requests`, `saved_profiles`; Available Now grid with filters (area, age, gender preset from interested-in, interests, window), fair rotation, cursor pagination (20); exclusions (§13); Casual member profile + Send a request (300 chars, detection reject); Requests tab (accept/decline/block); daily cap + decline cool-down (OD-9); request expiry (Q2); CASUAL conversation read-only without access; Saved list; behaviour signals (bursts, same text to many).
- **Rules:** BR-16, 17, 19, 21, 22, 24, 25, 31.
- **Acceptance:** no pass → no pool data at all (pgTAP); NOBODY users hidden; mutual "interested in" required; one pending request per pair; cool-down after decline; conversation becomes read-only the second access ends, history kept.
- **Screenshots:** `member-casual-available-now` (+ empty, + no-pass) ↔ `member/03`; `member-casual-profile` ↔ `member/04`; `member-message-requests` ↔ `member/05`; `member-saved`.
- **Owner tasks:** OD-9, Q2.

### Phase 10 — Admin console (complete) + account lifecycle

- **Goal:** staff can run the whole service from `/admin`; members can delete their account and export their data.
- **Scope:** Dashboard (real figures) ↔ `admin/01`; Users (search incl. hashed phone, actions, DOB correction with audit); Subscriptions (manual extension with reason); Payments & events; Analytics; Audit logs viewer; Settings (plans, merchant accounts, limits, terms, interests, areas, categories, flags — every change `SETTING_CHANGED`); Staff (SUPER_ADMIN; `ROLE_CHANGED`, `ADMIN_CREATED`); refunds as events (per OD-13); member My profile remaining screens (Edit profile, Verification, Privacy & messaging, Blocked users, Settings, Delete account, data export); deletion → hidden immediately, purge job per OD-7.
- **Rules:** BR-7, 34; §7 matrix fully tested.
- **Acceptance:** a pgTAP test per row of the §7 permission matrix; deleted users vanish from every read function.
- **Owner tasks:** OD-7.

### Phase 11 — Notifications

- **Goal:** members hear about everything that matters, in-app (and through the channel you choose).
- **Scope:** Notifications screen; triggers for requests, matches, messages, review outcomes, claim decisions, pass expiry warning, card renewal reminder; notification preferences; delivery channel per Q3 (web push needs T-20).
- **Owner tasks:** Q3.

### Phase 12 — Hardening & launch

- **Goal:** prove it's safe to open the doors.
- **Scope:** full RLS/pgTAP pass, permission matrix, security headers (CSP, HSTS, XFO DENY, Referrer-Policy), rate-limit review, dependency audit, load sanity on discovery queries, Sentry scrub verification, backup restore drill, production env checklist, PWA install/offline shell, accessibility pass, legal sign-off.
- **Owner tasks:** T-08 prod project + PITR, T-12 legal review, T-13 merchant wallets, T-04 SMS live, T-16 domain, T-17 Sentry.

### Phase 7c — Real card processor (after OD-4; may be post-launch)

Real `CardProcessor` adapter, hosted checkout, live webhooks. Planned only once you choose a processor.

---

## 4. Card payments (7b)

Interface exactly as §16. A `FakeCardProcessor` drives tests and local demos (signs its own webhooks with a dev secret). The webhook Edge Function, `payment_events` logging, idempotency, and the full subscription state machine are real and tested, so plugging in a processor later is an adapter plus config. Card UI is hidden by `CARD_PAYMENTS_ENABLED=false` until then. Nothing in Phases 8–12 depends on cards: "Casual access" is read through `has_casual_access()` whatever the source.

## 5. Whole-app To-Do list

See `docs/progress/TODO.md`.

## 6. Owner task list

See `docs/progress/OWNER_TASKS.md`.

## 7. Questions for you (v1 — answered 5 Oct 2026, see `docs/DECISIONS.md`; Q7/T-19 still open)

Decisions the spec does not already list as ODs (numbered Q so they don't clash with OD numbers; once you answer, I record them in `docs/DECISIONS.md`, adding new OD numbers from OD-23):

1. **Q1 — Review time text.** The Under review mock-up says "Usually done within [REVIEW TIME]". Not an OD in the spec. What should it say (or remove it)? Needed by Phase 4.
2. **Q2 — Message request expiry.** Mock-up says "Requests expire if you don't answer" and the data model has `EXPIRED`, but no time limit is given. How long? Also: does a pending request expire when the recipient leaves the pool or the sender's access ends? Recommend: expire at the earlier of the recipient's window end or 24 h. Needed by Phase 9.
3. **Q3 — Notification channels.** In-app only, or also web push (PWA), or SMS? Recommend in-app + web push (SMS costs money; WhatsApp is banned by §24). Needed by Phase 11.
4. **Q4 — Staff access to messages.** §17 sends flagged messages to a queue, and the Reports mock-up shows "flagged message text". May moderators see (a) only flagged messages, or (b) also recent messages between reporter and reported user when handling a report? Recommend (b) limited to the last 20, each view audited. Needed by Phase 5.
5. **Q5 — Staff login method.** Staff accounts are separate (§7) and need TOTP MFA. Members use +231 OTP. Should staff log in with email + password + TOTP (recommended; staff may not want a second SIM), or phone OTP + TOTP? Needed by Phase 3.
6. **Q6 — Saved profiles in Relationship.** The Discover mock-up has a bookmark button; the spec lists Saved only under Casual. Casual only (spec), or both? Needed by Phase 6.
7. **Q7 — Threshold and limit values.** The spec puts these in `app_settings` without numbers (or with recommendations only). Rule 9 says I can't invent them. I've listed each with a recommendation in `OWNER_TASKS.md` T-19 — you can approve them in one go.
8. **Q8 — Logo.** No logo file was provided (`docs/brand/` is empty). Needed to finalise the palette (T-01).
9. **Q9 — Moderator nav in mock-ups.** The admin mock-ups show a Moderator with a Payments link. §7 says moderators can't view payments. I'll follow the spec and hide it for moderators. Tell me if you want otherwise.
10. **Q10 — "Get a pass" copy** says a pass unlocks "member photos". That's only true if OD-3 = B or C. I'll set the copy once OD-3 is decided.
11. **Q11 — Messages with phone numbers after a chat is accepted.** Per §17 they are delivered and flagged. Expect a high flag volume as people swap numbers. Confirm that's intended (vs. not flagging after N messages).
12. **Q12 — Admin "manual extension" (§21) vs rule 11.** Rule 11 says mobile money access is created only by `approve_payment_claim()`. I read §21's manual extension as: ADMIN+ may extend an _existing_ subscription with a reason, audited, never create one from nothing. Correct? Needed by Phase 10.

Decisions due before Phase 1: **OD-11** (hosting), **OD-12** (store IP or country only), **OD-14** (roaming Liberians blocked — intended?).

---

## 8. Plan audit

I reviewed the draft as a reviewer who didn't write it. Problems found and the fix applied:

| #   | Problem in draft                                                                                                                                                                                                              | Fix                                                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Geo check lived only in our server action; the anon key lets anyone call Supabase `signInWithOtp` directly, skipping it and spending SMS.                                                                                     | Hooks require a single-use geo pass written by the server action; +231 OTP stays the real control; VPN limits stated plainly (§1.5, v2).                                                                                                                                         |
| A2  | Admin console scheduled only in Phase 10, but photo, verification, report, flag and claim queues are needed to _test_ Phases 3–7.                                                                                             | Admin shell + MFA in Phase 3; each queue ships with its feature.                                                                                                                                                                                                                 |
| A3  | `approve_payment_claim()` must notify the member (§16.8) but notifications were Phase 11.                                                                                                                                     | `notifications` + `notify()` introduced in Phase 4.                                                                                                                                                                                                                              |
| A4  | Report/block "from every profile in two taps" had no profile page until Phase 6/9.                                                                                                                                            | Member profile view built in Phase 5.                                                                                                                                                                                                                                            |
| A5  | Account deletion, data export, DOB correction weren't in any sprint.                                                                                                                                                          | Phase 10 (OD-7 due then).                                                                                                                                                                                                                                                        |
| A6  | Entitlement originally checked in TS server code only; a bug there would leak.                                                                                                                                                | Gate moved into SQL functions; TS mirrors for UX; pgTAP proves it.                                                                                                                                                                                                               |
| A7  | MFA for staff was a UI check.                                                                                                                                                                                                 | `is_staff()` requires JWT `aal2` inside the database.                                                                                                                                                                                                                            |
| A8  | Draft had seeded default thresholds in a migration.                                                                                                                                                                           | Removed. Migrations create keys with **no** value; `get_setting()` raises; DEV-ONLY values only in `seed.sql` (rule 9).                                                                                                                                                          |
| A9  | Detection engine planned per feature → drift.                                                                                                                                                                                 | One engine (Phase 2), DB term list, reused.                                                                                                                                                                                                                                      |
| A10 | `subscriptions` insertable by a service-role server action "for admins". That's a second code path to Casual access (violates rule 11).                                                                                       | No write policies; only `approve_payment_claim()` (mobile money) and `apply_card_event()` (card) write. Admin manual extension (Phase 10) goes through an audited function that only _extends_ an existing subscription (`SUBSCRIPTION_MODIFIED`) — flagged to you below as A13. |
| A11 | Card work was on the critical path (Phase 7 depended on it for "Choose plan").                                                                                                                                                | Card option hidden by flag; Phase 7 ships mobile money alone.                                                                                                                                                                                                                    |
| A12 | Owner tasks for Phase 7 (prices, txn formats, wallets) were requested in Phase 7.                                                                                                                                             | Requested now, with "needed by" phases.                                                                                                                                                                                                                                          |
| A13 | §21 allows admins to "manually extend" a subscription. That is Casual access granted outside `approve_payment_claim()`, which rule 11 forbids for mobile money.                                                               | Plan: manual extension only extends an existing subscription row, ADMIN+, reason required, audited — never creates access from nothing. **Confirm this reading** (Q12).                                                                                                          |
| A14 | Scope check against §24: draft UI for "Get a pass" kept the mock-up's in-app "Pay" button implying a direct charge.                                                                                                           | Replaced by the claim flow (instructions → claim → status). No auto-approval, no WhatsApp, no wallet, no vouchers, no images in chat, no GPS anywhere in the plan.                                                                                                               |
| A15 | Coverage check: every BR-1…BR-41 mapped (see TODO.md); every §18 table assigned; every §20 screen assigned; all OD-1…OD-22 have a due phase. Typing indicators (optional in §14) not planned — left out unless you want them. | —                                                                                                                                                                                                                                                                                |
| A16 | Phase 6 is the largest (discover + matching + Realtime chat + home).                                                                                                                                                          | Kept together because chat needs matches to be testable, but split into two commit series; if it slips I'll report and split into 6a/6b rather than cut tests.                                                                                                                   |
| A17 | Docker isn't running by default in this cloud session (local Supabase needs it).                                                                                                                                              | I started it and confirmed Supabase images pull. Phase 0 adds a session-start hook so it is automatic.                                                                                                                                                                           |
