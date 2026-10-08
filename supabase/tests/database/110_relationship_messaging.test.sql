-- Phase 6: Relationship discover, likes, matches, conversations, messages, reports from chat
-- (spec §14, §15, §17; BR-5, 8, 13, 23, 24, 34; OD-10, OD-26, OD-33).
begin;
create extension if not exists pgtap with schema extensions;
select plan(83);

-- Fixtures (all fictional): Musu and Fatu (women seeking men); Prince and Joseph (men seeking women);
-- Kemah (Casual only); Varney (never verified); a moderator.
insert into auth.users (id, phone, email, aud, role) values
  ('aaaaaaaa-6000-0000-0000-000000000001', '231770006001', null, 'authenticated', 'authenticated'),
  ('aaaaaaaa-6000-0000-0000-000000000002', '231770006002', null, 'authenticated', 'authenticated'),
  ('aaaaaaaa-6000-0000-0000-000000000003', '231770006003', null, 'authenticated', 'authenticated'),
  ('aaaaaaaa-6000-0000-0000-000000000004', '231770006004', null, 'authenticated', 'authenticated'),
  ('aaaaaaaa-6000-0000-0000-000000000005', '231770006005', null, 'authenticated', 'authenticated'),
  ('aaaaaaaa-6000-0000-0000-000000000006', '231770006006', null, 'authenticated', 'authenticated'),
  ('aaaaaaaa-6000-0000-0000-0000000000aa', null, 'mod-110@example.test', 'authenticated', 'authenticated');
insert into public.profiles (user_id, date_of_birth, display_name, gender, seeking_genders, area_id,
                             intent_relationship, intent_casual, is_profile_complete)
select u.id, u.dob, u.name, u.gender::public.gender, array[u.seeking]::public.gender[],
       (select id from public.areas where name = u.area), u.rel, not u.rel, true
from (values
  ('aaaaaaaa-6000-0000-0000-000000000001'::uuid, 'Musu',   'WOMAN', 'MAN',   'Sinkor',     true,  '1997-01-01'::date),
  ('aaaaaaaa-6000-0000-0000-000000000002'::uuid, 'Prince', 'MAN',   'WOMAN', 'Sinkor',     true,  '1995-01-01'::date),
  ('aaaaaaaa-6000-0000-0000-000000000003'::uuid, 'Joseph', 'MAN',   'WOMAN', 'Congo Town', true,  '1985-01-01'::date),
  ('aaaaaaaa-6000-0000-0000-000000000004'::uuid, 'Fatu',   'WOMAN', 'MAN',   'Congo Town', true,  '1996-01-01'::date),
  ('aaaaaaaa-6000-0000-0000-000000000005'::uuid, 'Kemah',  'MAN',   'WOMAN', 'Sinkor',     false, '1996-01-01'::date),
  ('aaaaaaaa-6000-0000-0000-000000000006'::uuid, 'Varney', 'MAN',   'WOMAN', 'Sinkor',     true,  '1996-01-01'::date)
) as u(id, name, gender, seeking, area, rel, dob);
insert into public.profile_photos (user_id, status, storage_path, sort_order, is_primary, reviewed_as_primary, submitted_at)
select u, 'APPROVED', gen_random_uuid() || '.webp', n, n = 0, n = 0, now()
from unnest(array['aaaaaaaa-6000-0000-0000-000000000001', 'aaaaaaaa-6000-0000-0000-000000000002',
                  'aaaaaaaa-6000-0000-0000-000000000003', 'aaaaaaaa-6000-0000-0000-000000000004',
                  'aaaaaaaa-6000-0000-0000-000000000005', 'aaaaaaaa-6000-0000-0000-000000000006']::uuid[]) as u,
     generate_series(0, 2) as n;
insert into public.verifications (user_id, pose_prompt, status, selfie_storage_path, submitted_at, reviewed_at)
select u, 'Touch your ear', 'VERIFIED', gen_random_uuid() || '.webp', now(), now()
from unnest(array['aaaaaaaa-6000-0000-0000-000000000001', 'aaaaaaaa-6000-0000-0000-000000000002',
                  'aaaaaaaa-6000-0000-0000-000000000003', 'aaaaaaaa-6000-0000-0000-000000000004',
                  'aaaaaaaa-6000-0000-0000-000000000005']::uuid[]) as u;
