-- Seed data for LOCAL DEVELOPMENT and TESTS only. Fictional people only.
-- Every value below is DEV-ONLY. Never copy any of it into a migration or production.

-- DEV-ONLY phone hashing pepper. Production sets its own random secret in Vault (owner task T-24).
select vault.create_secret(
  'dev-only-pepper-0123456789abcdef0123456789abcdef',
  'phone_hash_pepper',
  'DEV-ONLY phone hashing pepper'
);

-- DEV-ONLY limits until the owner approves T-19. Generous so tests are not throttled.
update public.app_settings set value = '20'::jsonb where key = 'otp.max_per_phone_per_hour'; -- DEV-ONLY
update public.app_settings set value = '200'::jsonb where key = 'otp.max_per_ip_per_hour';   -- DEV-ONLY
update public.app_settings set value = '50'::jsonb where key = 'photos.max_uploads_per_hour'; -- DEV-ONLY
update public.app_settings set value = '200'::jsonb where key = 'staff_login.max_per_ip_per_hour';      -- DEV-ONLY
update public.app_settings set value = '20'::jsonb where key = 'staff_login.max_per_account_per_hour';  -- DEV-ONLY
update public.app_settings set value = '100'::jsonb where key = 'staff_login.max_per_account_all_ips_per_hour'; -- DEV-ONLY

-- DEV-ONLY area list until the owner provides the real one (T-09). The 15 counties of Liberia, with a few
-- Monrovia communities taken from the mock-ups; every other county has a single placeholder entry.
insert into public.areas (county, name) values
  ('Montserrado', 'Sinkor'), ('Montserrado', 'Congo Town'), ('Montserrado', 'Mamba Point'),
  ('Montserrado', 'Paynesville'), ('Montserrado', 'Old Road'), ('Montserrado', 'Duala'),
  ('Bomi', 'Tubmanburg'), ('Bong', 'Gbarnga'), ('Gbarpolu', 'Bopolu'), ('Grand Bassa', 'Buchanan'),
  ('Grand Cape Mount', 'Robertsport'), ('Grand Gedeh', 'Zwedru'), ('Grand Kru', 'Barclayville'),
  ('Lofa', 'Voinjama'), ('Margibi', 'Kakata'), ('Maryland', 'Harper'), ('Nimba', 'Sanniquellie'),
  ('River Cess', 'Cestos City'), ('River Gee', 'Fish Town'), ('Sinoe', 'Greenville'); -- DEV-ONLY

-- DEV-ONLY interests until the owner provides the list (T-10). First four come from the mock-ups.
insert into public.interests (name, slug) values
  ('Music', 'music'), ('Food', 'food'), ('Travel', 'travel'), ('Fitness', 'fitness'),
  ('Football', 'football'), ('Church', 'church'), ('Movies', 'movies'), ('Dancing', 'dancing'),
  ('Reading', 'reading'), ('Business', 'business'), ('Fashion', 'fashion'), ('Cooking', 'cooking'),
  ('Beach', 'beach'), ('Art', 'art'), ('Tech', 'tech'), ('Afrobeats', 'afrobeats'); -- DEV-ONLY

-- DEV-ONLY draft document versions until legal review (T-12). Text is a placeholder, not for use.
insert into public.legal_documents (document, version, title, is_current, body) values
  ('RULES', 'draft-2026-10', 'Community rules', true, $rules$## No selling or buying sex
Offering or asking for sex in exchange for money, airtime, mobile money, gifts, transport fare or anything else gets you removed.

## Adults only
Everyone here is 18 or older. Report anyone who looks younger. No content showing anyone under 18.

## No contact details or prices
Keep phone numbers, WhatsApp or social handles, links and prices out of your bio and first messages.

## Never ask for money
Don’t request or send money to members, for any reason.

## Be yourself
No fake profiles, impersonation, other people’s photos, nudity or sexually explicit photos.$rules$),
  ('TERMS', 'draft-2026-10', 'Terms of use', true, $terms$The Terms of use will be published here after Liberian legal review. Until then this page is a placeholder and does not form an agreement.$terms$),
  ('PRIVACY', 'draft-2026-10', 'Privacy policy', true, $privacy$The Privacy policy will be published here after Liberian legal review. Until then this page is a placeholder.

What we already do: we never collect your precise location, your verification selfie is seen only by reviewers, and phone numbers are stored only in protected form.$privacy$); -- DEV-ONLY

-- DEV-ONLY verification settings until the owner approves T-19 / OD-6. Proposed pose list (no left/right:
-- front cameras mirror the picture).
update public.app_settings set value = '[
  "Hold up two fingers next to your face",
  "Give a thumbs up next to your face",
  "Hold up three fingers next to your face",
  "Put one hand flat on top of your head",
  "Touch your chin with one finger",
  "Cover one eye with your hand",
  "Make an OK sign next to your face",
  "Hold up an open hand, palm facing the camera"
]'::jsonb where key = 'verification.pose_prompts'; -- DEV-ONLY
update public.app_settings set value = '3'::jsonb where key = 'verification.rejections_before_escalation'; -- DEV-ONLY
update public.app_settings set value = '90'::jsonb where key = 'verification.selfie_retention_days';   -- DEV-ONLY

