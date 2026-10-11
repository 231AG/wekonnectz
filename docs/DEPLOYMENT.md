# Deploying WeKonnectz (Vercel + hosted Supabase)

This is the checklist for putting the app online. The order matters: the database first, then the app, then the
dashboard settings, then the first staff account.

**Never paste a key or password into chat.** Each step says where a value goes. Once it's set, tell me the variable
name and I'll check it exists without printing it.

## What works today on a hosted copy

| Area                                                     | Works on Vercel now? | Why / what it needs                                                                                                                                                                                              |
| -------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public pages (home, pricing, rules, safety, legal)       | Yes                  | Legal pages are placeholders until T-12.                                                                                                                                                                         |
| Staff console (sign-in, MFA, queues, users, settings)    | Yes                  | Needs the database, env vars and the first SUPER_ADMIN (step 6).                                                                                                                                                 |
| **Member sign-up and login**                             | **No**               | Codes are sent by SMS. The only SMS provider built is the local fake; it refuses to run in production and can't write files on Vercel. Needs T-04 (a real SMS provider — I add the adapter once you choose one). |
| Mobile money Casual access                               | After sign-up works  | Needs plan prices and wallets (T-29, T-13).                                                                                                                                                                      |
| Card payments                                            | No (by design)       | `CARD_PAYMENTS_ENABLED=0` until a processor is chosen (T-18 / OD-4).                                                                                                                                             |
| Phone notifications                                      | After T-20           | In-app notifications work without it.                                                                                                                                                                            |
| Scheduled jobs (selfie deletion, purge, reminders, etc.) | After T-27           | Each job refuses to run without `CRON_SECRET`.                                                                                                                                                                   |

So a Vercel deployment today is a **private staging site**: good for checking the public pages and the staff
console on real hosting, not yet for members.

## 1. Supabase project (T-06 for staging, T-08 for production)

1. supabase.com → New project. Use `wekonnectz-dev` for staging, `wekonnectz-prod` for launch (production: a paid
   plan with daily backups and the PITR add-on). Pick the region closest to Liberia that is offered (London or
   Frankfurt). Keep the database password in your password manager.
2. Apply the schema from your computer, in the project folder:
   ```bash
   pnpm exec supabase login
   pnpm exec supabase link --project-ref <your-project-ref>
   pnpm exec supabase db push        # applies supabase/migrations in order
   ```
   **Do not** run `supabase/seed.sql` against a hosted project. It holds fictional data and DEV-ONLY settings.
3. Phone-hashing secret (T-24): SQL Editor → run once
   `select vault.create_secret(encode(gen_random_bytes(48), 'base64'), 'phone_hash_pepper', 'Phone hashing pepper');`
   Never change it after launch.
4. Reference data: areas (T-09) and interests (T-10). I load them with a migration once you send the lists.
5. Settings: every `[DECISION]` value is an `app_settings` row with no value until you approve it (T-19, T-29,
   OD-7 …). Sign-up refuses to work while the OTP limits are empty. After the first SUPER_ADMIN exists, set them in
   the console (Settings screen).

## 2. Supabase dashboard settings (must match `supabase/config.toml`)

Authentication → Sign In / Providers:

- **Allow new users to sign up: off.** Only our server creates member accounts.
- Anonymous sign-ins: off. Manual linking: off.
- Phone provider: on, **confirm phone: on**. SMS goes through the Send-SMS hook below, so the provider's own SMS
  settings are unused.
- Email provider: on (staff only), with sign-ups off. Minimum password length 12; lower + upper case + digits.
- SMS OTP expiry: **5 minutes** (our server refuses codes older than 10 minutes anyway) (the screen offers "resend" after 60 s). Resend interval 60 s.

Authentication → Multi-factor: **TOTP on**. Phone MFA off.

Authentication → Hooks:

| Hook                          | Type     | Target                                          |
| ----------------------------- | -------- | ----------------------------------------------- |
| Before user created           | Postgres | `public.hook_before_user_created`               |
| Password verification attempt | Postgres | `public.hook_password_verification_attempt`     |
| Custom access token           | Postgres | `public.hook_custom_access_token`               |
| Send SMS                      | HTTPS    | `https://<your-domain>/api/auth/hooks/send-sms` |

When you add the Send SMS hook, Supabase generates a secret that starts with `v1,whsec_`. Put it in Vercel as
`SEND_SMS_HOOK_SECRET` (step 3) — not in chat.