update public.users set status = 'ACTIVE' where id::text like 'aaaaaaaa-6000-%';
update public.users set role = 'MODERATOR' where id = 'aaaaaaaa-6000-0000-0000-0000000000aa';
insert into public.user_interests (user_id, interest_id)
select 'aaaaaaaa-6000-0000-0000-000000000002', id from public.interests order by name limit 1;

create temp table ids (n text primary key, id uuid);
grant select on ids to authenticated;
create temp table claims (who text primary key, c text);
grant select on claims to authenticated;
insert into claims values
  ('musu', '{"sub":"aaaaaaaa-6000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}'),
  ('fatu', '{"sub":"aaaaaaaa-6000-0000-0000-000000000004","role":"authenticated","aal":"aal1"}'),
  ('mod', '{"sub":"aaaaaaaa-6000-0000-0000-0000000000aa","role":"authenticated","aal":"aal2","amr":[{"method":"password","timestamp":1},{"method":"totp","timestamp":2}]}');

-- ---------------------------------------------------------------------------
-- Settings decided by the owner
-- ---------------------------------------------------------------------------
select is(public.get_setting('relationship.daily_like_cap')::int, 50, 'OD-10: 50 likes per 24 hours (owner)');
select is(public.get_setting('relationship.pass_cooldown_days')::int, 7, 'pass cool-down of 7 days (owner)');

-- ---------------------------------------------------------------------------
-- Eligibility (§15, BR-8, BR-13)
-- ---------------------------------------------------------------------------
select ok(public.relationship_eligible('aaaaaaaa-6000-0000-0000-000000000001'), 'an ACTIVE verified member with 3 approved photos and Relationship intent is eligible');
select ok(not public.relationship_eligible('aaaaaaaa-6000-0000-0000-000000000005'), 'intent must include Relationship');
select ok(not public.relationship_eligible('aaaaaaaa-6000-0000-0000-000000000006'), 'BR-13: an unverified member never appears');
update public.profile_photos set status = 'PENDING_REVIEW'
where user_id = 'aaaaaaaa-6000-0000-0000-000000000003' and sort_order = 2;
select ok(not public.relationship_eligible('aaaaaaaa-6000-0000-0000-000000000003'), 'BR-8: fewer than 3 approved photos leaves discovery');
update public.profile_photos set status = 'APPROVED'
where user_id = 'aaaaaaaa-6000-0000-0000-000000000003' and sort_order = 2;
set constraints all immediate;
set constraints all deferred;

-- ---------------------------------------------------------------------------
-- Clients have no direct access
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'musu'), true);
select throws_ok($$ select * from public.messages $$, '42501', null, 'members cannot read the messages table');
select throws_ok($$ select * from public.likes $$, '42501', null, 'members cannot read likes');
select throws_ok($$ select public.like_user('aaaaaaaa-6000-0000-0000-000000000001', 'aaaaaaaa-6000-0000-0000-000000000002') $$,
  '42501', null, 'members cannot call like_user directly (the server passes the session user)');
select throws_ok($$ select public.send_message('aaaaaaaa-6000-0000-0000-000000000001', gen_random_uuid(), 'hi') $$,
  '42501', null, 'members cannot call send_message directly');
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- Discover (§15 filters)
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.discover_candidates('aaaaaaaa-6000-0000-0000-000000000001', p_limit => 20)), 2,
  'Musu sees Prince and Joseph only (gender both ways, eligible, not herself)');
select ok(not exists (select 1 from public.discover_candidates('aaaaaaaa-6000-0000-0000-000000000001', p_limit => 20)
                      where photo_path is null), 'every card has an approved main photo');
select ok(not exists (select 1 from public.discover_candidates('aaaaaaaa-6000-0000-0000-000000000001', p_limit => 20)
                      where card ?| array['date_of_birth', 'phone', 'status', 'storage_path']), 'cards carry no DOB, phone, status or path');
select is((select card ->> 'display_name' from public.discover_candidates('aaaaaaaa-6000-0000-0000-000000000001',
  p_area_id => (select id from public.areas where name = 'Sinkor'), p_limit => 20)), 'Prince', 'area filter');
select is((select card ->> 'display_name' from public.discover_candidates('aaaaaaaa-6000-0000-0000-000000000001',
  p_min_age => 35, p_limit => 20)), 'Joseph', 'age filter');
select is((select card ->> 'display_name' from public.discover_candidates('aaaaaaaa-6000-0000-0000-000000000001',
  p_interest_ids => array[(select id from public.interests order by name limit 1)], p_limit => 20)), 'Prince', 'interests filter');