-- DEV-ONLY report limits until the owner approves T-19 (spec recommends 3 for the hide threshold).
update public.app_settings set value = '3'::jsonb where key = 'reports.auto_hide_threshold'; -- DEV-ONLY
update public.app_settings set value = '30'::jsonb where key = 'reports.per_user_per_day';   -- DEV-ONLY

-- DEV-ONLY messaging limits until the owner approves T-19.
update public.app_settings set value = '60'::jsonb where key = 'messages.max_per_minute';  -- DEV-ONLY
update public.app_settings set value = '20'::jsonb where key = 'reports.messages_captured'; -- DEV-ONLY

-- DEV-ONLY mobile money set-up until the owner decides OD-1 (prices), T-13 (merchant wallets) and
-- T-14 (transaction-ID formats). Fictional wallet numbers. Never copy into production.
insert into public.subscription_plans (code, name, source, duration_hours, price, sort_order) values
  ('MM_DAY', 'Day Pass', 'MOBILE_MONEY', 24, 1.00, 1),          -- DEV-ONLY price
  ('MM_7DAY', '7-Day Pass', 'MOBILE_MONEY', 168, 5.00, 2),      -- DEV-ONLY price
  ('MM_MONTH', 'Monthly', 'MOBILE_MONEY', 720, 15.00, 3)        -- DEV-ONLY price
on conflict (code) do nothing;
insert into public.merchant_accounts (provider, display_name, number_or_code) values
  ('ORANGE_MONEY', 'DEV-ONLY WK Services', '0770000001'),        -- DEV-ONLY fictional
  ('MTN_MOMO', 'DEV-ONLY WK Services', '0880000001');           -- DEV-ONLY fictional
update public.app_settings set value = '{"ORANGE_MONEY": "^[A-Z0-9.]{6,30}$", "MTN_MOMO": "^[0-9]{6,20}$"}'::jsonb
  where key = 'claims.transaction_id_patterns';                  -- DEV-ONLY
update public.app_settings set value = '3'::jsonb where key = 'claims.rejections_before_flag';     -- DEV-ONLY
update public.app_settings set value = '90'::jsonb where key = 'claims.evidence_retention_days';  -- DEV-ONLY
-- Phase 7b card scaffold: plans and values for the fake processor only (OD-1, OD-15, OD-19, OD-20 open).
insert into public.subscription_plans (code, name, source, duration_hours, price, renews, processor_price_id, sort_order) values
  ('CARD_WEEKLY', 'Weekly', 'CARD', 168, 3.00, true, 'CARD_WEEKLY', 1),     -- DEV-ONLY price
  ('CARD_MONTHLY', 'Monthly', 'CARD', 720, 10.00, true, 'CARD_MONTHLY', 2)  -- DEV-ONLY price
on conflict (code) do nothing;
update public.app_settings set value = '48'::jsonb where key = 'card.grace_hours';                         -- DEV-ONLY
update public.app_settings set value = 'true'::jsonb where key = 'card.allow_during_mobile_money_pass';    -- DEV-ONLY
update public.app_settings set value = '24'::jsonb where key = 'card.renewal_reminder_hours';             -- DEV-ONLY

-- Phase 8 availability: values for local development only (OD-8, T-19 open).
update public.app_settings set value = '12'::jsonb where key = 'availability.max_window_hours';      -- DEV-ONLY
update public.app_settings set value = '7'::jsonb where key = 'availability.max_lead_days';         -- DEV-ONLY
update public.app_settings set value = '30'::jsonb where key = 'availability.short_window_minutes';  -- DEV-ONLY
update public.app_settings set value = '5'::jsonb where key = 'availability.short_windows_per_day'; -- DEV-ONLY
update public.app_settings set value = '30'::jsonb where key = 'availability.max_changes_per_hour';  -- DEV-ONLY

-- Phase 9 requests: values for local development only (OD-9, T-19 open).
update public.app_settings set value = '20'::jsonb where key = 'requests.daily_cap';                 -- DEV-ONLY
update public.app_settings set value = '7'::jsonb where key = 'requests.decline_cooldown_days';      -- DEV-ONLY
update public.app_settings set value = '10'::jsonb where key = 'requests.burst_count';              -- DEV-ONLY
update public.app_settings set value = '10'::jsonb where key = 'requests.burst_minutes';            -- DEV-ONLY
update public.app_settings set value = '5'::jsonb where key = 'requests.duplicate_text_recipients'; -- DEV-ONLY

-- DEV-ONLY account lifecycle and admin values until the owner decides OD-7 (retention after deletion),
-- OD-30 (manual extension cap) and T-19 (export limit).
update public.app_settings set value = '30'::jsonb where key = 'account.deletion_purge_days';          -- DEV-ONLY
update public.app_settings set value = '7'::jsonb where key = 'subscriptions.manual_extension_max_days'; -- DEV-ONLY
update public.app_settings set value = '5'::jsonb where key = 'export.max_per_day';                   -- DEV-ONLY
