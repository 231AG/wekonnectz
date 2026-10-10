-- Phase 8: availability (spec §12, §13 exclusions, §17 signals; BR-15, BR-17, BR-18, BR-19, BR-20; OD-8).
begin;
create extension if not exists pgtap with schema extensions;
select plan(70);

-- Fixtures (fictional): Musu (Casual, will hold a pass), Hawa (Casual, no pass), Kemah (Relationship only),
-- Siah (Casual, not verified).
insert into auth.users (id, phone, email, aud, role) values
  ('cccccccc-8000-0000-0000-000000000001', '231770008001', null, 'authenticated', 'authenticated'),
  ('cccccccc-8000-0000-0000-000000000002', '231770008002', null, 'authenticated', 'authenticated'),
  ('cccccccc-8000-0000-0000-000000000003', '231770008003', null, 'authenticated', 'authenticated'),
  ('cccccccc-8000-0000-0000-000000000004', '231770008004', null, 'authenticated', 'authenticated');
insert into public.profiles (user_id, date_of_birth, display_name, gender, seeking_genders, intent_relationship,
                             intent_casual, is_profile_complete)
select u.id, '1996-01-01', u.name, 'WOMAN', array['MAN']::public.gender[], not u.casual, u.casual, true
from (values ('cccccccc-8000-0000-0000-000000000001'::uuid, 'Musu', true),
             ('cccccccc-8000-0000-0000-000000000002'::uuid, 'Hawa', true),
             ('cccccccc-8000-0000-0000-000000000003'::uuid, 'Kemah', false),
             ('cccccccc-8000-0000-0000-000000000004'::uuid, 'Siah', true)) as u(id, name, casual);
insert into public.profile_photos (user_id, status, storage_path, sort_order, is_primary, reviewed_as_primary, submitted_at)
select u, 'APPROVED', gen_random_uuid() || '.webp', n, n = 0, n = 0, now()
from unnest(array['cccccccc-8000-0000-0000-000000000001', 'cccccccc-8000-0000-0000-000000000002',
                  'cccccccc-8000-0000-0000-000000000003', 'cccccccc-8000-0000-0000-000000000004']::uuid[]) as u,
     generate_series(0, 2) as n;
insert into public.verifications (user_id, pose_prompt, status, selfie_storage_path, submitted_at, reviewed_at)
select u, 'Touch your ear', 'VERIFIED', gen_random_uuid() || '.webp', now(), now()
from unnest(array['cccccccc-8000-0000-0000-000000000001', 'cccccccc-8000-0000-0000-000000000002',
                  'cccccccc-8000-0000-0000-000000000003']::uuid[]) as u;
update public.users set status = 'ACTIVE' where id::text like 'cccccccc-8000-%';

-- A pass, inserted the way approve_payment_claim() does.
create function pg_temp.give_pass(p_user uuid, p_hours integer) returns void language plpgsql as $$
declare v_pay uuid;
begin
  insert into public.payments (user_id, plan_id, source, provider, provider_transaction_id, transaction_key, amount, currency, status, paid_at)
  values (p_user, (select id from public.subscription_plans where code = 'MM_DAY'), 'MOBILE_MONEY', 'ORANGE_MONEY',
          'OM8' || substr(md5(p_user::text || clock_timestamp()::text), 1, 8), 'OM8' || substr(md5(p_user::text || clock_timestamp()::text), 1, 8),
          1.00, 'USD', 'SUCCEEDED', now())
  returning id into v_pay;
  perform set_config('wk.claim_approval', 'on', true);
  insert into public.subscriptions (user_id, plan_id, source, status, starts_at, expires_at, source_payment_id)
  values (p_user, (select id from public.subscription_plans where code = 'MM_DAY'), 'MOBILE_MONEY', 'ACTIVE', now(),
          now() + make_interval(hours => p_hours), v_pay);
  perform set_config('wk.claim_approval', 'off', true);
end $$;
select pg_temp.give_pass('cccccccc-8000-0000-0000-000000000001', 6);
select pg_temp.give_pass('cccccccc-8000-0000-0000-000000000003', 6);
select pg_temp.give_pass('cccccccc-8000-0000-0000-000000000004', 6);

-- ---------------------------------------------------------------------------
-- BR-19: no client reads availability; BR-20: no location stored
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-8000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select * from public.availability $$, '42501', null, 'BR-19: members cannot read availability directly');
select throws_ok($$ select public.set_availability('cccccccc-8000-0000-0000-000000000001', null, now() + interval '2 hours') $$,
  '42501', null, 'members cannot call set_availability directly (the server passes the session user)');