select throws_ok($$ select * from public.discover_candidates('aaaaaaaa-6000-0000-0000-000000000005') $$, '42501', 'NOT_ELIGIBLE',
  'only eligible members browse Relationship');

-- ---------------------------------------------------------------------------
-- Likes and matching
-- ---------------------------------------------------------------------------
select is(public.like_user('aaaaaaaa-6000-0000-0000-000000000001', 'aaaaaaaa-6000-0000-0000-000000000002') -> 'matched', 'false'::jsonb,
  'a one-way like is not a match');
select ok(not exists (select 1 from public.discover_candidates('aaaaaaaa-6000-0000-0000-000000000001', p_limit => 20)
                      where card ->> 'display_name' = 'Prince'), 'a liked profile leaves Discover');
select is((select card ->> 'display_name' from public.likes_received('aaaaaaaa-6000-0000-0000-000000000002')), 'Musu',
  'Prince sees Musu in Likes received');
insert into ids select 'conv', (public.like_user('aaaaaaaa-6000-0000-0000-000000000002', 'aaaaaaaa-6000-0000-0000-000000000001') ->> 'conversation_id')::uuid;
select isnt((select id from ids where n = 'conv'), null, 'a mutual like creates a match and opens a conversation');
select is((select count(*)::int from public.matches where user_a_id = 'aaaaaaaa-6000-0000-0000-000000000001'
  and user_b_id = 'aaaaaaaa-6000-0000-0000-000000000002'), 1, '§15: one match row, the pair stored once and ordered');
select throws_ok($$ insert into public.matches (user_a_id, user_b_id) values ('aaaaaaaa-6000-0000-0000-000000000001', 'aaaaaaaa-6000-0000-0000-000000000002') $$,
  '23505', null, 'a second match for the same pair is impossible');
select throws_ok($$ insert into public.matches (user_a_id, user_b_id) values ('aaaaaaaa-6000-0000-0000-000000000002', 'aaaaaaaa-6000-0000-0000-000000000001') $$,
  '23514', null, 'the pair must be ordered (user_a_id < user_b_id)');
select is((select type::text from public.conversations where id = (select id from ids where n = 'conv')), 'RELATIONSHIP', 'a RELATIONSHIP conversation');
select is((select count(*)::int from public.conversation_members where conversation_id = (select id from ids where n = 'conv')), 2,
  'strictly one-to-one');
select throws_ok($$ select public.like_user('aaaaaaaa-6000-0000-0000-000000000001', 'aaaaaaaa-6000-0000-0000-000000000002') $$,
  'P0002', 'MEMBER_NOT_FOUND', 'liking a match again does nothing more');
select is((select count(*)::int from public.likes_received('aaaaaaaa-6000-0000-0000-000000000002')), 0, 'the match leaves Likes received');
select throws_ok($$ select public.like_user('aaaaaaaa-6000-0000-0000-000000000001', 'aaaaaaaa-6000-0000-0000-000000000004') $$,
  'P0002', 'MEMBER_NOT_FOUND', 'members can like only people they could be shown');

-- Passes and the cool-down.
select lives_ok($$ select public.pass_user('aaaaaaaa-6000-0000-0000-000000000001', 'aaaaaaaa-6000-0000-0000-000000000003') $$, 'Musu passes on Joseph');
select is((select count(*)::int from public.discover_candidates('aaaaaaaa-6000-0000-0000-000000000001', p_limit => 20)), 0,
  'a passed profile leaves Discover');
update public.passes set created_at = now() - interval '8 days' where sender_id = 'aaaaaaaa-6000-0000-0000-000000000001';
select is((select card ->> 'display_name' from public.discover_candidates('aaaaaaaa-6000-0000-0000-000000000001', p_limit => 20)), 'Joseph',
  'and returns after the 7-day cool-down');

-- OD-10 like cap.
update public.app_settings set value = '1'::jsonb where key = 'relationship.daily_like_cap';
select throws_ok($$ select public.like_user('aaaaaaaa-6000-0000-0000-000000000001', 'aaaaaaaa-6000-0000-0000-000000000003') $$,
  '22023', 'LIKE_LIMIT', 'OD-10: likes are capped per 24 hours');
update public.app_settings set value = '50'::jsonb where key = 'relationship.daily_like_cap';

-- ---------------------------------------------------------------------------
-- Messages (BR-23, OD-31) and Realtime
-- ---------------------------------------------------------------------------
select is(public.send_message('aaaaaaaa-6000-0000-0000-000000000001', (select id from ids where n = 'conv'), '  Hi Prince!  ') ->> 'body',
  'Hi Prince!', 'a match can message (text trimmed)');
