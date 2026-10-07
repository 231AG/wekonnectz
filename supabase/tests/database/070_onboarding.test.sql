-- Phase 2: onboarding tables, RLS and functions (spec §10 steps 4–8, BR-20, BR-31 storage side).
begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

-- Fixtures: two members with DOB, one area and five interests from the seed.
insert into auth.users (id, phone, aud, role) values
  ('cccccccc-0000-0000-0000-000000000001', '231770000601', 'authenticated', 'authenticated'),
  ('cccccccc-0000-0000-0000-000000000002', '231770000602', 'authenticated', 'authenticated');
insert into public.profiles (user_id, date_of_birth) values
  ('cccccccc-0000-0000-0000-000000000001', '1995-05-05'),
  ('cccccccc-0000-0000-0000-000000000002', '1996-06-06');

create temp table fx as
select (select id from public.areas where name = 'Sinkor') as area_id,
       (select array_agg(id order by name) from (select id, name from public.interests order by name limit 5) i) as interest_ids;
grant select on fx to authenticated;

select is((select count(*)::int from public.user_settings where user_id in
  ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002')), 2,
  'user_settings row created for each new member');
select is((select casual_message_permission::text from public.user_settings where user_id = 'cccccccc-0000-0000-0000-000000000001'),
  'ANYONE', 'default message permission is ANYONE (mock-up default)');

-- Progress before anything.
select is(public.onboarding_progress_for('cccccccc-0000-0000-0000-000000000001'),
  '{"has_dob": true, "rules_accepted": false, "basics_done": false, "interests_bio_done": false, "photos_done": false}'::jsonb,
  'fresh member: only the DOB step is done');

-- §10 step 4: rules at the exact current versions.
select throws_ok($$ select public.accept_current_documents('cccccccc-0000-0000-0000-000000000001',
  '{"RULES":"old","TERMS":"draft-2026-10","PRIVACY":"draft-2026-10"}') $$, '22023', 'DOCUMENT_VERSION_MISMATCH',
  'accepting an outdated document version is refused');
select throws_ok($$ select public.save_profile_basics('cccccccc-0000-0000-0000-000000000001', 'Musu', 'WOMAN',
  array['MAN']::public.gender[], (select area_id from fx), true, true) $$, '42501', 'RULES_NOT_ACCEPTED',
  'basics cannot be saved before the rules are accepted');
select lives_ok($$ select public.accept_current_documents('cccccccc-0000-0000-0000-000000000001',
  '{"RULES":"draft-2026-10","TERMS":"draft-2026-10","PRIVACY":"draft-2026-10"}') $$, 'current versions accepted');
select is((select count(*)::int from public.consents where user_id = 'cccccccc-0000-0000-0000-000000000001'), 3,
  '§10: one consent per document, stored with its version');
select lives_ok($$ select public.accept_current_documents('cccccccc-0000-0000-0000-000000000001',
  '{"RULES":"draft-2026-10","TERMS":"draft-2026-10","PRIVACY":"draft-2026-10"}') $$, 'accepting again is harmless');
select throws_ok($$ insert into public.consents (user_id, document, version) values
  ('cccccccc-0000-0000-0000-000000000001', 'TERMS', 'bogus') $$, '23503', null,
  'a consent must reference a published document version');

-- §10 steps 5–6: basics + intent; BR-20 controlled area list.
select throws_ok($$ select public.save_profile_basics('cccccccc-0000-0000-0000-000000000001', 'Musu', 'WOMAN',
  array['MAN']::public.gender[], gen_random_uuid(), true, true) $$, '22023', 'INVALID_AREA',
  'BR-20: an area outside the controlled list is refused');
select throws_ok($$ select public.save_profile_basics('cccccccc-0000-0000-0000-000000000001', 'Musu', 'WOMAN',
  array['MAN']::public.gender[], (select area_id from fx), false, false) $$, '22023', 'INTENT_REQUIRED',
  'at least one intent is required');
select throws_ok($$ select public.save_profile_basics('cccccccc-0000-0000-0000-000000000001', 'M', 'WOMAN',
  array['MAN']::public.gender[], (select area_id from fx), true, false) $$, '22023', 'INVALID_DISPLAY_NAME',
  'display name needs 2–30 characters');
select throws_ok($$ select public.save_profile_basics('cccccccc-0000-0000-0000-000000000001', 'Musu', 'WOMAN',
  array[]::public.gender[], (select area_id from fx), true, false) $$, '22023', 'INVALID_GENDER',
  '"interested in" needs at least one choice');
select throws_ok($$ select public.save_interests_and_bio('cccccccc-0000-0000-0000-000000000001',
  (select interest_ids[1:3] from fx), 'Hi') $$, '42501', 'BASICS_REQUIRED', 'interests cannot come before basics');
select lives_ok($$ select public.save_profile_basics('cccccccc-0000-0000-0000-000000000001', '  Musu  ', 'WOMAN',
  array['MAN', 'MAN']::public.gender[], (select area_id from fx), true, true) $$, 'valid basics saved');
select is((select display_name || '|' || array_to_string(seeking_genders, ',') from public.profiles
  where user_id = 'cccccccc-0000-0000-0000-000000000001'), 'Musu|MAN', 'name trimmed, duplicate choices removed');

-- §10 steps 7–8: ≥3 active interests, bio ≤ 500.
select throws_ok($$ select public.save_interests_and_bio('cccccccc-0000-0000-0000-000000000001',
  (select interest_ids[1:2] from fx), 'Hi') $$, '22023', 'INTERESTS_INVALID', 'fewer than 3 interests refused');
select throws_ok($$ select public.save_interests_and_bio('cccccccc-0000-0000-0000-000000000001',
  (select interest_ids[1:2] || gen_random_uuid() from fx), 'Hi') $$, '22023', 'INTERESTS_INVALID',
  'unknown interest ids refused');
select throws_ok($$ select public.save_interests_and_bio('cccccccc-0000-0000-0000-000000000001',
  (select interest_ids[1:3] from fx), repeat('a', 501)) $$, '22023', 'BIO_TOO_LONG', 'bio over 500 characters refused');
select lives_ok($$ select public.save_interests_and_bio('cccccccc-0000-0000-0000-000000000001',
  (select interest_ids[1:4] from fx), ' Teacher by day. ') $$, 'interests and bio saved');
select lives_ok($$ select public.save_interests_and_bio('cccccccc-0000-0000-0000-000000000001',
  (select interest_ids[2:4] from fx), '') $$, 'interests can be changed; empty bio allowed');
select is((select count(*)::int from public.user_interests where user_id = 'cccccccc-0000-0000-0000-000000000001'), 3,
  'interests are replaced, not appended');
select is(public.onboarding_progress_for('cccccccc-0000-0000-0000-000000000001'),
  '{"has_dob": true, "rules_accepted": true, "basics_done": true, "interests_bio_done": true, "photos_done": false}'::jsonb,
  'all Phase 2 steps done');

-- A new document version means the rules must be accepted again.
update public.legal_documents set is_current = false where document = 'RULES';
insert into public.legal_documents (document, version, title, is_current, body) values ('RULES', 'test-v2', 'Rules v2', true, 'New rules text');
select ok(not public.has_accepted_current_documents('cccccccc-0000-0000-0000-000000000001'),
  'a new rules version requires acceptance again');

-- Published text is fixed: a consent always points at the exact wording.
select is((select content_sha256 from public.legal_documents where document = 'RULES' and version = 'test-v2'),
  encode(extensions.digest('New rules text', 'sha256'), 'hex'), 'each version stores a SHA-256 of its text');
select throws_ok($$ update public.legal_documents set body = 'changed' where document = 'RULES' and version = 'test-v2' $$,
  '42501', null, 'published text cannot be edited (publish a new version instead)');
select throws_ok($$ delete from public.legal_documents where document = 'RULES' and version = 'test-v2' $$,
  '42501', null, 'published versions cannot be deleted');
select lives_ok($$ update public.legal_documents set is_current = false where document = 'RULES' and version = 'test-v2' $$,
  'switching which version is current is allowed');
update public.legal_documents set is_current = true where document = 'RULES' and version = 'test-v2';

-- Accept the new rules version so the next checks reach the rule they test.
select public.accept_current_documents('cccccccc-0000-0000-0000-000000000001',
  '{"RULES":"test-v2","TERMS":"draft-2026-10","PRIVACY":"draft-2026-10"}');

-- Inactive list entries are refused (BR-20, §10 step 7).
update public.areas set active = false where id = (select area_id from fx);
select throws_ok($$ select public.save_profile_basics('cccccccc-0000-0000-0000-000000000001', 'Musu', 'WOMAN',
  array['MAN']::public.gender[], (select area_id from fx), true, true) $$, '22023', 'INVALID_AREA',
  'BR-20: an inactive area is refused');
update public.areas set active = true where id = (select area_id from fx);
update public.interests set active = false where id = (select interest_ids[1] from fx);
select throws_ok($$ select public.save_interests_and_bio('cccccccc-0000-0000-0000-000000000001',
  (select interest_ids[1:3] from fx), '') $$, '22023', 'INTERESTS_INVALID', 'an inactive interest is refused');
update public.interests set active = true where id = (select interest_ids[1] from fx);

-- Suspended / banned accounts cannot edit.
update public.users set status = 'SUSPENDED', suspended_until = now() + interval '1 day'
 where id = 'cccccccc-0000-0000-0000-000000000001';
select throws_ok($$ select public.save_interests_and_bio('cccccccc-0000-0000-0000-000000000001',
  (select interest_ids[1:3] from fx), '') $$, '42501', 'ACCOUNT_CANNOT_EDIT', 'BR-5: a suspended account cannot edit its profile');
update public.users set suspended_until = now() - interval '1 minute'
 where id = 'cccccccc-0000-0000-0000-000000000001';
select lives_ok($$ select public.save_interests_and_bio('cccccccc-0000-0000-0000-000000000001',
  (select interest_ids[1:3] from fx), '') $$, 'BR-5: once the suspension has ended, editing works again');
update public.users set status = 'BANNED' where id = 'cccccccc-0000-0000-0000-000000000002';
select throws_ok($$ select public.accept_current_documents('cccccccc-0000-0000-0000-000000000002', '{}') $$,
  '42501', 'ACCOUNT_CANNOT_EDIT', 'a banned account cannot edit its profile');

-- RLS / grants: members read only their own rows and the active lists; never call the write functions.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);
select ok((select count(*) from public.areas) > 0 and (select count(*) from public.interests) > 0,
  'members can read the area and interest lists');
