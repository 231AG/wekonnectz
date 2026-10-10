-- Phase 9: Casual discovery, message requests, saved profiles, read-only Casual conversations
-- (spec §13, §14, §17; BR-16, 17, 19, 21, 22, 24, 25, 31; OD-9, OD-24).
begin;
create extension if not exists pgtap with schema extensions;
select plan(78);

-- Fixtures (fictional). Women seeking men: Musu, Fatu (no pass). Men seeking women: Joseph, Prince,
-- Kemah, Emmanuel. Varney: a man seeking men.
create function pg_temp.member(p_id uuid, p_name text, p_gender text, p_seeking text, p_dob date) returns void language plpgsql as $$
begin
  insert into auth.users (id, phone, aud, role) values (p_id, '23177009' || substr(replace(p_id::text, '-', ''), 29, 4), 'authenticated', 'authenticated');
  insert into public.profiles (user_id, date_of_birth, display_name, gender, seeking_genders, area_id, intent_relationship, intent_casual, is_profile_complete)
  values (p_id, p_dob, p_name, p_gender::public.gender, array[p_seeking]::public.gender[], (select id from public.areas where name = 'Sinkor'), false, true, true);
  insert into public.profile_photos (user_id, status, storage_path, sort_order, is_primary, reviewed_as_primary, submitted_at)
  select p_id, 'APPROVED', gen_random_uuid() || '.webp', n, n = 0, n = 0, now() from generate_series(0, 2) n;
  insert into public.verifications (user_id, pose_prompt, status, selfie_storage_path, submitted_at, reviewed_at)
  values (p_id, 'Touch your ear', 'VERIFIED', gen_random_uuid() || '.webp', now(), now());
  update public.users set status = 'ACTIVE' where id = p_id;
end $$;
create function pg_temp.give_pass(p_user uuid, p_hours integer) returns void language plpgsql as $$
declare v_pay uuid; v_key text := 'OM9' || substr(md5(p_user::text || clock_timestamp()::text), 1, 10);
begin
  insert into public.payments (user_id, plan_id, source, provider, provider_transaction_id, transaction_key, amount, currency, status, paid_at)
  values (p_user, (select id from public.subscription_plans where code = 'MM_DAY'), 'MOBILE_MONEY', 'ORANGE_MONEY', v_key, v_key, 1.00, 'USD', 'SUCCEEDED', now())
  returning id into v_pay;
  perform set_config('wk.claim_approval', 'on', true);
  insert into public.subscriptions (user_id, plan_id, source, status, starts_at, expires_at, source_payment_id)
  values (p_user, (select id from public.subscription_plans where code = 'MM_DAY'), 'MOBILE_MONEY', 'ACTIVE', now(), now() + make_interval(hours => p_hours), v_pay);
  perform set_config('wk.claim_approval', 'off', true);
end $$;

select pg_temp.member('dddddddd-9000-0000-0000-000000000001', 'Musu', 'WOMAN', 'MAN', '1997-01-01');
select pg_temp.member('dddddddd-9000-0000-0000-000000000002', 'Fatu', 'WOMAN', 'MAN', '1996-01-01');
select pg_temp.member('dddddddd-9000-0000-0000-000000000003', 'Joseph', 'MAN', 'WOMAN', '1995-01-01');
select pg_temp.member('dddddddd-9000-0000-0000-000000000004', 'Prince', 'MAN', 'WOMAN', '1999-01-01');
select pg_temp.member('dddddddd-9000-0000-0000-000000000005', 'Kemah', 'MAN', 'WOMAN', '1994-01-01');
select pg_temp.member('dddddddd-9000-0000-0000-000000000006', 'Emmanuel', 'MAN', 'WOMAN', '1998-01-01');
select pg_temp.member('dddddddd-9000-0000-0000-000000000007', 'Varney', 'MAN', 'MAN', '1993-01-01');
select pg_temp.give_pass(u, 24) from unnest(array[
  'dddddddd-9000-0000-0000-000000000001', 'dddddddd-9000-0000-0000-000000000003', 'dddddddd-9000-0000-0000-000000000004',
  'dddddddd-9000-0000-0000-000000000005', 'dddddddd-9000-0000-0000-000000000006', 'dddddddd-9000-0000-0000-000000000007']::uuid[]) u;

