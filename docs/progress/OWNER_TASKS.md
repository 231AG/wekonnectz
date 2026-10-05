# Owner tasks

Things only you can do. IDs never change or get reused.
Never paste secret values into chat. Put them in the file/variable named, and I will check the variable exists without printing it.

Status key: `OPEN` · `DONE (verified by Claude)` · `DONE (confirmed by owner)`

## Summary

| ID   | What                                                                              | Blocks                                                   | Status |
| ---- | --------------------------------------------------------------------------------- | -------------------------------------------------------- | ------ |
| T-01 | Add the WeKonnectz logo files                                                     | Final colour tokens (Phase 0 sign-off, not the build)    | OPEN   |
| T-02 | Decide hosting (OD-11) and create the account                                     | Phase 1 geo header choice; Phase 12 deploy               | OPEN   |
| T-03 | Make sure GitHub Actions is enabled on the repo                                   | Phase 0 CI verification                                  | OPEN   |
| T-04 | Choose an SMS provider and test delivery to Orange and Lonestar Cell MTN          | Phase 1 verification with real phones; launch            | OPEN   |
| T-05 | Decide OD-12 and OD-14                                                            | **Phase 1** (geo code)                                   | OPEN   |
| T-06 | Create a Supabase _development_ cloud project                                     | Phase 1 verification of auth hooks on hosted Supabase    | OPEN   |
| T-07 | Give the list of first staff (who is SUPER_ADMIN, ADMIN, MODERATOR) and answer Q5 | **Phase 3** (staff console)                              | OPEN   |
| T-08 | Create the Supabase _production_ project on a plan with backups / PITR            | Launch (Phase 12)                                        | OPEN   |
| T-09 | Provide the list of areas (county → communities)                                  | **Phase 2** (real data; DEV-ONLY sample used until then) | OPEN   |
| T-10 | Provide the interests list                                                        | Phase 2 (real data)                                      | OPEN   |
| T-11 | Review the detection term list                                                    | Phase 2 sign-off                                         | OPEN   |
| T-12 | Draft Terms, Privacy Policy, Community rules; get Liberian legal review           | Launch (placeholders until then)                         | OPEN   |
| T-13 | Register Orange Money and MTN merchant wallets under a neutral name               | Launch                                                   | OPEN   |
| T-14 | Send sample formats of Orange Money / MTN transaction IDs, and answer OD-22       | **Phase 7**                                              | OPEN   |
| T-15 | Decide the Phase 7 payment ODs (OD-1, 2, 13, 16, 17, 18, 21)                      | **Phase 7**                                              | OPEN   |
| T-16 | Buy / confirm the domain name                                                     | Launch                                                   | OPEN   |
| T-17 | Create a Sentry project                                                           | Before launch (Phase 0 works without it)                 | OPEN   |
| T-18 | Research and choose a card processor (OD-4, 15, 19, 20)                           | Phase 7c only (not launch)                               | OPEN   |
| T-19 | Approve threshold and limit values                                                | Per row below                                            | OPEN   |
| T-20 | Web push keys — only if Q3 = web push                                             | Phase 11                                                 | OPEN   |
| T-21 | Remaining product decisions (OD-3, 5, 6, 7, 8, 9, 10; Q1–Q12)                     | Per row below                                            | OPEN   |

---

## Details

### T-01 — Logo

- **What:** Put the WeKonnectz logo files in `docs/brand/`.
- **Why:** The mock-up palette (gold/blue/orange) has to be reconciled with the logo's orange → pink → purple.
- **Steps:**
  1. Export the logo as SVG (preferred) and PNG at 1024 px, plus a square icon version if you have one.
  2. Add them to `docs/brand/` (upload them in this chat; I will commit them).
- **Blocks:** Final palette sign-off in Phase 0. I build with provisional tokens and swap them; nothing else waits.
- **Requested in:** Plan.

### T-02 — Hosting (OD-11)

