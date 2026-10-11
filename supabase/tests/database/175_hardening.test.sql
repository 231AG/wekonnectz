-- Phase 12: OTP code attempts (§22) and the purge of abandoned sign-ups.
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

-- Sign-in codes (§22, Phase 12 audit): the SMS carries our code; our server checks it with limits
-- (3 per phone and 5 per IP in this test) and only then gets Auth's code and a one-minute ticket.
update public.app_settings set value = '3' where key = 'otp.max_verify_per_phone_per_hour';
update public.app_settings set value = '5' where key = 'otp.max_verify_per_ip_per_hour';
set local role authenticated;
select throws_ok($$ select * from public.otp_check_code('+231770123456', '1.2.3.4', '123456') $$, '42501', null,
  'clients can''t check codes');
select throws_ok($$ select public.record_otp_challenge('+231770123456', '654321', '123456') $$, '42501', null,
  'clients can''t record codes');
reset role;
set local role service_role;
select lives_ok($$ select public.record_otp_challenge('231770123456', '654321', '123456') $$, 'the SMS hook records a code');
select is((select outcome from public.otp_check_code('+231770123456', '1.2.3.4', '000000')), 'WRONG', 'a wrong code is refused');
select is((select row(outcome, auth_code)::text from public.otp_check_code('+231770123456', '1.2.3.4', '123456')),
  '(OK,654321)', 'the right code returns Auth''s code to verify with');
select is((select outcome from public.otp_check_code('+231770123456', '1.2.3.9', '123456')), 'OK', '…from any IP');
select is((select outcome from public.otp_check_code('+231770123456', '1.2.3.9', '123456')), 'LIMITED',
  '§22: after 3 attempts that phone is limited, even with the right code');
select is((select outcome from public.otp_check_code('+231770999888', '1.2.3.4', '111111')), 'WRONG', 'another phone can still try');
select is((select outcome from public.otp_check_code('+231770777666', '1.2.3.4', '111111')), 'WRONG', '…the fourth attempt from one IP too');
select is((select outcome from public.otp_check_code('+231770777665', '1.2.3.4', '111111')), 'WRONG', '…the fifth attempt from one IP too');
select is((select outcome from public.otp_check_code('+231770666555', '1.2.3.4', '111111')), 'LIMITED',
  '§22: and one IP is limited across phones');
reset role;
update public.app_settings set value = null where key = 'otp.max_verify_per_phone_per_hour';
set local role service_role;
select throws_ok($$ select * from public.otp_check_code('+231770555444', '9.9.9.9', '123456') $$, 'P0001', null,
  '§6 rule 9: fails closed while the limit is unset');
reset role;
update public.app_settings set value = '3' where key = 'otp.max_verify_per_phone_per_hour';

-- The token hook: a member session needs the ticket, once.
insert into auth.users (id, phone, aud, role) values
  ('aaaaaaaa-1201-0000-0000-000000000001', '231770123456', 'authenticated', 'authenticated'),
  ('aaaaaaaa-1201-0000-0000-000000000002', '231770130002', 'authenticated', 'authenticated'),
  ('aaaaaaaa-1201-0000-0000-000000000003', '231770130003', 'authenticated', 'authenticated');
insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-1201-0000-0000-000000000009', 'moderator.p12@example.test', 'authenticated', 'authenticated');
update public.users set role = 'MODERATOR' where id = 'aaaaaaaa-1201-0000-0000-000000000009';
create temp table hook_event as
  select jsonb_build_object('user_id', 'aaaaaaaa-1201-0000-0000-000000000001', 'authentication_method', 'otp',
                            'claims', jsonb_build_object('sub', 'aaaaaaaa-1201-0000-0000-000000000001')) as e;
select is(public.hook_custom_access_token((select e from hook_event)) -> 'claims' ->> 'sub',
  'aaaaaaaa-1201-0000-0000-000000000001', 'with the ticket from a checked code, the session opens');
select is(public.hook_custom_access_token((select e from hook_event)) -> 'error' ->> 'http_code', '403',
  '…once: the ticket is used up');
select is(public.hook_custom_access_token((select e from hook_event) || '{"authentication_method": "token_refresh"}')
  -> 'claims' ->> 'sub', 'aaaaaaaa-1201-0000-0000-000000000001', 'refreshing an existing session is unaffected');
select is(public.hook_custom_access_token(jsonb_build_object('user_id', 'aaaaaaaa-1201-0000-0000-000000000002',
  'authentication_method', 'otp', 'claims', '{}'::jsonb)) -> 'error' ->> 'http_code', '403',
  '§22: a code verified straight at Supabase Auth (no ticket) opens no session');