set local role service_role;
select public.set_availability(u, null, now() + interval '4 hours') from unnest(array[
  'dddddddd-9000-0000-0000-000000000003', 'dddddddd-9000-0000-0000-000000000004', 'dddddddd-9000-0000-0000-000000000005',
  'dddddddd-9000-0000-0000-000000000007']::uuid[]) u;
select public.set_casual_message_permission('dddddddd-9000-0000-0000-000000000004', 'NOBODY');
select public.block_user('dddddddd-9000-0000-0000-000000000001', 'dddddddd-9000-0000-0000-000000000005');
reset role;

create temp table r (n text primary key, id uuid);
grant all on r to service_role;
-- Test-only, rolled back with the transaction: lets assertions run as service_role read the rows.
grant select on public.message_requests, public.availability, public.conversations, public.messages to service_role;

-- ---------------------------------------------------------------------------
-- Clients: no direct access
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-9000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select * from public.message_requests $$, '42501', null, 'members cannot read requests directly');
select throws_ok($$ select public.pool_candidates('dddddddd-9000-0000-0000-000000000001') $$, '42501', null,
  'members cannot call the pool directly (the server passes the session user)');
select throws_ok($$ select public.send_message_request('dddddddd-9000-0000-0000-000000000001', 'dddddddd-9000-0000-0000-000000000003', 'hi') $$,
  '42501', null, 'members cannot send requests directly');
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- The pool (§13; BR-16, BR-17, BR-19, BR-24)
-- ---------------------------------------------------------------------------
set local role service_role;
select throws_ok($$ select * from public.pool_candidates('dddddddd-9000-0000-0000-000000000002') $$, '42501', 'NOT_ELIGIBLE',
  'BR-16: no pass → no pool data at all');
select is((select count(*)::int from public.pool_candidates('dddddddd-9000-0000-0000-000000000001')), 1,
  'the pool shows only who may be seen');
select is((select card ->> 'display_name' from public.pool_candidates('dddddddd-9000-0000-0000-000000000001')), 'Joseph',
  'Joseph: available, pass, compatible');
select ok(not exists (select 1 from public.pool_candidates('dddddddd-9000-0000-0000-000000000001') where card ->> 'display_name' = 'Prince'),
  '§13: members accepting requests from Nobody are hidden');
select ok(not exists (select 1 from public.pool_candidates('dddddddd-9000-0000-0000-000000000001') where card ->> 'display_name' = 'Kemah'),
  'BR-24: blocked pairs never see each other');
select ok(not exists (select 1 from public.pool_candidates('dddddddd-9000-0000-0000-000000000001') where card ->> 'display_name' = 'Varney'),
  '§13: "interested in" must match both ways');
select ok(not exists (select 1 from public.pool_candidates('dddddddd-9000-0000-0000-000000000001') where card ->> 'display_name' = 'Emmanuel'),
  'BR-17: not AVAILABLE → not in the pool');
select ok((select available_until from public.pool_candidates('dddddddd-9000-0000-0000-000000000001')) is not null,
  'BR-19: availability is shown inside the pool');
select is((select count(*)::int from public.pool_candidates('dddddddd-9000-0000-0000-000000000003')), 0,
  'Joseph sees no one: Musu isn''t available and the men aren''t what he is looking for');
reset role;