select throws_ok($$ select public.is_in_pool('cccccccc-8000-0000-0000-000000000001') $$, '42501', null,
  'BR-19: pool membership of others is not queryable by members');
reset role;
select set_config('request.jwt.claims', '', true);
set local role service_role;
select throws_ok($$ select * from public.availability $$, '42501', null, 'BR-19: not even the server key reads the table');
reset role;
select is_empty($$ select table_name || '.' || column_name from information_schema.columns
  where table_schema = 'public' and (column_name ~* '(^|_)(lat|lng|lon|latitude|longitude|location|geo_point|coords?)($|_)')
    -- geo_checks stores the country of the sign-up IP only (OD-12), never a position.
    and table_name not in ('geo_checks') $$,
  'BR-20: no exact-location column anywhere in the schema');

-- ---------------------------------------------------------------------------
-- Eligibility (§12; BR-15)
-- ---------------------------------------------------------------------------
set local role service_role;
select is(public.member_availability('cccccccc-8000-0000-0000-000000000001') -> 'reasons', '[]'::jsonb, 'a verified Casual pass-holder with 3 photos is eligible');
select ok((public.member_availability('cccccccc-8000-0000-0000-000000000002') -> 'reasons') ? 'NO_PASS', 'a pass is required');
select ok((public.member_availability('cccccccc-8000-0000-0000-000000000003') -> 'reasons') ? 'NO_CASUAL_INTENT', 'intent must include Casual');
select ok((public.member_availability('cccccccc-8000-0000-0000-000000000004') -> 'reasons') ? 'NOT_VERIFIED', 'BR-15: unverified members can''t be available');
select throws_ok($$ select public.set_availability('cccccccc-8000-0000-0000-000000000002', null, now() + interval '2 hours') $$,
  '22023', 'NOT_ELIGIBLE:NO_PASS', 'BR-17: no pass, no window');
select throws_ok($$ select public.set_availability('cccccccc-8000-0000-0000-000000000004', null, now() + interval '2 hours') $$,
  '22023', 'NOT_ELIGIBLE:NOT_VERIFIED', 'BR-15: no window without verification');

-- ---------------------------------------------------------------------------
-- Windows and caps (OD-8: DEV-ONLY 12 hours / 7 days)
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.set_availability('cccccccc-8000-0000-0000-000000000001', null, now() + interval '13 hours') $$,
  '22023', 'WINDOW_TOO_LONG', 'OD-8: a window longer than the cap is rejected');
select throws_ok($$ select public.set_availability('cccccccc-8000-0000-0000-000000000001', now() + interval '8 days', now() + interval '8 days 2 hours') $$,
  '22023', 'TOO_FAR_AHEAD', 'OD-8: a window too far ahead is rejected');
select throws_ok($$ select public.set_availability('cccccccc-8000-0000-0000-000000000001', now() + interval '2 hours', now() + interval '1 hour') $$,
  '22023', 'END_BEFORE_START', 'the end must come after the start');
select throws_ok($$ select public.set_availability('cccccccc-8000-0000-0000-000000000001', now() - interval '1 hour', now() + interval '1 hour') $$,
  '22023', 'START_IN_PAST', 'a window can''t start in the past');
reset role;
update public.app_settings set value = null where key = 'availability.max_window_hours';
set local role service_role;
select throws_ok($$ select public.set_availability('cccccccc-8000-0000-0000-000000000001', null, now() + interval '2 hours') $$,
  'P0001', null, 'OD-8 unset: no window until the owner sets the limit');
select is(public.member_availability('cccccccc-8000-0000-0000-000000000001') -> 'max_window_hours', 'null'::jsonb,
  'the screen still loads and shows the limit as not set');
reset role;
update public.app_settings set value = '12'::jsonb where key = 'availability.max_window_hours';
set local role service_role;

select lives_ok($$ select public.set_availability('cccccccc-8000-0000-0000-000000000001', null, now() + interval '4 hours') $$,
  'Available now: a window from now');