select throws_ok($$ select public.send_message('aaaaaaaa-6000-0000-0000-000000000003', (select id from ids where n = 'conv'), 'hello') $$,
  'P0002', 'CONVERSATION_NOT_FOUND', 'BR-23: no messaging without a match (non-members are refused)');
select throws_ok($$ select public.send_message('aaaaaaaa-6000-0000-0000-000000000001', (select id from ids where n = 'conv'), repeat('a', 1001)) $$,
  '22023', 'INVALID_MESSAGE', 'messages are up to 1000 characters');
select is((select unread::int from public.conversations_list('aaaaaaaa-6000-0000-0000-000000000002')), 1, 'Prince has one unread message');
select ok(not exists (select 1 from jsonb_array_elements(public.conversation_view('aaaaaaaa-6000-0000-0000-000000000002',
  (select id from ids where n = 'conv')) -> 'messages') m where m ? 'flagged' or m ? 'sender_id'),
  'members never see the moderation flag');
select ok(exists (select 1 from realtime.messages where topic = 'conversation:' || (select id from ids where n = 'conv')
  and event = 'message' and not (payload ? 'flagged')), 'new messages are broadcast to the private conversation channel, without the flag');
select lives_ok($$ select public.mark_conversation_read('aaaaaaaa-6000-0000-0000-000000000002', (select id from ids where n = 'conv')) $$,
  'Prince reads the conversation');
select ok((select read_at is not null from public.messages where conversation_id = (select id from ids where n = 'conv') limit 1),
  '§14: read receipts via read_at');
select is((select unread::int from public.conversations_list('aaaaaaaa-6000-0000-0000-000000000002')), 0, 'nothing unread');

-- OD-31: money terms are delivered and flagged without their text.
select public.send_message('aaaaaaaa-6000-0000-0000-000000000001', (select id from ids where n = 'conv'),
  'Fictional money message', true, array['PRICE']);
select is((select count(*)::int from public.messages where conversation_id = (select id from ids where n = 'conv')), 2,
  'OD-31: a flagged message is still delivered');
select is((select count(*)::int from public.moderation_flags where entity_type = 'USER' and reason = 'MONEY_TERMS'
  and entity_id = 'aaaaaaaa-6000-0000-0000-000000000001'), 1, 'and raises a MONEY_TERMS flag on the sender');
select public.send_message('aaaaaaaa-6000-0000-0000-000000000001', (select id from ids where n = 'conv'),
  'Another fictional money message', true, array['MONEY_REQUEST']);
select is((select count(*)::int from public.moderation_flags where reason = 'MONEY_TERMS'
  and entity_id = 'aaaaaaaa-6000-0000-0000-000000000001' and status = 'OPEN'), 1, 'repeats don''t flood the queue (one open flag per sender)');
select ok(not exists (select 1 from public.moderation_flags where reason = 'MONEY_TERMS' and details::text like '%Fictional money%'),
  'OD-26: the flag holds no message text');

-- Realtime authorisation (private channels).
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'musu'), true);
select ok(public.can_join_conversation_topic('conversation:' || (select id from ids where n = 'conv')), 'a member may join their conversation channel');
select ok(not public.can_join_conversation_topic('conversation:not-a-uuid'), 'malformed topics are refused');
select set_config('request.jwt.claims', (select c from claims where who = 'fatu'), true);
select ok(not public.can_join_conversation_topic('conversation:' || (select id from ids where n = 'conv')),
  'nobody else may join it');
select set_config('realtime.topic', 'conversation:' || (select id from ids where n = 'conv'), true);
select is((select count(*)::int from realtime.messages), 0, 'Realtime RLS: a non-member receives nothing from that channel');
select set_config('request.jwt.claims', (select c from claims where who = 'musu'), true);
select ok((select count(*) from realtime.messages) > 0, 'Realtime RLS: a member receives the channel''s broadcasts');
select set_config('realtime.topic', '', true);
reset role;
select set_config('request.jwt.claims', '', true);

-- BR-5: suspended members read but don't send, browse or like.
update public.users set suspended_until = now() + interval '1 day' where id = 'aaaaaaaa-6000-0000-0000-000000000001';
select ok(not (public.conversation_view('aaaaaaaa-6000-0000-0000-000000000001', (select id from ids where n = 'conv')) ->> 'can_send')::boolean,
  'BR-5: a suspended member can read but not send');