select is((public.onboarding_progress() ->> 'basics_done')::boolean, true, 'onboarding_progress() returns the caller''s own progress');
select throws_ok($$ select public.onboarding_progress_for('cccccccc-0000-0000-0000-000000000002') $$,
  '42501', null, 'members cannot read another member''s progress');
select is((select count(*)::int from public.user_interests), 3, 'members read only their own interests');
select is((select count(*)::int from public.user_settings), 1, 'members read only their own settings');
select throws_ok($$ select public.save_profile_basics('cccccccc-0000-0000-0000-000000000001', 'Hacker', 'MAN',
  array['WOMAN']::public.gender[], (select area_id from fx), true, true) $$, '42501', null,
  'members cannot call the write functions directly (detection would be skipped)');
select throws_ok($$ update public.profiles set bio = 'call me 0770123456' $$, '42501', null,
  'BR-31: members cannot write their bio directly');
set local role anon;
select throws_ok($$ select id from public.areas $$, '42501', null, 'anon cannot read the area list');
select ok((select count(*) from public.legal_documents where is_current) = 3, 'anon can read the published documents');
select throws_ok($$ select public.save_interests_and_bio('cccccccc-0000-0000-0000-000000000001', '{}', '') $$,
  '42501', null, 'anon cannot call the write functions');
select throws_ok($$ select public.onboarding_progress_for('cccccccc-0000-0000-0000-000000000001') $$,
  '42501', null, 'anon cannot read anyone''s onboarding progress');

reset role;
select * from finish();
rollback;