select ok(public.member_availability('cccccccc-8000-0000-0000-000000000001') ->> 'in_pool' = 'true', 'BR-17: in the pool');
reset role;
select ok(public.is_in_pool('cccccccc-8000-0000-0000-000000000001', now() + interval '3 hours 59 minutes'), 'still in the pool just before the window ends');
select ok(not public.is_in_pool('cccccccc-8000-0000-0000-000000000001', now() + interval '4 hours'), 'BR-18: the window ends by itself');
select ok(not public.is_in_pool('cccccccc-8000-0000-0000-000000000001', now() + interval '6 hours'), 'out after the window');
set local role service_role;
select lives_ok($$ select public.set_availability('cccccccc-8000-0000-0000-000000000001', null, now() + interval '10 hours') $$,
  'changing the end of the live window');
reset role;
select is((select count(*)::int from public.availability where user_id = 'cccccccc-8000-0000-0000-000000000001'), 1, 'one row per member');
select ok(public.is_in_pool('cccccccc-8000-0000-0000-000000000001', now() + interval '5 hours 59 minutes'), 'in the pool while the pass lasts');
select ok(not public.is_in_pool('cccccccc-8000-0000-0000-000000000001', now() + interval '6 hours 1 minute'),
  'BR-17: the pass ending mid-window removes the member at once (window runs to 10 hours)');
select is((select count(*)::int from public.availability_windows where user_id = 'cccccccc-8000-0000-0000-000000000001'), 1,
  'changing a live window keeps one window in the history (no false short windows)');

-- Scheduled window
set local role service_role;
select throws_ok($$ select public.set_availability('cccccccc-8000-0000-0000-000000000003', now() + interval '1 hour', now() + interval '3 hours') $$,
  '22023', 'NOT_ELIGIBLE:NO_CASUAL_INTENT', 'Relationship-only members can''t be available');
reset role;

-- ---------------------------------------------------------------------------
-- Pause, resume, leave (BR-18)
-- ---------------------------------------------------------------------------
set local role service_role;
select lives_ok($$ select public.pause_availability('cccccccc-8000-0000-0000-000000000001', true) $$, 'pause');
select is(public.member_availability('cccccccc-8000-0000-0000-000000000001') ->> 'status', 'PAUSED', 'PAUSED keeps the window');
select ok(public.member_availability('cccccccc-8000-0000-0000-000000000001') ->> 'in_pool' = 'false', 'paused: hidden from the pool');
select lives_ok($$ select public.pause_availability('cccccccc-8000-0000-0000-000000000001', false) $$, 'resume');
select ok(public.member_availability('cccccccc-8000-0000-0000-000000000001') ->> 'in_pool' = 'true', 'resumed: back in the pool');

-- §13: members who accept requests from Nobody are hidden from the pool.
select lives_ok($$ select public.set_casual_message_permission('cccccccc-8000-0000-0000-000000000001', 'NOBODY') $$, 'choose Nobody');
select ok(public.member_availability('cccccccc-8000-0000-0000-000000000001') ->> 'in_pool' = 'false', '§13: Nobody → hidden from the pool');
select lives_ok($$ select public.set_casual_message_permission('cccccccc-8000-0000-0000-000000000001', 'ANYONE') $$, 'back to Anyone');
reset role;

-- Leaving the pool on photos, suspension and an under-18 report, immediately.
update public.profile_photos set status = 'HIDDEN' where user_id = 'cccccccc-8000-0000-0000-000000000001' and sort_order = 2;
select ok(not public.is_in_pool('cccccccc-8000-0000-0000-000000000001'), '§11: fewer than 3 approved photos leaves the pool at once');
update public.profile_photos set status = 'APPROVED' where user_id = 'cccccccc-8000-0000-0000-000000000001' and sort_order = 2;
select ok(public.is_in_pool('cccccccc-8000-0000-0000-000000000001'), 'back with 3 photos');
update public.users set hidden_reason = 'UNDER_18_REPORT', hidden_at = now() where id = 'cccccccc-8000-0000-0000-000000000001';
select ok(not public.is_in_pool('cccccccc-8000-0000-0000-000000000001'), '§17: an under-18 report removes the member from availability at once');
select ok((public.member_availability('cccccccc-8000-0000-0000-000000000001') -> 'reasons') ? 'ACCOUNT',
  'the member is told only that the account can''t be available (no mention of reports)');
update public.users set hidden_reason = null, hidden_at = null where id = 'cccccccc-8000-0000-0000-000000000001';
update public.users set suspended_until = now() + interval '1 day' where id = 'cccccccc-8000-0000-0000-000000000001';
select ok(not public.is_in_pool('cccccccc-8000-0000-0000-000000000001'), 'BR-5: a suspended member leaves the pool at once');
update public.users set suspended_until = null where id = 'cccccccc-8000-0000-0000-000000000001';

