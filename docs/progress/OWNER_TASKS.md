# Owner tasks

Things only you can do. IDs never change or get reused.
Never paste secret values into chat. Put them in the file/variable named, and I will check the variable exists without printing it.

Status key: `OPEN` · `DONE (verified by Claude)` · `DONE (confirmed by owner)`

## Summary

| ID   | What                                                                                                                                                   | Blocks                                                   | Status                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| T-01 | Add the WeKonnectz logo files                                                                                                                          | Final colour tokens (Phase 0 sign-off, not the build)    | DONE (confirmed by owner) — logo supplied 5 Oct; an SVG would be sharper (optional) |
| T-02 | Hosting decided: **Vercel** (OD-11). Still to do: create the Vercel account and import the repo                                                        | Phase 1 hosted geo-header check; Phase 12 deploy         | OPEN (decision DONE)                                                                |
| T-03 | Make sure GitHub Actions is enabled on the repo                                                                                                        | Phase 0 CI verification (needs T-22 first)               | OPEN                                                                                |
| T-04 | Choose an SMS provider and test delivery to Orange and Lonestar Cell MTN                                                                               | Phase 1 verification with real phones; launch            | OPEN                                                                                |
| T-05 | Decide OD-12 and OD-14                                                                                                                                 | **Phase 1** (geo code)                                   | DONE (confirmed by owner) — OD-12 country only; OD-14 roaming blocked               |
| T-06 | Create a Supabase _development_ cloud project                                                                                                          | Phase 1 verification of auth hooks on hosted Supabase    | OPEN                                                                                |
| T-07 | Give the list of first staff (who is SUPER_ADMIN, ADMIN, MODERATOR). Login method decided: email + password + TOTP (OD-27)                             | **Phase 3** (staff console)                              | OPEN                                                                                |
| T-08 | Create the Supabase _production_ project on a plan with backups / PITR                                                                                 | Launch (Phase 12)                                        | OPEN                                                                                |
| T-09 | Provide the list of areas (county → communities)                                                                                                       | **Phase 2** (real data; DEV-ONLY sample used until then) | OPEN                                                                                |
| T-10 | Provide the interests list                                                                                                                             | Phase 2 (real data)                                      | OPEN                                                                                |
| T-11 | Review the detection term list — **proposed v1 is live in the migration**; see the list in `supabase/migrations/20261007000000_profile_onboarding.sql` | Phase 2 sign-off                                         | OPEN                                                                                |
| T-12 | Draft Terms, Privacy Policy, Community rules; get Liberian legal review                                                                                | Launch (placeholders until then)                         | OPEN                                                                                |
| T-13 | Register Orange Money and MTN merchant wallets under a neutral name                                                                                    | Launch                                                   | OPEN                                                                                |
| T-14 | Send sample formats of Orange Money / MTN transaction IDs, and answer OD-22                                                                            | **Phase 7**                                              | OPEN                                                                                |
| T-15 | Decide the Phase 7 payment ODs (OD-1, 2, 13, 16, 17, 18, 21)                                                                                           | **Phase 7**                                              | OPEN                                                                                |
| T-16 | Buy / confirm the domain name                                                                                                                          | Launch                                                   | OPEN                                                                                |
| T-17 | Create a Sentry project                                                                                                                                | Before launch (Phase 0 works without it)                 | OPEN                                                                                |
| T-18 | Research and choose a card processor (OD-4, 15, 19, 20)                                                                                                | Phase 7c only (not launch)                               | OPEN                                                                                |
| T-19 | Approve threshold and limit values                                                                                                                     | **Phase 1 sign-off** (OTP limits), then per row below    | OPEN                                                                                |
| T-20 | Web push keys (OD-25 = in-app + web push)                                                                                                              | Phase 11                                                 | OPEN                                                                                |
| T-21 | Remaining product decisions: OD-5, 6 (Phase 4), OD-10 (Phase 6), OD-8 (Phase 8), OD-9 (Phase 9), OD-7 (Phase 10), OD-33 (Phase 5)                      | Per row below                                            | OPEN                                                                                |
| T-22 | Create the `main` branch on GitHub                                                                                                                     | **Phase 0 PR and CI** (a PR needs a base branch)         | OPEN                                                                                |
| T-24 | Create the phone-hashing secret in each hosted Supabase project (Vault)                                                                                | Phase 1 hosted verification (T-06); launch               | OPEN                                                                                |
| T-25 | Decide on CAPTCHA (Cloudflare Turnstile) for sign-in and create the keys                                                                               | Recommended before launch (Phase 12)                     | OPEN                                                                                |
| T-26 | Decide whether members may ever change their phone number (Q13)                                                                                        | Nothing now; a future phase if yes                       | OPEN                                                                                |
| T-23 | Approve design tokens v1 (or tell me what to change)                                                                                                   | Phase 0 sign-off only (Phase 1 can start)                | OPEN                                                                                |

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

