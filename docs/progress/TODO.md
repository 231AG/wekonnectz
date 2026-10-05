# WeKonnectz — Whole-app To-Do

Status: ✅ done · 🔄 in progress · ⬜ not started · ⛔ blocked (reason)
Phase numbers match `docs/plan/MASTER_PLAN.md`. BR = business rule (§19).

## Summary

| Area | ✅ | 🔄 | ⬜ | ⛔ |
| --- | --- | --- | --- | --- |
| Planning | 1 | 0 | 0 | 0 |
| All build areas | 0 | 0 | 130 | 0 |

Nothing is built yet. Plan awaiting approval.

## Planning
- ✅ Master plan, audit, TODO, owner tasks — Plan

## Foundation
- ⬜ Next.js + TS strict + Tailwind + shadcn/ui scaffold, pinned versions in CLAUDE.md — P0
- ⬜ Design tokens reconciled with logo (provisional until T-01) — P0
- ⬜ Base UI primitives (Button, Input, Card, Pill, Badge, BottomNav, StepHeader, AdminShell) — P0
- ⬜ Supabase CLI local stack, first migration (`app_settings`, `audit_logs`) — P0 — BR-34
- ⬜ `get_setting()` fails loudly on missing key — P0
- ⬜ pgTAP "RLS enabled on every table" guard test — P0
- ⬜ Vitest, Playwright, pgTAP wired; GitHub Actions CI — P0
- ⬜ Sentry with PII scrubber — P0
- ⬜ Baseline security headers — P0
- ⬜ CLAUDE.md, BUSINESS_RULES.md, DATA_MODEL.md, SECURITY.md, DECISIONS.md, SPRINT-00.md — P0
- ⬜ Session-start hook (Docker + deps) — P0
- ⬜ Bundle check: no service-role key in client JS — P0

## Auth and geo
- ⬜ `users`, roles, account states, RLS — P1 — BR-5, BR-6, BR-7
- ⬜ Registration server action: country = LR before OTP, `geo_checks` row — P1 — BR-1
- ⬜ +231-only phone validation — P1 — BR-2
- ⬜ Send-SMS auth hook (geo pass, rate limits, provider adapter) — P1 — BR-1, BR-2
- ⬜ Before-user-created hook (+231, blocklist) — P1 — BR-2, BR-3
- ⬜ One account per phone; phone HMAC hashing — P1 — BR-3
- ⬜ OTP rate limits per phone and per IP — P1
- ⬜ `GEO_ENFORCEMENT_MODE` flag — P1
- ⬜ Banned users cannot authenticate — P1 — BR-6
- ⬜ Suspension auto-lift by time comparison — P1 — BR-5
- ⬜ Public pages: Landing, About, Safety, Terms, Privacy, Rules, Login, Register, Region blocked — P1
- ⬜ Welcome, Age gate, Phone + OTP screens — P1 — BR-4

## Onboarding
- ⬜ DOB stored and locked; under-18 blocked — P1/P2 — BR-4
- ⬜ Community rules & consents with document version — P2
- ⬜ About you: name, gender, interested in, county + community, intent — P2 — BR-20
- ⬜ Interests (≥3) & bio (≤500, detection) — P2 — BR-31
- ⬜ Resume at first incomplete step — P2
- ⬜ `areas`, `interests` admin-managed lists — P2 (admin UI P10)
- ⬜ Detection engine + DB term list — P2 — BR-31
- ⬜ Under review screen with live progress — P4

## Photos
- ⬜ Private buckets (photos-quarantine, photos, verification, payment-evidence) — P3
- ⬜ Signed-upload flow with count and rate limit — P3
- ⬜ Processing: magic bytes, size cap, resize, WebP, EXIF strip — P3 — BR-12
- ⬜ Photo states, primary photo, reorder, delete — P3 — BR-8, BR-9
- ⬜ Signed read URLs (120 s) after access check — P3 — BR-11
- ⬜ Photo queue (approve / reject with reason, audited) — P3 — BR-34
- ⬜ Dropping below 3 approved → leave discovery, availability UNAVAILABLE — P4/P8 — BR-8
- ⬜ Visibility per OD-3 — P3 ⛔ until OD-3 decided