select public.record_otp_challenge('+231770130003', '222222', '333333');
select is((select outcome from public.otp_check_code('+231770130003', '5.5.5.5', '333333')), 'OK', 'a checked code…');
update public.otp_challenges set ticket_expires_at = now() - interval '1 second';
select is(public.hook_custom_access_token(jsonb_build_object('user_id', 'aaaaaaaa-1201-0000-0000-000000000003',
  'authentication_method', 'otp', 'claims', '{}'::jsonb)) -> 'error' ->> 'http_code', '403', '…whose ticket ran out opens nothing');
select is(public.hook_custom_access_token(jsonb_build_object('user_id', 'aaaaaaaa-1201-0000-0000-000000000009',
  'authentication_method', 'totp', 'claims', '{"sub":"x"}'::jsonb)) -> 'claims' ->> 'sub', 'x',
  'staff sessions (password + TOTP) are unaffected');

-- Staff passwords: the account-wide failure limit lives in the password hook (2 in this test).
update public.app_settings set value = '2' where key = 'staff_login.max_per_account_all_ips_per_hour';
select is(public.hook_password_verification_attempt('{"user_id":"aaaaaaaa-1201-0000-0000-000000000009","valid":true}') ->> 'decision',
  'continue', 'the right staff password continues');
select is(public.hook_password_verification_attempt('{"user_id":"aaaaaaaa-1201-0000-0000-000000000009","valid":false}') ->> 'decision',
  'continue', 'one wrong password: Auth refuses it as usual');
select is(public.hook_password_verification_attempt('{"user_id":"aaaaaaaa-1201-0000-0000-000000000009","valid":false}') ->> 'decision',
  'reject', '§22: at the limit…');
select is(public.hook_password_verification_attempt('{"user_id":"aaaaaaaa-1201-0000-0000-000000000009","valid":true}') ->> 'decision',
  'reject', '…even the right password is refused, wherever the sign-in comes from');
select is(public.hook_password_verification_attempt('{"user_id":"aaaaaaaa-1201-0000-0000-000000000001","valid":true}') ->> 'decision',
  'reject', 'members never sign in with a password');

-- Abandoned sign-ups: PENDING accounts that last signed in 40 days ago (limit 30 in this test).
update public.app_settings set value = '30' where key = 'account.abandoned_signup_days';
insert into auth.users (id, phone, aud, role, created_at, last_sign_in_at)
select ('aaaaaaaa-1200-0000-0000-00000000000' || n)::uuid, '23177012000' || n, 'authenticated', 'authenticated',
       now() - interval '60 days', case when n = 3 then now() - interval '2 days' else now() - interval '40 days' end
from generate_series(1, 7) n;
insert into public.profiles (user_id, date_of_birth) values ('aaaaaaaa-1200-0000-0000-000000000002', '1995-01-01');
insert into public.verifications (user_id, pose_prompt, status, selfie_storage_path, submitted_at)
values ('aaaaaaaa-1200-0000-0000-000000000002', 'Touch your ear', 'PENDING', gen_random_uuid() || '.webp', now() - interval '40 days');
-- 4: a ban that staff lifted (back to PENDING). 5: was live once. 6: still signed in (session refreshed).
-- 7: has an open moderation flag.
insert into public.audit_logs (actor_id, action, entity_type, entity_id)
values ('aaaaaaaa-1201-0000-0000-000000000009', 'USER_RESTORED', 'USER', 'aaaaaaaa-1200-0000-0000-000000000004');
insert into public.notifications (user_id, type) values ('aaaaaaaa-1200-0000-0000-000000000005', 'ACCOUNT_ACTIVE');
insert into auth.sessions (id, user_id, created_at, updated_at)
values (gen_random_uuid(), 'aaaaaaaa-1200-0000-0000-000000000006', now() - interval '40 days', now() - interval '1 hour');
insert into public.moderation_flags (entity_type, entity_id, reason)
values ('USER', 'aaaaaaaa-1200-0000-0000-000000000007', 'AGE_DOUBT');
-- Rows were just written, so move their own timestamps back too (triggers off for this one update).
set local session_replication_role = replica;
update public.users set updated_at = now() - interval '40 days' where id::text like 'aaaaaaaa-1200-0000-0000-%';
update public.profiles set updated_at = now() - interval '40 days' where user_id::text like 'aaaaaaaa-1200-0000-0000-%';
update public.verifications set created_at = now() - interval '40 days' where user_id::text like 'aaaaaaaa-1200-0000-0000-%';
set local session_replication_role = origin;
set local role service_role;
create temp table due as select user_id from public.accounts_due_for_purge(200);
reset role;
select ok(exists (select 1 from due where user_id = 'aaaaaaaa-1200-0000-0000-000000000001'),
  'a sign-up that never finished and went quiet is purged');
select ok(not exists (select 1 from due where user_id = 'aaaaaaaa-1200-0000-0000-000000000002'),
  '…but not one waiting for staff to review it');
select ok(not exists (select 1 from due where user_id = 'aaaaaaaa-1200-0000-0000-000000000003'),
  '…nor one that signed in recently');