-- Filters and pagination
set local role service_role;
select public.set_casual_message_permission('dddddddd-9000-0000-0000-000000000004', 'ANYONE');
select is((select count(*)::int from public.pool_candidates('dddddddd-9000-0000-0000-000000000001')), 2, 'Prince back with Anyone');
select is((select count(*)::int from public.pool_candidates('dddddddd-9000-0000-0000-000000000001', null, 28, 35)), 1, 'age filter');
select is((select count(*)::int from public.pool_candidates('dddddddd-9000-0000-0000-000000000001', p_until => now() + interval '5 hours')), 0,
  'window filter: available until at least the chosen time');
select is((select count(*)::int from public.pool_candidates('dddddddd-9000-0000-0000-000000000001', p_limit => 1)), 1, 'page size');
select is((select count(*)::int from public.pool_candidates('dddddddd-9000-0000-0000-000000000001',
            p_after_bucket => (select bucket from public.pool_candidates('dddddddd-9000-0000-0000-000000000001', p_limit => 1)),
            p_after_hash => (select sort_hash from public.pool_candidates('dddddddd-9000-0000-0000-000000000001', p_limit => 1)))), 1,
  'cursor pagination: the next page continues after the last card');
select is((select count(distinct card ->> 'user_id')::int from (
            select card from public.pool_candidates('dddddddd-9000-0000-0000-000000000001', p_limit => 1)
            union all
            select card from public.pool_candidates('dddddddd-9000-0000-0000-000000000001',
              p_after_bucket => (select bucket from public.pool_candidates('dddddddd-9000-0000-0000-000000000001', p_limit => 1)),
              p_after_hash => (select sort_hash from public.pool_candidates('dddddddd-9000-0000-0000-000000000001', p_limit => 1)))) x), 2,
  'no member repeats across pages');
reset role;

set local role service_role;
select ok(public.casual_profile('dddddddd-9000-0000-0000-000000000001', 'dddddddd-9000-0000-0000-000000000003') is not null,
  'Casual profile of a pool member');
select is(public.casual_profile('dddddddd-9000-0000-0000-000000000001', 'dddddddd-9000-0000-0000-000000000006'), null,
  'BR-19: no Casual profile for someone not in the pool');
select is(public.casual_profile('dddddddd-9000-0000-0000-000000000002', 'dddddddd-9000-0000-0000-000000000003'), null,
  'BR-16: no Casual profile without a pass');
select is(public.casual_profile('dddddddd-9000-0000-0000-000000000001', 'dddddddd-9000-0000-0000-000000000005'), null,
  'BR-24: no profile across a block');

-- ---------------------------------------------------------------------------
-- Requests (BR-21, BR-22, OD-9, OD-24)
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.send_message_request('dddddddd-9000-0000-0000-000000000002', 'dddddddd-9000-0000-0000-000000000003', 'Hi Joseph') $$,
  '42501', 'NOT_ELIGIBLE', 'BR-21: only pass-holders send requests');
select throws_ok($$ select public.send_message_request('dddddddd-9000-0000-0000-000000000001', 'dddddddd-9000-0000-0000-000000000006', 'Hi') $$,
  'P0002', 'MEMBER_NOT_AVAILABLE', 'BR-21: only to members AVAILABLE now');
select throws_ok($$ select public.send_message_request('dddddddd-9000-0000-0000-000000000001', 'dddddddd-9000-0000-0000-000000000005', 'Hi') $$,
  'P0002', 'MEMBER_NOT_AVAILABLE', 'BR-24: not across a block');
select throws_ok($$ select public.send_message_request('dddddddd-9000-0000-0000-000000000001', 'dddddddd-9000-0000-0000-000000000003', repeat('a', 301)) $$,
  '22023', 'INVALID_REQUEST', 'requests are 1–300 characters');