## Verification
- ⬜ `verifications`, pose prompts, in-camera capture — P4 — BR-10
- ⬜ Verification queue with checklist, oldest first — P4 — BR-34
- ⬜ SELFIE_VIEWED audit per view — P4 — BR-34
- ⬜ Resubmission + escalation after N rejections — P4 — BR-15
- ⬜ ACTIVE when VERIFIED ∧ ≥3 approved photos — P4 — BR-13
- ⬜ Verified badge — P4 — BR-14
- ⬜ Selfie retention job — P4 ⛔ until OD-6
- ⬜ ID document check — P4 ⛔ until OD-5 (only if yes)

## Safety
- ⬜ Blocks (silent, symmetric, everywhere) — P5 — BR-24
- ⬜ Reports with categories/priorities — P5
- ⬜ Under-18 report → instant hide — P5 — BR-32
- ⬜ Threshold auto-hide (distinct reporters / 24 h) — P5 — BR-33
- ⬜ Suspend / ban / restore + phone blocklist — P5 — BR-3, BR-5, BR-6, BR-34
- ⬜ Staff never act on own member account — P5
- ⬜ Moderation flags + Flags queue — P5
- ⬜ Reports queue with internal notes — P5 — BR-34
- ⬜ Member profile view with report/block in two taps — P5
- ⬜ Safety page and in-chat reminder — P5/P6
- ⬜ Behaviour signals (many reports, bursts, duplicate text, short windows) — P5/P8/P9

## Relationship mode
- ⬜ Discover feed with filters — P6 — BR-8, BR-13
- ⬜ Like / pass with cool-down — P6
- ⬜ Atomic match creation (ordered pair) — P6 — BR-23
- ⬜ Likes received, Matches screens — P6
- ⬜ Unmatch closes conversation for both — P6
- ⬜ Daily like cap — P6 ⛔ until OD-10
- ⬜ Home screen — P6

## Messaging
- ⬜ Conversations, members, messages tables + RLS — P6 — BR-23, BR-24
- ⬜ Realtime channels authorised by membership — P6
- ⬜ Text only, detection → flag, not block — P6
- ⬜ Read receipts — P6
- ⬜ Suspended users cannot send — P6 — BR-5
- ⬜ CASUAL conversations read-only without access — P9 — BR-25
- ⬜ Messages list (Chats / Requests tabs) — P6/P9

## Mobile money access
- ⬜ Plans, subscriptions, payments, payment_events, payment_claims, merchant_accounts tables — P7 — BR-29
- ⬜ Choose plan → instructions → submit claim → claim status screens — P7
- ⬜ Evidence pipeline + SHA-256 duplicate flag — P7
- ⬜ Server validation: plan, txn format, uniqueness, pending limit, BR-41, active+verified — P7 — BR-35, BR-39, BR-41
- ⬜ Payment claims queue with checklist — P7 — BR-37, BR-38
- ⬜ `approve_payment_claim()` (single path to access) — P7 — BR-26, BR-36
- ⬜ Reject / needs info flows, neutral reasons — P7
- ⬜ Stacking from current expiry — P7 — BR-28
- ⬜ Query-time expiry + cron tidy — P7 — BR-27, BR-30
- ⬜ Subscription & payments page (claims, receipts) — P7
- ⬜ Pricing page — P7
- ⬜ Prices, currency, policies — P7 ⛔ until OD-1, 2, 13, 16, 17, 18, 21, 22, T-14

## Card subscriptions
- ⬜ `CardProcessor` interface + fake adapter — P7b
- ⬜ Webhook Edge Function (signature, raw log, idempotent, replay) — P7b
- ⬜ State machine: renew, PAYMENT_FAILED → grace → EXPIRED, CANCELLED to period end — P7b — BR-40
- ⬜ Card UI behind `CARD_PAYMENTS_ENABLED` — P7b
- ⬜ Real processor adapter — P7c ⛔ until OD-4