Authentication → Rate limits. Every Auth call comes from our server, so Supabase sees **one IP** (Vercel's). Our
own per-phone and per-IP limits run first (see `SECURITY.md` → Rate limits). Set:

- SMS sent per hour (whole project): sized to launch traffic, e.g. 500 (T-19).
- Sign-ups and sign-ins per 5 min per IP: e.g. 300.
- Token refreshes per 5 min per IP: e.g. 300.
- Token verifications per 5 min per IP: **low, e.g. 30**. Our server makes one verify per correct code; guesses
  sent straight to Supabase are refused by the custom access token hook anyway (they never open a session).

Project Settings → Realtime: **turn off "Allow public access"** (T-28).

Storage: the buckets, size limits and policies come from the migrations. Nothing to click.

## 3. Vercel project

1. vercel.com → Add New → Project → import the GitHub repository. Framework: Next.js (detected). Install command
   `pnpm install`, build command `pnpm build` (defaults).
2. **Plan.** Vercel's free Hobby plan is for non-commercial use only; WeKonnectz takes payments, so production
   should be on **Pro**. Hobby is fine for a private staging copy. All five of our cron jobs are daily, which Hobby allows (Hobby runs each one some time within its hour; Pro runs it on the minute).
3. Settings → Functions → region: the one nearest your Supabase region (e.g. `lhr1` for London, `fra1` for Frankfurt).
   Every page talks to the database, so this matters more than being near users.
4. Settings → Environment Variables (Production, and Preview if you use previews):

| Variable                        | Value                                                                                         | Secret? |
| ------------------------------- | --------------------------------------------------------------------------------------------- | ------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase → Project Settings → API → URL                                                       | No      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page → anon / publishable key                                                            | No      |
| `SUPABASE_SERVICE_ROLE_KEY`     | Same page → service_role / secret key                                                         | **Yes** |
| `APP_COOKIE_SECRET`             | 32+ random characters (password-manager generator)                                            | **Yes** |
| `SEND_SMS_HOOK_SECRET`          | The `v1,whsec_…` value from the Send SMS hook                                                 | **Yes** |
| `SMS_PROVIDER`                  | `fake` for now — Preview deployments only (it refuses Production). Changes when T-04 is done. | No      |
| `CRON_SECRET`                   | 32+ random characters (T-27)                                                                  | **Yes** |
| `CARD_PAYMENTS_ENABLED`         | `0`                                                                                           | No      |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`  | From `pnpm exec web-push generate-vapid-keys` (T-20)                                          | No      |
| `VAPID_PRIVATE_KEY`             | Same command (T-20)                                                                           | **Yes** |
| `VAPID_SUBJECT`                 | `mailto:` + a support address you read                                                        | No      |
| `NEXT_PUBLIC_SENTRY_DSN`        | Optional, from Sentry (T-17)                                                                  | No      |

Leave `SMS_DEV_OUTBOX_DIR` unset. **Never set** on Vercel: `GEO_TRUST_HEADER`, `DEV_GEO_COUNTRY`, `ALLOW_FAKE_CARD_PROCESSOR`, `CARD_PROCESSOR`,
`FAKE_CARD_WEBHOOK_SECRET`, `ENABLE_UI_KIT`. On Vercel the Liberia check reads Vercel's own country header.

5. Deploy. Then Settings → Domains → add your domain (T-16). HTTPS is automatic.
6. Update the Send SMS hook URL in Supabase to the final domain if it changed.

## 4. Scheduled jobs

`vercel.json` already lists them; Vercel runs them once `CRON_SECRET` is set. Times are UTC (= Liberia time).

| Job                          | When  | Does                                                          |
| ---------------------------- | ----- | ------------------------------------------------------------- |
| `/api/cron/selfie-retention` | 03:17 | Deletes selfies past the retention period (OD-6)              |
| `/api/cron/payments`         | 03:37 | Expires passes and checkouts, deletes old payment screenshots |
| `/api/cron/availability`     | 03:47 | Tidies ended availability windows, expires old requests       |
| `/api/cron/account-purge`    | 03:57 | Purges deleted accounts after OD-7 and abandoned sign-ups     |
| `/api/cron/reminders`        | 09:07 | Pass-ending and card-renewal reminders                        |

Vercel → Project → Cron Jobs shows each run; a job that returns an error is listed there.

## 5. Check the deployment

- `https://<domain>/` loads; the browser console shows no Content-Security-Policy errors.
- Response headers include `Content-Security-Policy` with a nonce and `Strict-Transport-Security`.
- `https://<domain>/manifest.webmanifest` loads; on a phone, "Add to Home Screen" offers WeKonnectz.
- `https://<domain>/api/cron/reminders` without the secret returns 401.

## 6. First staff account (T-07)

On your computer, put the hosted `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in
`.env.production.local` (gitignored), then:

```bash
pnpm admin:create-first --email you@yourdomain --env-file .env.production.local
```

Type the password when asked (hidden). Open `/admin/login`, sign in and scan the QR code with your authenticator
app. Other staff are created from the Staff screen. Delete `.env.production.local` afterwards if you don't need it.

## 7. Before real members (launch gate)

- [ ] Real SMS provider chosen and tested on Orange and Lonestar Cell MTN (T-04)
- [ ] Production project on a plan with backups + PITR (T-08); **restore drill done** (below)
- [ ] Legal documents reviewed (T-12) and loaded as new versions
- [ ] Areas and interests loaded (T-09, T-10); limits approved (T-19); prices and wallets (T-29, T-13)
- [ ] CAPTCHA decision (T-25)
- [ ] Sentry DSN set (T-17) so errors are seen

## Backup restore drill (needs T-08)

Do this once before launch and after any big schema change. It proves backups can actually be restored.

1. Supabase → Database → Backups: note the latest daily backup (or pick a PITR time a few minutes ago).
2. Restore it **into a new project** (Backups → "Restore to new project"), never over production.
3. On the restored project, in the SQL Editor:
   - `select count(*) from public.users;` and `select count(*) from public.subscriptions;` match production at
     the backup time (roughly);
   - `select max(created_at) from public.audit_logs;` is close to the backup time;
   - `select public.get_setting('photos.min_required');` returns a value (settings survived);
   - the Vault secret exists: `select count(*) from vault.secrets where name = 'phone_hash_pepper';` is 1.
4. Point a Vercel **preview** deployment at the restored project (its own env vars), sign in as staff and open one
   member and one payment.
5. Write down the date, how long the restore took, and anything that failed. Delete the restored project.