set local role service_role;
select lives_ok($$ select public.leave_pool('cccccccc-8000-0000-0000-000000000001') $$, 'BR-18: leave the pool at any time');
select is(public.member_availability('cccccccc-8000-0000-0000-000000000001') ->> 'status', 'UNAVAILABLE', 'UNAVAILABLE after leaving');
select throws_ok($$ select public.pause_availability('cccccccc-8000-0000-0000-000000000001', true) $$, '22023', 'NO_WINDOW',
  'nothing to pause without a window');

-- ---------------------------------------------------------------------------
-- §17 signal: frequent short windows (T-19, DEV-ONLY 30 minutes / 5 a day)
-- ---------------------------------------------------------------------------
reset role;
-- Earlier windows today (inserted as history): three that ran 10 minutes, one declared 3 hours but left
-- after 2 minutes, one schedule changed before it started.
insert into public.availability_windows (user_id, start_at, end_at, ended_at, created_at)
select 'cccccccc-8000-0000-0000-000000000001', now() - make_interval(hours => n), now() - make_interval(hours => n) + interval '10 minutes',
       null, now() - make_interval(hours => n)
from generate_series(2, 4) n;
insert into public.availability_windows (user_id, start_at, end_at, ended_at, created_at) values
  ('cccccccc-8000-0000-0000-000000000001', now() - interval '6 hours', now() - interval '3 hours', now() - interval '5 hours 58 minutes', now() - interval '6 hours'),
  ('cccccccc-8000-0000-0000-000000000001', now() + interval '5 hours', now() + interval '6 hours', now() - interval '7 hours', now() - interval '8 hours');
set local role service_role;
select lives_ok($$ select public.leave_pool('cccccccc-8000-0000-0000-000000000001') $$, 'checking after leaving');
reset role;
select is((select count(*)::int from public.moderation_flags where entity_id = 'cccccccc-8000-0000-0000-000000000001' and reason = 'SHORT_WINDOWS'), 0,
  'four short windows: not flagged below the threshold (a schedule changed before it began doesn''t count)');
set local role service_role;
select lives_ok($$ select public.set_availability('cccccccc-8000-0000-0000-000000000001', null, now() + interval '10 minutes') $$, 'a fifth');
reset role;
select is((select count(*)::int from public.moderation_flags where entity_id = 'cccccccc-8000-0000-0000-000000000001'
           and reason = 'SHORT_WINDOWS' and status = 'OPEN'), 1,
  '§17: frequent short windows flag the member for review (leaving early counts, whatever length was declared)');

-- Self-audit round 1
select pg_temp.give_pass('cccccccc-8000-0000-0000-000000000002', 6);
set local role service_role;
select throws_ok($$ select public.set_availability('cccccccc-8000-0000-0000-000000000002', now() + interval '1 day', now() + interval '1 day 2 hours') $$,
  '22023', 'PASS_ENDS_FIRST', 'BR-17: a window that would start after the pass ends is refused, not "saved"');
reset role;
update public.app_settings set value = '2'::jsonb where key = 'availability.max_changes_per_hour';
set local role service_role;
select throws_ok($$ select public.set_availability('cccccccc-8000-0000-0000-000000000001', now() + interval '1 hour', now() + interval '2 hours') $$,
  '22023', 'TOO_MANY_CHANGES', 'window changes are rate-limited (T-19 setting)');
reset role;
update public.app_settings set value = '30'::jsonb where key = 'availability.max_changes_per_hour';
insert into public.verifications (user_id, pose_prompt, status, rejection_reason, selfie_storage_path, submitted_at, reviewed_at)
values ('cccccccc-8000-0000-0000-000000000004', 'Touch your ear', 'REJECTED', 'POSE_NOT_MATCHING', gen_random_uuid() || '.webp', now(), now());
set local role service_role;
select ok((public.member_availability('cccccccc-8000-0000-0000-000000000004') -> 'reasons') ? 'NOT_VERIFIED',
  'BR-15: a REJECTED verification prevents availability');
reset role;
update public.users set hidden_reason = 'REPORT_THRESHOLD', hidden_at = now() where id = 'cccccccc-8000-0000-0000-000000000001';
select ok(not public.is_in_pool('cccccccc-8000-0000-0000-000000000001'), '§17: an auto-hide after reports removes the member from the pool');
update public.users set hidden_reason = null, hidden_at = null where id = 'cccccccc-8000-0000-0000-000000000001';

