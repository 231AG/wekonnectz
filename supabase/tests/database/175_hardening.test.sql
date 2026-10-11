-- Phase 12: OTP code attempts (§22) and the purge of abandoned sign-ups.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- Code attempts: 3 per phone and 5 per IP for this test.
update public.app_settings set value = '3' where key = 'otp.max_verify_per_phone_per_hour';
update public.app_settings set value = '5' where key = 'otp.max_verify_per_ip_per_hour';
set local role authenticated;
select throws_ok($$ select public.otp_verify_allowed('+231770123456', '1.2.3.4') $$, '42501', null, 'clients can''t call the attempt check');
reset role;
set local role service_role;
select ok(public.otp_verify_allowed('+231770123456', '1.2.3.4') and public.otp_verify_allowed('+231770123456', '1.2.3.4')
          and public.otp_verify_allowed('+231770123456', '1.2.3.4'), '§22: the first attempts for a phone are allowed');
select ok(not public.otp_verify_allowed('+231770123456', '1.2.3.5'), '§22: then that phone is blocked, from any IP');
select ok(public.otp_verify_allowed('+231770999888', '1.2.3.4'), 'another phone can still try');
select ok(public.otp_verify_allowed('+231770777666', '1.2.3.4'), 'the fifth attempt from one IP is still allowed');
select ok(not public.otp_verify_allowed('+231770666555', '1.2.3.4'), '§22: and one IP is limited across phones');
reset role;
update public.app_settings set value = null where key = 'otp.max_verify_per_phone_per_hour';
set local role service_role;
select throws_ok($$ select public.otp_verify_allowed('+231770555444', '9.9.9.9') $$, 'P0001', null,
  '§6 rule 9: fails closed while the limit is unset');
reset role;

-- Abandoned sign-ups: three PENDING accounts that last signed in 40 days ago (limit 30 in this test).
update public.app_settings set value = '30' where key = 'account.abandoned_signup_days';
insert into auth.users (id, phone, aud, role, created_at, last_sign_in_at) values
  ('aaaaaaaa-1200-0000-0000-000000000001', '231770120001', 'authenticated', 'authenticated', now() - interval '60 days', now() - interval '40 days'),
  ('aaaaaaaa-1200-0000-0000-000000000002', '231770120002', 'authenticated', 'authenticated', now() - interval '60 days', now() - interval '40 days'),
  ('aaaaaaaa-1200-0000-0000-000000000003', '231770120003', 'authenticated', 'authenticated', now() - interval '60 days', now() - interval '2 days');
insert into public.profiles (user_id, date_of_birth) values ('aaaaaaaa-1200-0000-0000-000000000002', '1995-01-01');
insert into public.verifications (user_id, pose_prompt, status, selfie_storage_path, submitted_at)
values ('aaaaaaaa-1200-0000-0000-000000000002', 'Touch your ear', 'PENDING', gen_random_uuid() || '.webp', now() - interval '40 days');
set local role service_role;
select ok(exists (select 1 from public.accounts_due_for_purge() where user_id = 'aaaaaaaa-1200-0000-0000-000000000001'),
  'a sign-up that never finished and went quiet is purged');
select ok(not exists (select 1 from public.accounts_due_for_purge() where user_id = 'aaaaaaaa-1200-0000-0000-000000000002'),
  '…but not one waiting for staff to review it');
select ok(not exists (select 1 from public.accounts_due_for_purge() where user_id = 'aaaaaaaa-1200-0000-0000-000000000003'),
  '…nor one that signed in recently');
reset role;
update public.app_settings set value = null where key = 'account.abandoned_signup_days';
set local role service_role;
select ok(not exists (select 1 from public.accounts_due_for_purge() where user_id = 'aaaaaaaa-1200-0000-0000-000000000001'),
  '§6 rule 9: no abandoned sign-up is purged while the period is unset');
reset role;

select * from finish();
rollback;