- **What:** Create a Supabase cloud project for development/staging and configure Auth like the local setup.
- **Why:** Local Supabase covers the tests, but hooks, phone sign-in and the Vault secret must be proven on hosted Supabase before launch.
- **Steps:**
  1. supabase.com → New project → name `wekonnectz-dev`. Pick the closest region offered (e.g. Frankfurt or London) and a strong DB password, kept in your password manager.
  2. Project Settings → API: put the URL and anon key in `.env.local` as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Put the service role key in `SUPABASE_SERVICE_ROLE_KEY` (never `NEXT_PUBLIC_`). For this cloud session, add the same three in the environment settings instead (environment menu → Edit → environment variables).
  3. Tell me when that's done. I'll then apply the migrations with the Supabase CLI and give you a short checklist for the dashboard settings that must match `supabase/config.toml`:
     - signups off;
     - Phone provider on with the Send-SMS hook;
     - phone confirmations on;
     - before-user-created and password-verification hooks;
     - anonymous sign-ins off.
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
- **Steps:** The proposed v1 list is in `supabase/migrations/20261007000000_profile_onboarding.sql` (search "PROPOSED v1"). Words like "momo", "transport" and "LD" are only caught next to money or numbers, because "Momo" is also a common name. Reply with words to add or remove. Moderators will be able to edit the list in the admin console (Phase 10).
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

| Setting key                                                       | Meaning                             | Recommendation                   | Needed by |
| ----------------------------------------------------------------- | ----------------------------------- | -------------------------------- | --------- |
| `otp.max_per_phone_per_hour`                                      | OTP sends per phone                 | 5                                | Phase 1   |
| `otp.max_per_ip_per_hour`                                         | OTP sends per IP                    | 20                               | Phase 1   |
| Supabase Auth `sms_sent` (per hour, whole project)                | Hard cap on all OTP SMS per hour    | Size to launch traffic, e.g. 500 | Launch    |
| Supabase Auth `sign_in_sign_ups` (per 5 min per IP)               | Our server calls Auth from one IP   | e.g. 300                         | Launch    |
| `geo.enforcement_mode`                                            | SIGNUP_ONLY / EVERY_SESSION         | SIGNUP_ONLY (spec)               | Phase 1   |
| `photos.max_per_user`                                             | Max photos                          | 6 (spec "recommended")           | Phase 3   |
| `photos.max_upload_bytes`                                         | Upload size cap                     | 10 MB                            | Phase 3   |
| `photos.uploads_per_day`                                          | Upload rate limit                   | 30                               | Phase 3   |
| `storage.signed_url_ttl_seconds`                                  | Signed URL lifetime                 | 120 (spec)                       | Phase 3   |
| `verification.rejections_before_escalation`                       | Repeated rejections → admin         | 3                                | Phase 4   |
| `verification.pose_prompts`                                       | Pose list                           | I propose 8 prompts in Phase 4   | Phase 4   |
| `reports.auto_hide_threshold`                                     | Distinct reporters / 24 h           | 3 (spec)                         | Phase 5   |
| `reports.per_user_per_day`                                        | Report rate limit                   | 10                               | Phase 5   |
| `relationship.pass_cooldown_days`                                 | Passed profile returns after        | 30                               | Phase 6   |
| `relationship.daily_like_cap`                                     | OD-10                               | — your call                      | Phase 6   |
| `claims.rejections_before_flag`                                   | Rejected claims → member flagged    | 3                                | Phase 7   |
| `claims.evidence_max_bytes`                                       | Screenshot size cap                 | 10 MB                            | Phase 7   |
| `availability.max_window_hours`                                   | OD-8                                | 12 (spec)                        | Phase 8   |
| `availability.max_lead_days`                                      | OD-8                                | 7 (spec)                         | Phase 8   |
| `signals.short_window_minutes` / `signals.short_windows_per_week` | "Frequent short windows" flag       | 30 min / 5 per week              | Phase 8   |
| `requests.daily_cap`                                              | OD-9                                | — your call                      | Phase 9   |
| `requests.decline_cooldown_days`                                  | OD-9                                | — your call                      | Phase 9   |
| `subscriptions.manual_extension_max_days`                         | OD-30 cap on admin manual extension | 7 days                           | Phase 10  |
| `signals.requests_burst`                                          | "Many requests in a short time"     | 10 in 10 min                     | Phase 9   |
| `signals.duplicate_text_recipients`                               | "Same text to many members"         | 5 in 24 h                        | Phase 9   |