-- Round 2: changing the end of a paused live window keeps it paused (no silent return to the pool).
set local role service_role;
select lives_ok($$ select public.set_availability('cccccccc-8000-0000-0000-000000000001', null, now() + interval '2 hours') $$, 'a live window');
select lives_ok($$ select public.pause_availability('cccccccc-8000-0000-0000-000000000001', true) $$, 'paused');
select lives_ok($$ select public.set_availability('cccccccc-8000-0000-0000-000000000001', null, now() + interval '3 hours') $$, 'end changed while paused');
select is(public.member_availability('cccccccc-8000-0000-0000-000000000001') ->> 'status', 'PAUSED', 'still paused, hidden from the pool');
reset role;

-- Round 3: going available, then switching to a schedule after a few minutes, counts as a short stint.
reset role;
delete from public.moderation_flags where entity_id = 'cccccccc-8000-0000-0000-000000000001' and reason = 'SHORT_WINDOWS';
update public.availability_windows set start_at = start_at - interval '1 minute'
where user_id = 'cccccccc-8000-0000-0000-000000000001' and ended_at is null;
set local role service_role;
select lives_ok($$ select public.set_availability('cccccccc-8000-0000-0000-000000000001', now() + interval '1 hour', now() + interval '2 hours') $$,
  'live window replaced by a schedule');
reset role;
select is((select count(*)::int from public.moderation_flags where entity_id = 'cccccccc-8000-0000-0000-000000000001'
           and reason = 'SHORT_WINDOWS' and status = 'OPEN'), 1, '§17: a started window replaced early still counts as short');

-- Tidy job records what the query already enforces.
select pg_temp.give_pass('cccccccc-8000-0000-0000-000000000002', 6);
set local role service_role;
select lives_ok($$ select public.set_availability('cccccccc-8000-0000-0000-000000000002', now() + interval '1 hour', now() + interval '3 hours') $$,
  'Schedule: a future window');
select is(public.member_availability('cccccccc-8000-0000-0000-000000000002') ->> 'in_pool', 'false', 'a scheduled window isn''t in the pool before it starts');
reset role;
select ok(public.is_in_pool('cccccccc-8000-0000-0000-000000000002', now() + interval '2 hours'), 'and is when it starts');
update public.availability set start_at = now() - interval '2 hours', end_at = now() - interval '1 hour'
where user_id = 'cccccccc-8000-0000-0000-000000000002';
set local role service_role;
select ok(public.tidy_availability() >= 1, 'the tidy job runs');
reset role;
select is((select status::text from public.availability where user_id = 'cccccccc-8000-0000-0000-000000000002'), 'UNAVAILABLE',
  'an ended window is tidied to UNAVAILABLE');
-- A briefly ineligible member keeps a scheduled window (e.g. a short suspension, or a pass to be renewed).
set local role service_role;
select lives_ok($$ select public.set_availability('cccccccc-8000-0000-0000-000000000002', now() + interval '1 hour', now() + interval '3 hours') $$,
  'a scheduled window');
select lives_ok($$ select public.pause_availability('cccccccc-8000-0000-0000-000000000002', true) $$, 'paused');
reset role;
update public.users set suspended_until = now() + interval '1 hour' where id = 'cccccccc-8000-0000-0000-000000000002';
set local role service_role;
select lives_ok($$ select public.tidy_availability() $$, 'tidy during a short suspension');
reset role;
select is((select status::text from public.availability where user_id = 'cccccccc-8000-0000-0000-000000000002'), 'PAUSED',
  'the tidy job keeps the window of a member who is only briefly ineligible');
update public.availability set start_at = now() - interval '3 hours', end_at = now() - interval '1 hour'
where user_id = 'cccccccc-8000-0000-0000-000000000002';
set local role service_role;
select is(public.member_availability('cccccccc-8000-0000-0000-000000000002') ->> 'end_at', null, 'BR-18: a paused window that has ended reads as over');
select lives_ok($$ select public.tidy_availability() $$, 'tidy');
reset role;
select is((select status::text from public.availability where user_id = 'cccccccc-8000-0000-0000-000000000002'), 'UNAVAILABLE',
  'BR-18: an ended paused window is tidied too');

select * from finish();
rollback;