insert into r select 'j', public.send_message_request('dddddddd-9000-0000-0000-000000000001', 'dddddddd-9000-0000-0000-000000000003', '  Hey Joseph, fancy a chat?  ');
select is((select body from public.message_requests where id = (select id from r where n = 'j')), 'Hey Joseph, fancy a chat?', 'request stored, trimmed');
select is((select expires_at from public.message_requests where id = (select id from r where n = 'j')),
  (select end_at from public.availability where user_id = 'dddddddd-9000-0000-0000-000000000003'),
  'OD-24: a request expires when the recipient''s window ends');
select throws_ok($$ select public.send_message_request('dddddddd-9000-0000-0000-000000000001', 'dddddddd-9000-0000-0000-000000000003', 'again') $$,
  '22023', 'REQUEST_PENDING', '§14: one pending request per sender → recipient');
select throws_ok($$ select public.send_message_request('dddddddd-9000-0000-0000-000000000003', 'dddddddd-9000-0000-0000-000000000001', 'hi') $$,
  'P0002', 'MEMBER_NOT_AVAILABLE', 'Joseph can''t request Musu: she is not available');
select is((select count(*)::int from public.requests_received('dddddddd-9000-0000-0000-000000000003')), 1, 'Joseph sees the request');
select ok(public.casual_profile('dddddddd-9000-0000-0000-000000000003', 'dddddddd-9000-0000-0000-000000000001') ->> 'request_received' is not null,
  'the recipient may open the sender''s profile while the request is open');
select is((public.casual_profile('dddddddd-9000-0000-0000-000000000001', 'dddddddd-9000-0000-0000-000000000003') ->> 'request_sent')::boolean, true,
  'the sender sees "request sent"');
select throws_ok($$ select public.respond_to_request('dddddddd-9000-0000-0000-000000000004', (select id from r where n = 'j'), 'ACCEPT') $$,
  '22023', 'REQUEST_NOT_OPEN', 'only the recipient may answer');

-- Accept → CASUAL conversation starting with the request text
insert into r select 'cj', public.respond_to_request('dddddddd-9000-0000-0000-000000000003', (select id from r where n = 'j'), 'ACCEPT');
select is((select type::text from public.conversations where id = (select id from r where n = 'cj')), 'CASUAL', 'BR-22: accept opens a CASUAL conversation');
select is((select body from public.messages where conversation_id = (select id from r where n = 'cj')), 'Hey Joseph, fancy a chat?',
  'the conversation starts with the request');
select is((select status::text from public.message_requests where id = (select id from r where n = 'j')), 'ACCEPTED', 'request ACCEPTED');
reset role;
select ok(public.can_send_in('dddddddd-9000-0000-0000-000000000001', (select id from r where n = 'cj')), 'Musu can reply');
set local role service_role;
select throws_ok($$ select public.send_message_request('dddddddd-9000-0000-0000-000000000001', 'dddddddd-9000-0000-0000-000000000003', 'hi') $$,
  '22023', 'ALREADY_CONNECTED', 'no request once a conversation is open');
reset role;

-- BR-25: read-only without a pass, history kept
select ok(public.can_send_in('dddddddd-9000-0000-0000-000000000001', (select id from r where n = 'cj')), 'with a pass Musu can send');
select set_config('wk.subscription_admin', 'on', true);
update public.subscriptions set expires_at = now() - interval '1 second', starts_at = now() - interval '2 days'
where user_id = 'dddddddd-9000-0000-0000-000000000001';
select set_config('wk.subscription_admin', 'off', true);
select ok(not public.can_send_in('dddddddd-9000-0000-0000-000000000001', (select id from r where n = 'cj')),
  'BR-25: without an active pass the CASUAL conversation is read-only');
set local role service_role;
select is(jsonb_array_length(public.conversation_view('dddddddd-9000-0000-0000-000000000001', (select id from r where n = 'cj')) -> 'messages'), 1,
  'BR-25: history is kept and readable');
select throws_ok($$ select public.send_message('dddddddd-9000-0000-0000-000000000001', (select id from r where n = 'cj'), 'hello?') $$,
  '42501', 'CANNOT_SEND', 'BR-25: sending is refused on the server');
