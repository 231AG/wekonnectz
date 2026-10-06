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
