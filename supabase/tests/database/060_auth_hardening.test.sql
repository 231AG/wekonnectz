-- Phase 1 audit fixes: bans end sessions, writes need an account that can act, no member passwords,
-- no phone changes, staff check needs MFA, hook replays refused, DOB plausibility.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, phone, aud, role) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '231770000501', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '231770000502', 'authenticated', 'authenticated');
insert into auth.sessions (id, user_id) values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001');

-- BR-6: a ban ends existing sessions (refresh tokens go with them).
update public.users set status = 'BANNED' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select is((select count(*)::int from auth.sessions where user_id = 'bbbbbbbb-0000-0000-0000-000000000001'), 0,
  'BR-6: banning deletes the member''s sessions');

-- BR-6: an access token issued before the ban cannot write.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}', true);
select ok(not public.current_user_can_act(), 'BR-6: banned member cannot act');
select throws_ok($$ select public.set_date_of_birth('1990-01-01') $$, '42501', 'NO_ACCOUNT',
  'BR-6: banned member cannot record a DOB with an old token');

-- Consents are read-only for members until the Phase 2 RPC exists.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);
select ok(public.current_user_can_act(), 'a PENDING member can act');
select throws_ok($$ insert into public.consents (user_id, document, version) values ('bbbbbbbb-0000-0000-0000-000000000002', 'TERMS', 'bogus') $$,
  '42501', null, 'members cannot insert consents directly');

-- DOB plausibility is enforced in the database, not only in the app.
select throws_ok($$ select public.set_date_of_birth('1850-01-01') $$, '22023', 'IMPLAUSIBLE_DOB',
  'DOB more than 120 years ago is refused');

-- is_staff: role AND MFA (aal2).
select ok(not public.is_staff('MODERATOR'), 'a USER is not staff');
reset role;
update public.users set role = 'ADMIN' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}', true);
select ok(not public.is_staff('MODERATOR'), 'staff without MFA (aal1) is not treated as staff');
-- Phase 3: aal2 must come from password + TOTP; an email magic link / OTP session never counts.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1},{"method":"totp","timestamp":2}]}', true);
select ok(not public.is_staff('MODERATOR'), 'staff signed in by email link + TOTP (no password) is not treated as staff');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2","amr":[{"method":"password","timestamp":1},{"method":"totp","timestamp":2}]}', true);
select ok(public.is_staff('MODERATOR'), 'ADMIN with password + MFA passes a MODERATOR check');
select ok(public.is_staff('ADMIN'), 'ADMIN with MFA passes an ADMIN check');
select ok(not public.is_staff('SUPER_ADMIN'), 'ADMIN does not pass a SUPER_ADMIN check');
reset role;

-- Members never sign in with a password; staff may.
select is(public.hook_password_verification_attempt(
  '{"user_id":"bbbbbbbb-0000-0000-0000-000000000001","valid":true}') ->> 'decision', 'reject',
  'password sign-in refused for a member account');
select is(public.hook_password_verification_attempt(
  '{"user_id":"bbbbbbbb-0000-0000-0000-000000000002","valid":true}') ->> 'decision', 'continue',
  'password sign-in allowed for a staff account (then MFA)');
select is(public.hook_password_verification_attempt(
  '{"user_id":"bbbbbbbb-0000-0000-0000-0000000000ff","valid":true}') ->> 'decision', 'reject',
  'password sign-in refused for an unknown user');

-- BR-2 / BR-3: phone numbers cannot be changed.
select throws_ok($$ update auth.users set phone_change = '12025550199' where id = 'bbbbbbbb-0000-0000-0000-000000000002' $$,
  '42501', 'PHONE_CHANGE_NOT_ALLOWED', 'requesting a phone change is refused');
select throws_ok($$ update auth.users set phone = '231770000999' where id = 'bbbbbbbb-0000-0000-0000-000000000002' $$,
  '42501', 'PHONE_CHANGE_NOT_ALLOWED', 'changing the phone number is refused');
select lives_ok($$ update auth.users set phone_confirmed_at = now() where id = 'bbbbbbbb-0000-0000-0000-000000000002' $$,
  'other auth updates (e.g. confirming the phone) still work');

-- Hook replay protection.
select ok(public.claim_hook_receipt('msg_test_1'), 'first delivery of a hook message is processed');
select ok(not public.claim_hook_receipt('msg_test_1'), 'a replayed hook message is refused');
select lives_ok($$ select public.release_hook_receipt('msg_test_1') $$, 'a failed delivery releases its message id');
select ok(public.claim_hook_receipt('msg_test_1'), 'a retry after a failed delivery is processed');

-- Members never store a password; staff may.
select throws_ok($$ update auth.users set encrypted_password = 'x' where id = 'bbbbbbbb-0000-0000-0000-000000000001' $$,
  '42501', 'PASSWORD_NOT_ALLOWED', 'a member account cannot get a password');
select lives_ok($$ update auth.users set encrypted_password = 'x' where id = 'bbbbbbbb-0000-0000-0000-000000000002' $$,
  'a staff account can have a password');

select * from finish();
rollback;