reset role;
select pg_temp.give_pass('dddddddd-9000-0000-0000-000000000001', 24);

-- Decline is private: the member just leaves the sender's pool for the cool-down
set local role service_role;
insert into r select 'p', public.send_message_request('dddddddd-9000-0000-0000-000000000001', 'dddddddd-9000-0000-0000-000000000004', 'Hi Prince');
select is(public.respond_to_request('dddddddd-9000-0000-0000-000000000004', (select id from r where n = 'p'), 'DECLINE'), null, 'BR-22: decline');
select ok(not exists (select 1 from public.pool_candidates('dddddddd-9000-0000-0000-000000000001') where card ->> 'display_name' = 'Prince'),
  'OD-9: after a decline the member is out of the sender''s pool for the cool-down (the decline is never shown)');
select throws_ok($$ select public.send_message_request('dddddddd-9000-0000-0000-000000000001', 'dddddddd-9000-0000-0000-000000000004', 'please') $$,
  'P0002', 'MEMBER_NOT_AVAILABLE', 'OD-9: no new request during the cool-down');
reset role;
update public.message_requests set responded_at = now() - interval '8 days' where id = (select id from r where n = 'p');
set local role service_role;
select ok(exists (select 1 from public.pool_candidates('dddddddd-9000-0000-0000-000000000001') where card ->> 'display_name' = 'Prince'),
  'OD-9: back after the cool-down (DEV-ONLY 7 days)');

-- Block from a request
reset role;
select pg_temp.member('dddddddd-9000-0000-0000-000000000008', 'Hawa', 'WOMAN', 'MAN', '1995-06-01');
select pg_temp.give_pass('dddddddd-9000-0000-0000-000000000008', 24);
set local role service_role;
insert into r select 'h', public.send_message_request('dddddddd-9000-0000-0000-000000000008', 'dddddddd-9000-0000-0000-000000000004', 'Hello Prince');
select lives_ok($$ select public.respond_to_request('dddddddd-9000-0000-0000-000000000004', (select id from r where n = 'h'), 'BLOCK') $$, 'BR-22: block from a request');
reset role;
select ok(public.is_blocked_pair('dddddddd-9000-0000-0000-000000000004', 'dddddddd-9000-0000-0000-000000000008'), 'BR-24: the pair is blocked');
select is((select status::text from public.message_requests where id = (select id from r where n = 'h')), 'BLOCKED', 'request BLOCKED');

-- OD-24: leaving the pool expires requests to the member; expired requests can't be answered
set local role service_role;
select public.set_availability('dddddddd-9000-0000-0000-000000000006', null, now() + interval '2 hours');
insert into r select 'em', public.send_message_request('dddddddd-9000-0000-0000-000000000001', 'dddddddd-9000-0000-0000-000000000006', 'Hi Emmanuel');
select lives_ok($$ select public.leave_pool('dddddddd-9000-0000-0000-000000000006') $$, 'the recipient leaves the pool');
select is((select status::text from public.message_requests where id = (select id from r where n = 'em')), 'EXPIRED', 'OD-24: their open requests expire');
select throws_ok($$ select public.respond_to_request('dddddddd-9000-0000-0000-000000000006', (select id from r where n = 'em'), 'ACCEPT') $$,
  '22023', 'REQUEST_NOT_OPEN', 'an expired request can''t be accepted');
reset role;
update public.message_requests set status = 'PENDING', expires_at = now() - interval '1 minute' where id = (select id from r where n = 'em');
set local role service_role;
select is((select count(*)::int from public.requests_received('dddddddd-9000-0000-0000-000000000006')), 0, 'OD-24: expired by time, at query time');
select ok(public.tidy_requests() >= 1, 'the tidy job records expiry');