- **What:** Choose Vercel (spec's recommendation) or your Hetzner VPS, and create the account.
- **Why:** The geo check reads `x-vercel-ip-country` on Vercel or `CF-IPCountry` behind Cloudflare (§3). It also decides how deployment works.
- **Steps:**
  1. Reply with your choice (Vercel / VPS behind Cloudflare / Vercel behind Cloudflare).
  2. If Vercel: create a team/account at vercel.com, then import the GitHub repo `231ag/wekonnectz` (no env vars yet).
  3. Confirm (VERIFY in §3) on your plan that the country header is present — I'll give you a one-line test page in Phase 1.
- **Blocks:** Phase 1 header choice (I can build both readers, so this blocks _verification_, not code); Phase 12 deploy.
- **Requested in:** Plan.

### T-03 — GitHub Actions

- **What:** Make sure Actions are allowed on `231ag/wekonnectz`.
- **Why:** CI runs lint, type-check, unit, pgTAP, e2e and build on every push.
- **Steps:** GitHub → repo → Settings → Actions → General → "Allow all actions and reusable workflows" → Save.
- **Blocks:** Phase 0 CI verification.
- **Requested in:** Plan.

### T-04 — SMS provider [VERIFY]

- **What:** Pick an SMS provider and test that OTP SMS reach Orange and Lonestar Cell MTN numbers.
- **Why:** OTP to a +231 SIM is the real Liberia-only control (§3). Delivery, delay and cost are unverified.
- **Steps:**
  1. Shortlist providers that deliver to Liberia (e.g. Twilio, Vonage, Africa's Talking — check their Liberia coverage pages and prices).
  2. Create an account with your choice and buy/configure a sender ID.
  3. Send 5 test messages each to an Orange and an MTN number you own; note delivery time and cost per SMS.
  4. Reply with: provider name, delivery results, price. **Don't paste keys.**
  5. When I ask (Phase 1), put the keys in `.env.local` as `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_API_SECRET`, `SMS_SENDER_ID` (exact names confirmed in Phase 1).
- **Blocks:** Phase 1 verification with real phones (build uses a fake sender); launch.
- **Requested in:** Plan.

### T-05 — Phase 1 decisions

- **What:** Answer OD-12 (store raw signup IP, or country only — recommendation: country only) and OD-14 (Liberians abroad on a roaming +231 SIM are blocked at signup — intended?).
- **Why:** These change what the geo check stores and who it lets in.
- **Steps:** Reply in chat.
- **Blocks:** **Phase 1** geo code.
- **Requested in:** Plan.

### T-06 — Supabase development project

- **What:** Create a Supabase cloud project for development/staging.
- **Why:** Local Supabase covers most testing, but auth hooks and SMS need checking on hosted Supabase before launch.
- **Steps:**
  1. supabase.com → New project → name `wekonnectz-dev`, region closest to West Africa offered (e.g. Frankfurt / London), strong DB password (keep it in your password manager).
  2. Project Settings → API: copy the URL and anon key into `.env.local` as `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; the service role key as `SUPABASE_SERVICE_ROLE_KEY` (never `NEXT_PUBLIC_`).
  3. For this cloud session instead: add the same three variables in the environment's settings (environment menu → Edit → environment variables). Tell me when done; I'll check they exist.
- **Blocks:** Phase 1 hosted verification only.
- **Requested in:** Plan.

### T-07 — First staff

- **What:** Tell me who the first staff are and their roles; answer Q5 (staff login method).
- **Why:** Staff accounts are separate from member accounts and need MFA (§7). The first SUPER_ADMIN is created by a one-off script.
- **Steps:** Reply with role per person (names only; no phone numbers or emails in chat — I'll give you a script you run yourself to create the accounts). Each staff member needs an authenticator app (Google Authenticator, 1Password, Authy).
- **Blocks:** **Phase 3** (for real staff; tests use fictional staff).
- **Requested in:** Plan.

### T-08 — Supabase production project

- **What:** Create `wekonnectz-prod` on a paid plan with daily backups and preferably PITR.
- **Why:** §22 requires backups and a tested restore before launch.
- **Steps:** As T-06, project name `wekonnectz-prod`; enable PITR add-on; keys go into the hosting provider's env settings, not files.
- **Blocks:** Launch.
- **Requested in:** Plan.

### T-09 — Areas list

- **What:** Provide the counties and the communities within each that members can pick.
- **Why:** Location is a controlled list, never GPS (§10, BR-20).
- **Steps:** A simple sheet or list: `County, Community`. Start with Montserrado in detail; other counties can be just the county name for now.
- **Blocks:** Phase 2 real data. I use a DEV-ONLY sample (the 15 counties + a few Monrovia communities from the mock-ups) until then.
- **Requested in:** Plan.

### T-10 — Interests list

- **What:** Provide 20–40 interests (e.g. Music, Food, Travel, Fitness — from the mock-ups).
- **Why:** Onboarding needs at least 3 from an admin-managed list (§10).
- **Steps:** Reply with the list, or approve the sample I'll show in Phase 2.
- **Blocks:** Phase 2 real data.
- **Requested in:** Plan.

### T-11 — Detection terms

- **What:** Review the list of words/patterns that flag contact details and prices (§17).
- **Why:** Local slang matters ("short time", "transport", "momo", "LD"). You know it better than I do.
- **Steps:** I'll put the proposed list in `docs/DECISIONS.md` in Phase 2; add/remove terms there or reply in chat.
- **Blocks:** Phase 2 sign-off.
- **Requested in:** Plan.

### T-12 — Legal documents [VERIFY]

- **What:** Draft Terms, Privacy Policy, Community rules; get a Liberian lawyer to review them plus data retention and the law-enforcement request process.
- **Why:** §17 Legal. Consents are stored with document version, so each published version needs a version number.
- **Steps:** Draft (I can produce a first draft for your lawyer if you want) → lawyer review → send final text + version label.
- **Blocks:** Launch. Placeholder text marked "DRAFT – NOT FOR USE" until then.
- **Requested in:** Plan.

### T-13 — Merchant wallets

- **What:** Register Orange Money and MTN merchant accounts under a neutral business name.
- **Why:** Payment instructions show these numbers/codes; personal wallets must not be used (§16).
- **Steps:** Apply with each provider; when ready, you (not me) enter the numbers in Admin → Settings → Merchant accounts (Phase 10), or tell me to seed them via a migration-free admin action.
- **Blocks:** Launch.
- **Requested in:** Plan.

### T-14 — Transaction ID formats & reference notes [VERIFY]

- **What:** Send the _format_ of an Orange Money and an MTN transaction ID (redact digits, e.g. `CI231005.1234.A12345` → `CI######.####.A#####`), and find out whether payers can add a reference note (OD-22).
- **Why:** Claims validate the ID format per provider (§16). I must not guess the format.
- **Steps:** Make a small real payment to yourself on each network, look at the confirmation SMS/receipt, send the redacted pattern.
- **Blocks:** **Phase 7**.
- **Requested in:** Plan.

### T-15 — Payment decisions

- **What:** Decide OD-1 (all prices), OD-2 (currency USD/LRD/both), OD-13 (refund policy), OD-16 (review turnaround shown + staff review hours), OD-17 (under/over-payment), OD-18 (screenshot retention), OD-21 (max pending claims).
- **Why:** None of these can be guessed (§25).
- **Steps:** Reply in chat; I record them in `docs/DECISIONS.md`.
- **Blocks:** **Phase 7**.
- **Requested in:** Plan.

### T-16 — Domain

- **What:** Confirm the production domain and who manages DNS.
- **Why:** Needed for HSTS, CSP, OTP sender branding and deploy.
- **Blocks:** Launch.
- **Requested in:** Plan.

### T-17 — Sentry

- **What:** Create a Sentry project (Next.js).
- **Why:** Error tracking with PII scrubbing (§5).
- **Steps:** sentry.io → new project → Next.js → put the DSN in `.env.local` as `NEXT_PUBLIC_SENTRY_DSN` and the auth token as `SENTRY_AUTH_TOKEN`.
- **Blocks:** Nothing until launch.
- **Requested in:** Plan.

### T-18 — Card processor (OD-4, OD-15, OD-19, OD-20)

- **What:** Ask processors the §16 questions and pick one; decide Monthly-on-card, card-during-pass behaviour, and grace period.
- **Why:** Real card payments can't be built without a processor.
- **Blocks:** Phase 7c only. Launch is not blocked.
- **Requested in:** Plan.

### T-19 — Threshold and limit values

- **What:** Approve or change each value below. Recommendations are mine unless marked "spec".
- **Why:** Spec rule 9: no invented numbers in business logic. Keys exist in `app_settings` with no default; DEV-ONLY values in `seed.sql` until you approve.

| Setting key                                                       | Meaning                          | Recommendation                 | Needed by |
| ----------------------------------------------------------------- | -------------------------------- | ------------------------------ | --------- |
| `otp.max_per_phone_per_hour`                                      | OTP sends per phone              | 5                              | Phase 1   |
| `otp.max_per_ip_per_hour`                                         | OTP sends per IP                 | 20                             | Phase 1   |
| `geo.enforcement_mode`                                            | SIGNUP_ONLY / EVERY_SESSION      | SIGNUP_ONLY (spec)             | Phase 1   |
| `photos.max_per_user`                                             | Max photos                       | 6 (spec "recommended")         | Phase 3   |
| `photos.max_upload_bytes`                                         | Upload size cap                  | 10 MB                          | Phase 3   |
| `photos.uploads_per_day`                                          | Upload rate limit                | 30                             | Phase 3   |
| `storage.signed_url_ttl_seconds`                                  | Signed URL lifetime              | 120 (spec)                     | Phase 3   |
| `verification.rejections_before_escalation`                       | Repeated rejections → admin      | 3                              | Phase 4   |
| `verification.pose_prompts`                                       | Pose list                        | I propose 8 prompts in Phase 4 | Phase 4   |
| `reports.auto_hide_threshold`                                     | Distinct reporters / 24 h        | 3 (spec)                       | Phase 5   |
| `reports.per_user_per_day`                                        | Report rate limit                | 10                             | Phase 5   |
| `relationship.pass_cooldown_days`                                 | Passed profile returns after     | 30                             | Phase 6   |
| `relationship.daily_like_cap`                                     | OD-10                            | — your call                    | Phase 6   |
| `claims.rejections_before_flag`                                   | Rejected claims → member flagged | 3                              | Phase 7   |
| `claims.evidence_max_bytes`                                       | Screenshot size cap              | 10 MB                          | Phase 7   |
| `availability.max_window_hours`                                   | OD-8                             | 12 (spec)                      | Phase 8   |
| `availability.max_lead_days`                                      | OD-8                             | 7 (spec)                       | Phase 8   |
| `signals.short_window_minutes` / `signals.short_windows_per_week` | "Frequent short windows" flag    | 30 min / 5 per week            | Phase 8   |
| `requests.daily_cap`                                              | OD-9                             | — your call                    | Phase 9   |
| `requests.decline_cooldown_days`                                  | OD-9                             | — your call                    | Phase 9   |
| `requests.expiry_hours`                                           | Q2                               | 24 h or window end             | Phase 9   |
| `signals.requests_burst`                                          | "Many requests in a short time"  | 10 in 10 min                   | Phase 9   |
| `signals.duplicate_text_recipients`                               | "Same text to many members"      | 5 in 24 h                      | Phase 9   |

- **Steps:** Reply "approve T-19" or list changes.
- **Blocks:** Each phase in the last column (I can build with DEV-ONLY values but can't call the phase complete without approved values).
- **Requested in:** Plan.

### T-20 — Web push keys (only if Q3 = web push)

- **What:** Nothing yet — I'll generate VAPID keys with a script on your machine and you put them in env as `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`.
- **Blocks:** Phase 11.
- **Requested in:** Plan.

### T-21 — Product decisions by phase

| Decision                                                          | Needed by   |
| ----------------------------------------------------------------- | ----------- |
| OD-3 photo visibility in Relationship (rec. A)                    | Phase 3     |
| Q5 staff login method                                             | Phase 3     |
| OD-5 ID document before Casual (rec. yes — adds scope to Phase 4) | Phase 4     |
| OD-6 selfie retention (rec. delete 90 days after approval)        | Phase 4     |
| Q1 review time text                                               | Phase 4     |
| Q4 staff access to messages                                       | Phase 5     |
| OD-10 like cap; Q6 Saved in Relationship                          | Phase 6     |
| Q10 "Get a pass" copy (follows OD-3)                              | Phase 7     |
| OD-8 window caps                                                  | Phase 8     |
| OD-9 request cap + cool-down; Q2 request expiry                   | Phase 9     |
| OD-7 deletion retention; Q12 manual extension                     | Phase 10    |
| Q3 notification channels                                          | Phase 11    |
| Q9, Q11 (confirmations)                                           | Phase 5 / 6 |

- **Requested in:** Plan.