## Availability
- ⬜ `availability` table, Now / Schedule / Pause — P8 — BR-18
- ⬜ Eligibility checks — P8
- ⬜ Window caps — P8 ⛔ until OD-8
- ⬜ `is_in_pool()` query-time; leave on pass expiry — P8 — BR-17
- ⬜ Availability never visible outside pool — P8 — BR-19
- ⬜ Request permission ANYONE / NOBODY — P8
- ⬜ pg_cron tidy job — P8

## Casual discovery
- ⬜ Available Now grid, filters, fair rotation, cursor pagination — P9 — BR-16, BR-17
- ⬜ Exclusions (self, blocks, interested-in, suspended, NOBODY) — P9 — BR-24
- ⬜ Casual member profile + Send a request (300 chars, detection) — P9 — BR-21, BR-31
- ⬜ Accept / decline / block — P9 — BR-22
- ⬜ One pending per pair; caps and cool-down — P9 ⛔ until OD-9
- ⬜ Request expiry — P9 ⛔ until Q2
- ⬜ Saved profiles — P9

## Admin console
- ⬜ Staff accounts, MFA (aal2 in DB), admin shell — P3
- ⬜ Photo queue — P3; Verification queue — P4; Reports & Flags — P5; Claims queue — P7
- ⬜ Dashboard with real figures — P10
- ⬜ Users (search incl. hashed phone, suspend, ban, restore, DOB correction) — P10 — BR-4, BR-34
- ⬜ Subscriptions (manual extension, audited) — P10 ⛔ until Q12
- ⬜ Payments & events, card webhook log — P10
- ⬜ Analytics — P10
- ⬜ Audit log viewer — P10
- ⬜ Settings (plans, merchant accounts, limits, terms, interests, areas, categories, flags) — P10
- ⬜ Staff management (SUPER_ADMIN) — P10
- ⬜ pgTAP test per §7 permission row — P10

## Notifications
- ⬜ `notifications` table + `notify()` — P4
- ⬜ Claim decision, review outcome notifications — P4/P7
- ⬜ Notifications screen + preferences — P11
- ⬜ Requests, matches, messages, expiry and renewal reminders — P11
- ⬜ Delivery channel — P11 ⛔ until Q3

## Security and launch
- ⬜ Member My profile: edit, verification, privacy & messaging, blocked users, settings — P10
- ⬜ Account deletion + purge job — P10 ⛔ until OD-7 — BR-7
- ⬜ Data export — P10
- ⬜ Full RLS / pgTAP pass — P12
- ⬜ CSP, HSTS, X-Frame-Options DENY, Referrer-Policy — P12
- ⬜ Rate-limit review — P12
- ⬜ Backup restore drill — P12 ⛔ until T-08
- ⬜ PWA install + offline shell — P12
- ⬜ Accessibility pass — P12
- ⬜ Legal sign-off — P12 ⛔ until T-12

## Business-rule coverage map

| BR | Phase | | BR | Phase | | BR | Phase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | P1 | | 15 | P4 | | 29 | P7 |
| 2 | P1 | | 16 | P9 | | 30 | P1→P7 |
| 3 | P1, P5 | | 17 | P8, P9 | | 31 | P2, P9 |
| 4 | P1, P2, P10 | | 18 | P8 | | 32 | P5 |
| 5 | P1, P5, P6 | | 19 | P8, P9 | | 33 | P5 |
| 6 | P1, P5 | | 20 | P2, P8 | | 34 | P0→P10 |
| 7 | P1, P10 | | 21 | P9 | | 35 | P7 |
| 8 | P3, P4, P6 | | 22 | P9 | | 36 | P7 |
| 9 | P3 | | 23 | P6 | | 37 | P7 |
| 10 | P4 | | 24 | P5, P6, P9 | | 38 | P7 |
| 11 | P3 | | 25 | P9 | | 39 | P7 |
| 12 | P3 | | 26 | P7, P7b | | 40 | P7b |
| 13 | P4, P6 | | 27 | P7 | | 41 | P7 |
| 14 | P4 | | 28 | P7 | | | |