-- Saved profiles (§13)
select lives_ok($$ select public.save_profile('dddddddd-9000-0000-0000-000000000001', 'dddddddd-9000-0000-0000-000000000004', true) $$, 'save');
select is((select count(*)::int from public.saved_list('dddddddd-9000-0000-0000-000000000001')), 1, 'saved list');
select public.leave_pool('dddddddd-9000-0000-0000-000000000004');
select is((select count(*)::int from public.saved_list('dddddddd-9000-0000-0000-000000000001')), 0,
  '§13: the saved list shows only members still eligible to be seen');
select throws_ok($$ select public.save_profile('dddddddd-9000-0000-0000-000000000001', 'dddddddd-9000-0000-0000-000000000006', true) $$,
  'P0002', 'MEMBER_NOT_AVAILABLE', 'only members in the pool can be saved');

-- OD-9 daily cap and §17 signals
reset role;
update public.app_settings set value = '1'::jsonb where key = 'requests.daily_cap';
set local role service_role;
select throws_ok($$ select public.send_message_request('dddddddd-9000-0000-0000-000000000008', 'dddddddd-9000-0000-0000-000000000003', 'Hi') $$,
  '22023', 'REQUEST_LIMIT', 'OD-9: daily request cap');
reset role;
update public.app_settings set value = null where key = 'requests.daily_cap';
set local role service_role;
select throws_ok($$ select public.send_message_request('dddddddd-9000-0000-0000-000000000008', 'dddddddd-9000-0000-0000-000000000003', 'Hi') $$,
  'P0001', null, 'OD-9 unset: no requests until the owner sets the cap');
reset role;
update public.app_settings set value = '20'::jsonb where key = 'requests.daily_cap';
update public.app_settings set value = '2'::jsonb where key = 'requests.duplicate_text_recipients';
insert into public.message_requests (sender_id, recipient_id, body, body_hash, expires_at, status)
values ('dddddddd-9000-0000-0000-000000000008', 'dddddddd-9000-0000-0000-000000000006', 'Same line', md5('same line'), now() + interval '1 hour', 'EXPIRED');
set local role service_role;
select lives_ok($$ select public.send_message_request('dddddddd-9000-0000-0000-000000000008', 'dddddddd-9000-0000-0000-000000000003', 'Same   LINE') $$,
  'the same text to a second member');
reset role;
select is((select count(*)::int from public.moderation_flags where entity_id = 'dddddddd-9000-0000-0000-000000000008'
           and reason = 'DUPLICATE_REQUEST_TEXT' and details::text not like '%Same%'), 1,
  '§17: the same text to many members flags the sender (the text is not in the flag)');

-- ---------------------------------------------------------------------------
-- Self-audit round 1
-- ---------------------------------------------------------------------------
reset role;
update public.app_settings set value = '20'::jsonb where key = 'requests.daily_cap';
update public.app_settings set value = '5'::jsonb where key = 'requests.duplicate_text_recipients';
select pg_temp.member('dddddddd-9000-0000-0000-000000000011', 'Kebeh', 'WOMAN', 'MAN', '1996-02-01');
select pg_temp.member('dddddddd-9000-0000-0000-000000000012', 'Daniel', 'MAN', 'WOMAN', '1994-02-01');
select pg_temp.member('dddddddd-9000-0000-0000-000000000013', 'Siah', 'WOMAN', 'MAN', '1997-02-01');
select pg_temp.give_pass(u, 24) from unnest(array['dddddddd-9000-0000-0000-000000000011', 'dddddddd-9000-0000-0000-000000000012',
  'dddddddd-9000-0000-0000-000000000013']::uuid[]) u;
insert into public.verifications (user_id, pose_prompt, status, rejection_reason, selfie_storage_path, submitted_at, reviewed_at)
values ('dddddddd-9000-0000-0000-000000000013', 'Touch your ear', 'REJECTED', 'POSE_NOT_MATCHING', gen_random_uuid() || '.webp', now(), now());
set local role service_role;
select public.set_availability('dddddddd-9000-0000-0000-000000000012', null, now() + interval '3 hours');