select ok(not exists (select 1 from due where user_id = 'aaaaaaaa-1200-0000-0000-000000000004'),
  '…nor one whose ban staff lifted');
select ok(not exists (select 1 from due where user_id = 'aaaaaaaa-1200-0000-0000-000000000005'),
  '…nor one that was live before');
select ok(not exists (select 1 from due where user_id = 'aaaaaaaa-1200-0000-0000-000000000006'),
  '…nor one still using a session');
select ok(not exists (select 1 from due where user_id = 'aaaaaaaa-1200-0000-0000-000000000007'),
  '…nor one with an open moderation flag');
update public.app_settings set value = null where key = 'account.abandoned_signup_days';
set local role service_role;
select ok(not exists (select 1 from public.accounts_due_for_purge(200) where user_id = 'aaaaaaaa-1200-0000-0000-000000000001'),
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
-- The viewer blocked 12, passed 10 yesterday and 23 a month ago (past the cool-down), matched 16.
insert into public.blocks (blocker_id, blocked_id) values ('bbbbbbbb-1200-4000-8000-000000000000', 'bbbbbbbb-1200-4000-8000-000000000012');
insert into public.passes (sender_id, receiver_id, created_at) values
  ('bbbbbbbb-1200-4000-8000-000000000000', 'bbbbbbbb-1200-4000-8000-000000000010', now() - interval '1 day'),
  ('bbbbbbbb-1200-4000-8000-000000000000', 'bbbbbbbb-1200-4000-8000-000000000023', now() - interval '30 days');
insert into public.matches (user_a_id, user_b_id) values ('bbbbbbbb-1200-4000-8000-000000000000', 'bbbbbbbb-1200-4000-8000-000000000016');
select is(
  (select array_agg(card ->> 'user_id') from public.discover_candidates('bbbbbbbb-1200-4000-8000-000000000000', p_limit => 20)),
  (select array_agg(x.id::text) from (
     select o.user_id as id from public.profiles o
     where o.user_id <> 'bbbbbbbb-1200-4000-8000-000000000000'
       and public.relationship_eligible(o.user_id)
       and public.relationship_compatible('bbbbbbbb-1200-4000-8000-000000000000', o.user_id)
       and not public.is_blocked_pair('bbbbbbbb-1200-4000-8000-000000000000', o.user_id)
       and not exists (select 1 from public.likes l where l.sender_id = 'bbbbbbbb-1200-4000-8000-000000000000' and l.receiver_id = o.user_id)
       and not exists (select 1 from public.passes p where p.sender_id = 'bbbbbbbb-1200-4000-8000-000000000000' and p.receiver_id = o.user_id
                       and p.created_at > now() - make_interval(days => (public.get_setting('relationship.pass_cooldown_days'))::int))
       and not exists (select 1 from public.matches m where m.user_a_id = 'bbbbbbbb-1200-4000-8000-000000000000' and m.user_b_id = o.user_id)
     order by md5('bbbbbbbb-1200-4000-8000-000000000000' || o.user_id::text || current_date::text)
     limit 20) x),
  'Phase 12: the set-based Discover returns exactly what the per-member rules allow, in the same order');
select ok((select count(*) from public.discover_candidates('bbbbbbbb-1200-4000-8000-000000000000', p_limit => 20)) between 5 and 20,
  '…and the comparison is meaningful (several members qualify, several don''t)');

select ok(not exists (select 1 from public.discover_candidates('bbbbbbbb-1200-4000-8000-000000000000', p_limit => 20)
                  where card ->> 'user_id' in ('bbbbbbbb-1200-4000-8000-000000000010', 'bbbbbbbb-1200-4000-8000-000000000012',
                                               'bbbbbbbb-1200-4000-8000-000000000016')),
  'a recent pass, a member the viewer blocked and an existing match never show');
select ok(exists (select 1 from public.discover_candidates('bbbbbbbb-1200-4000-8000-000000000000',
                    p_min_age => public.age_in_years(date '1990-01-01' + 23 * 30),
                    p_max_age => public.age_in_years(date '1990-01-01' + 23 * 30), p_limit => 20)
                  where card ->> 'user_id' = 'bbbbbbbb-1200-4000-8000-000000000023')
          and not exists (select 1 from public.discover_candidates('bbbbbbbb-1200-4000-8000-000000000000',
                    p_min_age => public.age_in_years(date '1990-01-01' + 23 * 30),
                    p_max_age => public.age_in_years(date '1990-01-01' + 23 * 30), p_limit => 20) c
                  join public.profiles p on p.user_id = (c.card ->> 'user_id')::uuid
                  where public.age_in_years(p.date_of_birth) <> public.age_in_years(date '1990-01-01' + 23 * 30)),
  'a pass past the cool-down shows again, and the age filter keeps only that age');

select * from finish();
rollback;
