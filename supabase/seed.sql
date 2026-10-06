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

-- DEV-ONLY draft document versions until legal review (T-12).
insert into public.legal_documents (document, version, title, is_current) values
  ('RULES', 'draft-2026-10', 'Community rules (draft)', true),
  ('TERMS', 'draft-2026-10', 'Terms of use (draft)', true),
  ('PRIVACY', 'draft-2026-10', 'Privacy policy (draft)', true); -- DEV-ONLY