-- The fast pool query and pool_visible() agree for every viewer and member here.
reset role;
select is(
  (select coalesce(array_agg(x.id::text || ':' || x.o::text order by x.id::text || ':' || x.o::text), '{}') from (
     select v.id, (c.card ->> 'user_id')::uuid as o
     from unnest(array['dddddddd-9000-0000-0000-000000000001', 'dddddddd-9000-0000-0000-000000000008',
                       'dddddddd-9000-0000-0000-000000000011']::uuid[]) v(id),
          lateral public.pool_candidates(v.id) c) x),
  (select coalesce(array_agg(x.id::text || ':' || x.o::text order by x.id::text || ':' || x.o::text), '{}') from (
     select v.id, a.user_id as o
     from unnest(array['dddddddd-9000-0000-0000-000000000001', 'dddddddd-9000-0000-0000-000000000008',
                       'dddddddd-9000-0000-0000-000000000011']::uuid[]) v(id),
          public.availability a where public.pool_visible(v.id, a.user_id)) x),
  'pool_candidates() and pool_visible() agree for several viewers (blocks, declines, compatibility)');
set local role service_role;
select throws_ok($$ select public.send_message_request('dddddddd-9000-0000-0000-000000000013', 'dddddddd-9000-0000-0000-000000000012', 'Hi') $$,
  '42501', 'NOT_ELIGIBLE', 'BR-21: a sender whose verification was rejected can''t send requests');

-- OD-24: requests follow the recipient's window.
insert into r select 'k1', public.send_message_request('dddddddd-9000-0000-0000-000000000011', 'dddddddd-9000-0000-0000-000000000012', 'Hello Daniel');
select public.set_availability('dddddddd-9000-0000-0000-000000000012', null, now() + interval '5 hours');
select is((select expires_at from public.message_requests where id = (select id from r where n = 'k1')), now() + interval '5 hours',
  'OD-24: extending the window moves the request''s expiry with it');
select public.set_availability('dddddddd-9000-0000-0000-000000000012', null, now() + interval '1 hour');
select is((select expires_at from public.message_requests where id = (select id from r where n = 'k1')), now() + interval '1 hour',
  'OD-24: shortening it does too');
select public.set_availability('dddddddd-9000-0000-0000-000000000012', now() + interval '2 hours', now() + interval '4 hours');
select is((select status::text from public.message_requests where id = (select id from r where n = 'k1')), 'EXPIRED',
  'OD-24: a new window ends requests sent during the old one');

-- Nobody ends open requests; BR-19 for a request recipient without a pass.
select public.set_availability('dddddddd-9000-0000-0000-000000000012', null, now() + interval '3 hours');
insert into r select 'k2', public.send_message_request('dddddddd-9000-0000-0000-000000000011', 'dddddddd-9000-0000-0000-000000000012', 'Hello again');
select public.set_casual_message_permission('dddddddd-9000-0000-0000-000000000012', 'NOBODY');
select is((select status::text from public.message_requests where id = (select id from r where n = 'k2')), 'EXPIRED',
  '§14: choosing Nobody ends open requests to the member');
select public.set_casual_message_permission('dddddddd-9000-0000-0000-000000000012', 'ANYONE');
insert into r select 'k3', public.send_message_request('dddddddd-9000-0000-0000-000000000011', 'dddddddd-9000-0000-0000-000000000012', 'Third time');
reset role;
select set_config('wk.subscription_admin', 'on', true);
update public.subscriptions set expires_at = now() - interval '1 second', starts_at = now() - interval '2 days'
where user_id = 'dddddddd-9000-0000-0000-000000000012';
select set_config('wk.subscription_admin', 'off', true);
set local role service_role;
select is(public.casual_profile('dddddddd-9000-0000-0000-000000000012', 'dddddddd-9000-0000-0000-000000000011') ->> 'available_until', null,
  'BR-19: no window end for someone outside the viewer''s pool, even with an open request');
