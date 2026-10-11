-- Phase 12: OTP code attempts (§22) and the purge of abandoned sign-ups.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

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

-- Discover (§11) set-based rewrite = the per-member rules. 40 fictional members with a mix of
-- disqualifiers; the viewer is a woman seeking men.
insert into auth.users (id, phone, aud, role)
select ('bbbbbbbb-1200-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '2317713' || lpad(n::text, 4, '0'), 'authenticated', 'authenticated'
from generate_series(0, 40) n;
insert into public.profiles (user_id, date_of_birth, display_name, gender, seeking_genders, intent_relationship, intent_casual, is_profile_complete)
select ('bbbbbbbb-1200-4000-8000-' || lpad(n::text, 12, '0'))::uuid, date '1990-01-01' + n * 30, 'Member ' || n,
       case when n = 0 or n % 7 = 0 then 'WOMAN' else 'MAN' end::public.gender,
       array[case when n = 0 or n % 5 <> 0 then (case when n = 0 then 'MAN' else 'WOMAN' end) else 'MAN' end]::public.gender[],
       n % 11 <> 0 or n = 0, true, true
from generate_series(0, 40) n;
insert into public.profile_photos (user_id, status, storage_path, sort_order, is_primary, reviewed_as_primary, submitted_at)
select ('bbbbbbbb-1200-4000-8000-' || lpad(n::text, 12, '0'))::uuid, case when n % 9 = 0 and k = 2 and n > 0 then 'PENDING_REVIEW' else 'APPROVED' end::public.photo_status,
       gen_random_uuid() || '.webp', k, k = 0, k = 0, now()
from generate_series(0, 40) n, generate_series(0, 2) k;
insert into public.verifications (user_id, pose_prompt, status, rejection_reason, selfie_storage_path, submitted_at, reviewed_at)
select ('bbbbbbbb-1200-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'Touch your ear',
       case when n % 13 = 0 and n > 0 then 'REJECTED' else 'VERIFIED' end::public.verification_status,
       case when n % 13 = 0 and n > 0 then 'UNCLEAR' end::public.verification_rejection_reason,
       gen_random_uuid() || '.webp', now(), now()
from generate_series(0, 40) n;
update public.users set status = 'ACTIVE' where id::text like 'bbbbbbbb-1200-4000-8000-%';
update public.users set hidden_reason = 'REPORT_THRESHOLD', hidden_at = now() where id = 'bbbbbbbb-1200-4000-8000-000000000003';
update public.users set suspended_until = now() + interval '1 day' where id = 'bbbbbbbb-1200-4000-8000-000000000004';
insert into public.blocks (blocker_id, blocked_id) values ('bbbbbbbb-1200-4000-8000-000000000006', 'bbbbbbbb-1200-4000-8000-000000000000');
insert into public.likes (sender_id, receiver_id) values ('bbbbbbbb-1200-4000-8000-000000000000', 'bbbbbbbb-1200-4000-8000-000000000008');
select is(
  (select array_agg(card ->> 'user_id') from public.discover_candidates('bbbbbbbb-1200-4000-8000-000000000000', p_limit => 20)),
  (select array_agg(x.id::text) from (
     select o.user_id as id from public.profiles o
     where o.user_id <> 'bbbbbbbb-1200-4000-8000-000000000000'
       and public.relationship_eligible(o.user_id)
       and public.relationship_compatible('bbbbbbbb-1200-4000-8000-000000000000', o.user_id)
       and not public.is_blocked_pair('bbbbbbbb-1200-4000-8000-000000000000', o.user_id)
       and not exists (select 1 from public.likes l where l.sender_id = 'bbbbbbbb-1200-4000-8000-000000000000' and l.receiver_id = o.user_id)
     order by md5('bbbbbbbb-1200-4000-8000-000000000000' || o.user_id::text || current_date::text)
     limit 20) x),
  'Phase 12: the set-based Discover returns exactly what the per-member rules allow, in the same order');
select ok((select count(*) from public.discover_candidates('bbbbbbbb-1200-4000-8000-000000000000', p_limit => 20)) between 5 and 20,
  '…and the comparison is meaningful (several members qualify, several don''t)');

select * from finish();
rollback;