select throws_ok($$ select public.send_message('aaaaaaaa-6000-0000-0000-000000000001', (select id from ids where n = 'conv'), 'hello') $$,
  '42501', 'CANNOT_SEND', 'BR-5: sending is refused while suspended');
select throws_ok($$ select * from public.discover_candidates('aaaaaaaa-6000-0000-0000-000000000001') $$, '42501', 'NOT_ELIGIBLE',
  'BR-5: no discovery while suspended');
select throws_ok($$ select public.like_user('aaaaaaaa-6000-0000-0000-000000000001', 'aaaaaaaa-6000-0000-0000-000000000003') $$,
  '42501', 'NOT_ELIGIBLE', 'BR-5: no likes while suspended');
update public.users set suspended_until = null where id = 'aaaaaaaa-6000-0000-0000-000000000001';

-- Q26 / Q29: members hidden by reports.
update public.users set hidden_reason = 'REPORT_THRESHOLD', hidden_at = now() where id = 'aaaaaaaa-6000-0000-0000-000000000001';
select throws_ok($$ select public.send_message('aaaaaaaa-6000-0000-0000-000000000001', (select id from ids where n = 'conv'), 'hello') $$,
  '42501', 'CANNOT_SEND', 'Q26: a member hidden by reports cannot send');
update public.users set hidden_reason = null, hidden_at = null where id = 'aaaaaaaa-6000-0000-0000-000000000001';
update public.users set hidden_reason = 'UNDER_18_REPORT', hidden_at = now() where id = 'aaaaaaaa-6000-0000-0000-000000000002';
select throws_ok($$ select public.send_message('aaaaaaaa-6000-0000-0000-000000000001', (select id from ids where n = 'conv'), 'hello') $$,
  '42501', 'CANNOT_SEND', 'Q29: nobody can message a member hidden after an under-18 report');
update public.users set hidden_reason = null, hidden_at = null where id = 'aaaaaaaa-6000-0000-0000-000000000002';

-- Banned members: no messages to them, and their conversation doesn't count as unread.
select public.send_message('aaaaaaaa-6000-0000-0000-000000000002', (select id from ids where n = 'conv'), 'Hello Musu');
select is((public.relationship_summary('aaaaaaaa-6000-0000-0000-000000000001') ->> 'unread')::int, 1, 'Musu has one unread message');
update public.users set status = 'BANNED' where id = 'aaaaaaaa-6000-0000-0000-000000000002';
select is((public.relationship_summary('aaaaaaaa-6000-0000-0000-000000000001') ->> 'unread')::int, 0,
  'a conversation with a banned member is gone, unread included');
select throws_ok($$ select public.send_message('aaaaaaaa-6000-0000-0000-000000000001', (select id from ids where n = 'conv'), 'hello') $$,
  '42501', 'CANNOT_SEND', 'nobody messages a banned member');
update public.users set status = 'ACTIVE' where id = 'aaaaaaaa-6000-0000-0000-000000000002';

-- ---------------------------------------------------------------------------
-- Reports from a conversation (§17, OD-26, OD-33)
-- ---------------------------------------------------------------------------
insert into ids select 'report', public.submit_conversation_report('aaaaaaaa-6000-0000-0000-000000000002',
  (select id from ids where n = 'conv'), 'MONEY_SCAM', 'Asked for money.');
select is((select count(*)::int from public.report_messages where report_id = (select id from ids where n = 'report')), 4,
  'the recent messages are captured with the report');
select throws_ok($$ select public.submit_conversation_report('aaaaaaaa-6000-0000-0000-000000000003', (select id from ids where n = 'conv'), 'SPAM') $$,
  'P0002', 'CONVERSATION_NOT_FOUND', 'only a member of the conversation can report from it');
select throws_ok($$ select public.submit_conversation_report('aaaaaaaa-6000-0000-0000-000000000001', (select id from ids where n = 'conv'), 'INAPPROPRIATE_PHOTO') $$,
  '22023', 'PHOTO_REQUIRED', 'photo reports are made from the profile');

set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'musu'), true);
select throws_ok($$ select * from public.staff_report_messages((select id from ids where n = 'report')) $$, '42501', 'NOT_STAFF',
  'OD-26: members cannot read captured messages');
select set_config('request.jwt.claims', (select c from claims where who = 'mod'), true);
select is((public.staff_report_detail((select id from ids where n = 'report')) ->> 'captured_messages')::int, 4,
  'the report detail says how many messages were captured (without showing them)');