select throws_ok($$ select public.respond_to_request('dddddddd-9000-0000-0000-000000000012', (select id from r where n = 'k3'), 'ACCEPT') $$,
  '42501', 'NOT_ELIGIBLE', 'BR-25: accepting needs the recipient''s own pass');
reset role;
select pg_temp.give_pass('dddddddd-9000-0000-0000-000000000012', 24);

-- A suspended sender's request is hidden and can't be answered.
update public.users set suspended_until = now() + interval '1 day' where id = 'dddddddd-9000-0000-0000-000000000011';
set local role service_role;
select is((select count(*)::int from public.requests_received('dddddddd-9000-0000-0000-000000000012')), 0,
  'a suspended sender''s request is hidden');
select throws_ok($$ select public.respond_to_request('dddddddd-9000-0000-0000-000000000012', (select id from r where n = 'k3'), 'ACCEPT') $$,
  '22023', 'REQUEST_NOT_OPEN', 'and can''t be accepted');
reset role;
update public.users set suspended_until = null where id = 'dddddddd-9000-0000-0000-000000000011';

-- Accept, then a block closes the Casual conversation for both (BR-24).
set local role service_role;
insert into r select 'kc', public.respond_to_request('dddddddd-9000-0000-0000-000000000012', (select id from r where n = 'k3'), 'ACCEPT');
select ok(public.casual_profile('dddddddd-9000-0000-0000-000000000011', 'dddddddd-9000-0000-0000-000000000012') ->> 'conversation_id' is not null,
  'members of an open Casual conversation can open each other''s Casual profile');
select public.block_user('dddddddd-9000-0000-0000-000000000011', 'dddddddd-9000-0000-0000-000000000012');
reset role;
select is((select status::text from public.conversations where id = (select id from r where n = 'kc')), 'CLOSED',
  'BR-24: a block closes the Casual conversation for both');
select is(public.casual_profile('dddddddd-9000-0000-0000-000000000012', 'dddddddd-9000-0000-0000-000000000011'), null,
  'BR-24: and the profile is gone');

-- §17 request bursts
update public.app_settings set value = '2'::jsonb where key = 'requests.burst_count';
select pg_temp.member('dddddddd-9000-0000-0000-000000000014', 'Eric', 'MAN', 'WOMAN', '1992-02-01');
select pg_temp.member('dddddddd-9000-0000-0000-000000000015', 'Sam', 'MAN', 'WOMAN', '1991-02-01');
select pg_temp.give_pass(u, 24) from unnest(array['dddddddd-9000-0000-0000-000000000014', 'dddddddd-9000-0000-0000-000000000015']::uuid[]) u;
set local role service_role;
select public.set_availability(u, null, now() + interval '3 hours')
from unnest(array['dddddddd-9000-0000-0000-000000000014', 'dddddddd-9000-0000-0000-000000000015']::uuid[]) u;
reset role;
delete from public.verifications where user_id = 'dddddddd-9000-0000-0000-000000000013' and status = 'REJECTED';
set local role service_role;
select lives_ok($$ select public.send_message_request('dddddddd-9000-0000-0000-000000000013', 'dddddddd-9000-0000-0000-000000000014', 'Hi Eric'),
                         public.send_message_request('dddddddd-9000-0000-0000-000000000013', 'dddddddd-9000-0000-0000-000000000015', 'Hi Sam') $$,
  'two requests in a few minutes');
reset role;
select is((select count(*)::int from public.moderation_flags where entity_id = 'dddddddd-9000-0000-0000-000000000013'
           and reason = 'REQUEST_BURST' and status = 'OPEN'), 1, '§17: many requests in a short time flag the sender (T-19)');

select * from finish();
rollback;