- **Steps:** Reply "approve T-19" or list changes.
- **Blocks:** Each phase in the last column (I can build with DEV-ONLY values but can't call the phase complete without approved values).
- **Requested in:** Plan.

### T-20 — Web push keys (OD-25: web push confirmed)

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

### T-22 — Create `main`

- **What:** Create a `main` branch in `231ag/wekonnectz`.
- **Why:** One PR per phase goes into `main` (OD-32). A PR needs a base branch, and CI runs on PRs.
- **Steps:**
  1. GitHub → repo → branch dropdown → type `main`.
  2. Create it **from the first commit `736e44e`** ("Add spec, mock-ups and Stage A master plan") so the Phase 0 PR shows only Phase 0 work. (Creating it from `claude/new-session-82wl3k` would include Phase 0 already and leave the PR empty.)
  3. Settings → General → Default branch → `main`.
  4. Optional: Settings → Branches → protect `main` (require PR + the `CI / verify` check).
  5. Reply "main created"; I open the Phase 0 PR and watch CI.
- **Blocks:** Phase 0 PR and CI run.
- **Requested in:** Phase 0.

### T-23 — Design tokens v1

- **What:** Look at `docs/progress/phase-00/screenshots/foundation-ui-kit-full.png` and approve or change the colours.
- **Why:** The mock-ups' gold buttons and blue Relationship colour are replaced by logo colours: primary = orange→coral gradient, Relationship = light purple `#C78BFF`, Casual = orange `#FFA24C`. Gold stays for "pending" badges, blue for the verified tick.
- **Steps:** Reply "tokens approved" or say what to change.
- **Blocks:** Phase 0 sign-off only.
- **Requested in:** Phase 0.

### T-24 — Phone-hashing secret (Vault)

- **What:** In each hosted Supabase project (dev, then prod), create the Vault secret that phone numbers are hashed with.
- **Why:** Phone numbers are stored only as keyed hashes. Without this secret, signup refuses to run (it fails closed).
- **Steps:**
  1. Supabase dashboard → SQL Editor → New query.
  2. Run: `select vault.create_secret(encode(gen_random_bytes(48), 'base64'), 'phone_hash_pepper', 'Phone hashing pepper');`
  3. Don't copy or save the value anywhere. It never needs to leave the database. **Never change it after launch**: every stored hash would stop matching, including the banned-number list.
  4. Reply "pepper created in dev" (and later "in prod").
- **Blocks:** hosted verification of Phase 1 (dev); launch (prod).
- **Requested in:** Phase 1.

### T-25 — CAPTCHA (Cloudflare Turnstile)

- **What:** Decide whether to add a CAPTCHA to sign-up and login. If yes, create a Turnstile site in Cloudflare.
- **Why:** Anyone can ask Supabase to text a code to an existing member's number. Limits stop large abuse, but a determined person can use up one member's hourly codes. A CAPTCHA stops scripted abuse and saves SMS money.
- **Steps (if yes):** Cloudflare dashboard → Turnstile → Add site (your domain). Put the site key in `.env.local` as `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Enter the secret key directly into Supabase → Authentication → Attack Protection, never into chat.
- **Blocks:** nothing now; recommended before launch.
- **Requested in:** Phase 1.

### T-26 — Phone number changes (Q13)

- **What:** Decide whether a member may ever change their phone number.
- **Why:** The spec doesn't cover it. A change must re-apply the +231, banned-number and Liberia rules, or it becomes a way around them. For now I've blocked phone changes completely.
- **Steps:** Reply "no changes in MVP" (my recommendation; members contact support), or "allow" and I'll plan a reviewed flow.
- **Blocks:** nothing now.
- **Requested in:** Phase 1.