select is((select count(*)::int from public.staff_report_messages((select id from ids where n = 'report')) where from_reported), 3,
  'the moderator reads the captured messages, marked by sender');
select is((select count(*)::int from public.staff_report_messages((select id from ids where n = 'report'))), 4, 'and reads them again');
select is((select account_id from public.staff_flags_queue() where reason = 'MONEY_TERMS'), 'aaaaaaaa-6000-0000-0000-000000000001'::uuid,
  'a money-terms flag points to the sender''s account');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from public.audit_logs where action = 'REPORTED_MESSAGES_VIEWED'
  and entity_id = (select id::text from ids where n = 'report')), 2, 'OD-33 / BR-34: every view is audited');
select ok(not exists (select 1 from public.audit_logs where action = 'REPORTED_MESSAGES_VIEWED' and metadata::text like '%Hi Prince%'),
  'the audit row holds no message text');

-- ---------------------------------------------------------------------------
-- Unmatch and block close the conversation for both (§14, BR-24)
-- ---------------------------------------------------------------------------
select lives_ok($$ select public.unmatch('aaaaaaaa-6000-0000-0000-000000000002',
  (select id from public.matches where user_a_id = 'aaaaaaaa-6000-0000-0000-000000000001' and user_b_id = 'aaaaaaaa-6000-0000-0000-000000000002')) $$,
  'Prince unmatches');
select throws_ok($$ select public.conversation_view('aaaaaaaa-6000-0000-0000-000000000001', (select id from ids where n = 'conv')) $$,
  'P0002', 'CONVERSATION_NOT_FOUND', 'the conversation is gone for Musu too');
select is((select count(*)::int from public.matches_list('aaaaaaaa-6000-0000-0000-000000000001')), 0, 'and from her matches');
select ok(not public.can_view_profile('aaaaaaaa-6000-0000-0000-000000000001', 'aaaaaaaa-6000-0000-0000-000000000002'),
  'BR-24: after an unmatch the profiles are gone too, exactly as after a block');
select throws_ok($$ select public.like_user('aaaaaaaa-6000-0000-0000-000000000001', 'aaaaaaaa-6000-0000-0000-000000000002') $$,
  'P0002', 'MEMBER_NOT_FOUND', 'an unmatched pair cannot match again');
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'musu'), true);
select ok(not public.can_join_conversation_topic('conversation:' || (select id from ids where n = 'conv')),
  'a closed conversation''s channel can no longer be joined');
reset role;
select set_config('request.jwt.claims', '', true);

select public.like_user('aaaaaaaa-6000-0000-0000-000000000001', 'aaaaaaaa-6000-0000-0000-000000000003');
insert into ids select 'conv2', (public.like_user('aaaaaaaa-6000-0000-0000-000000000003', 'aaaaaaaa-6000-0000-0000-000000000001') ->> 'conversation_id')::uuid;
select lives_ok($$ select public.block_user('aaaaaaaa-6000-0000-0000-000000000003', 'aaaaaaaa-6000-0000-0000-000000000001') $$, 'Joseph blocks Musu');
select is((select closed_reason from public.conversations where id = (select id from ids where n = 'conv2')), 'BLOCKED',
  'BR-24: blocking closes the conversation for both');
select is((select status::text from public.matches where user_a_id = 'aaaaaaaa-6000-0000-0000-000000000001'
  and user_b_id = 'aaaaaaaa-6000-0000-0000-000000000003'), 'UNMATCHED', 'and ends the match');
select throws_ok($$ select public.send_message('aaaaaaaa-6000-0000-0000-000000000001', (select id from ids where n = 'conv2'), 'hello?') $$,
  '42501', 'CANNOT_SEND', 'BR-24: no messages after a block');
select lives_ok($$ select public.submit_conversation_report('aaaaaaaa-6000-0000-0000-000000000003', (select id from ids where n = 'conv2'), 'SPAM') $$,
  'the blocker can still report from the closed conversation');
select throws_ok($$ select public.submit_conversation_report('aaaaaaaa-6000-0000-0000-000000000001', (select id from ids where n = 'conv2'), 'UNDER_18') $$,
  'P0002', 'CONVERSATION_NOT_FOUND', 'BR-24: the blocked member cannot report from it (same answer as after an unmatch)');
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'musu'), true);
select ok(not public.can_join_conversation_topic('conversation:' || (select id from ids where n = 'conv2')),
  'BR-24: nor join its channel');
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
