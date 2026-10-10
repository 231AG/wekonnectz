-- Phase 5: blocks, reports, flags, suspend / ban / restore (spec §7, §8, §17, §21; BR-5, 6, 24, 32, 33, 34).
begin;
create extension if not exists pgtap with schema extensions;
select plan(119);

-- Fixtures: six ACTIVE members with 3 approved photos (Musu, Comfort, Hawa, Jartu, Fatu, Kemah), one PENDING
-- member (Siah), a moderator and an admin. All fictional.
insert into auth.users (id, phone, email, aud, role) values
  ('ffffffff-0000-0000-0000-000000000001', '231770001001', null, 'authenticated', 'authenticated'),
  ('ffffffff-0000-0000-0000-000000000002', '231770001002', null, 'authenticated', 'authenticated'),
  ('ffffffff-0000-0000-0000-000000000003', '231770001003', null, 'authenticated', 'authenticated'),
  ('ffffffff-0000-0000-0000-000000000004', '231770001004', null, 'authenticated', 'authenticated'),
  ('ffffffff-0000-0000-0000-000000000005', '231770001005', null, 'authenticated', 'authenticated'),
  ('ffffffff-0000-0000-0000-000000000006', '231770001006', null, 'authenticated', 'authenticated'),
  ('ffffffff-0000-0000-0000-000000000007', '231770001007', null, 'authenticated', 'authenticated'),
  ('ffffffff-0000-0000-0000-0000000000aa', null, 'mod-100@example.test', 'authenticated', 'authenticated'),
  ('ffffffff-0000-0000-0000-0000000000bb', null, 'admin-100@example.test', 'authenticated', 'authenticated');
insert into public.profiles (user_id, date_of_birth, display_name, gender, seeking_genders, area_id,
                             intent_relationship, intent_casual, is_profile_complete, bio)
select u.id, '1995-05-05', u.name, 'WOMAN', array['MAN']::public.gender[],
       (select id from public.areas where name = 'Sinkor'), true, false, true, 'Fictional test member.'
from (values ('ffffffff-0000-0000-0000-000000000001'::uuid, 'Musu'),
             ('ffffffff-0000-0000-0000-000000000002'::uuid, 'Comfort'),
             ('ffffffff-0000-0000-0000-000000000003'::uuid, 'Hawa'),
             ('ffffffff-0000-0000-0000-000000000004'::uuid, 'Jartu'),
             ('ffffffff-0000-0000-0000-000000000005'::uuid, 'Fatu'),
             ('ffffffff-0000-0000-0000-000000000006'::uuid, 'Siah'),
             ('ffffffff-0000-0000-0000-000000000007'::uuid, 'Kemah')) as u(id, name);
insert into public.profile_photos (user_id, status, storage_path, sort_order, is_primary, reviewed_as_primary, submitted_at)
select u, 'APPROVED', gen_random_uuid() || '.webp', n, n = 0, n = 0, now()
from unnest(array['ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002',
                  'ffffffff-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000004',
                  'ffffffff-0000-0000-0000-000000000005', 'ffffffff-0000-0000-0000-000000000007']::uuid[]) as u,
     generate_series(0, 2) as n;
update public.users set status = 'ACTIVE' where id in (
  'ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000003',
  'ffffffff-0000-0000-0000-000000000004', 'ffffffff-0000-0000-0000-000000000005', 'ffffffff-0000-0000-0000-000000000007');
update public.users set role = 'MODERATOR', status = 'ACTIVE' where id = 'ffffffff-0000-0000-0000-0000000000aa';
update public.users set role = 'ADMIN', status = 'ACTIVE' where id = 'ffffffff-0000-0000-0000-0000000000bb';

create temp table rx (n text primary key, id uuid);
grant select on rx to authenticated;
create temp table pp as select id, user_id, sort_order from public.profile_photos
  where user_id::text like 'ffffffff-%';
grant select on pp to authenticated;
create temp table claims (who text primary key, c text);
grant select on claims to authenticated;
insert into claims values
  ('mod', '{"sub":"ffffffff-0000-0000-0000-0000000000aa","role":"authenticated","aal":"aal2","amr":[{"method":"password","timestamp":1},{"method":"totp","timestamp":2}]}'),
  ('admin', '{"sub":"ffffffff-0000-0000-0000-0000000000bb","role":"authenticated","aal":"aal2","amr":[{"method":"password","timestamp":1},{"method":"totp","timestamp":2}]}'),
  ('member', '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1","amr":[{"method":"otp","timestamp":1}]}');

-- ---------------------------------------------------------------------------
-- Clients have no access to the safety tables
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'member'), true);
select throws_ok($$ select * from public.blocks $$, '42501', null, 'BR-24: members cannot read blocks (blocks are silent)');
select throws_ok($$ select * from public.reports $$, '42501', null, 'members cannot read reports');
select throws_ok($$ select * from public.moderation_flags $$, '42501', null, 'members cannot read flags');
select throws_ok($$ select public.block_user('ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002') $$,
  '42501', null, 'members cannot call block_user directly (the server passes the session user)');
select throws_ok($$ select public.submit_report('ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002', 'SPAM') $$,
  '42501', null, 'members cannot call submit_report directly');
select throws_ok($$ select * from public.staff_reports_queue() $$, '42501', 'NOT_STAFF', 'members cannot open the reports queue');
select throws_ok($$ select * from public.staff_flags_queue() $$, '42501', 'NOT_STAFF', 'members cannot open the flags queue');
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- BR-24: blocking hides both ways, silently
-- ---------------------------------------------------------------------------
select ok(public.can_view_profile('ffffffff-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000001'),
  'two ACTIVE members can see each other');
select lives_ok($$ select public.block_user('ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002') $$,
  'Musu blocks Comfort');
select lives_ok($$ select public.block_user('ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002') $$,
  'blocking twice is harmless');
select ok(not public.can_view_profile('ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002'),
  'BR-24: the blocker no longer sees the blocked member');
select ok(not public.can_view_profile('ffffffff-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000001'),
  'BR-24: the blocked member no longer sees the blocker');
select is((select count(*)::int from public.photos_for_viewer('ffffffff-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000001')), 0,
  'BR-24: no photos either way');
select is(public.member_profile_for_viewer('ffffffff-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000001'), null,
  'BR-24: the profile reads as not found for the blocked member');
select is((select display_name from public.member_blocked_list('ffffffff-0000-0000-0000-000000000001')), 'Comfort',
  'the blocker sees the block in their own list');
select is((select count(*)::int from public.member_blocked_list('ffffffff-0000-0000-0000-000000000002')), 0,
  'BR-24: the blocked member is not told');
select throws_ok($$ select public.block_user('ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001') $$,
  'P0002', 'MEMBER_NOT_FOUND', 'members cannot block themselves');
select throws_ok($$ select public.block_user('ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-0000000000aa') $$,
  'P0002', 'MEMBER_NOT_FOUND', 'staff accounts cannot be blocked (or found)');
select lives_ok($$ select public.submit_report('ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002', 'SPAM') $$,
  'a member may report someone they blocked');
select throws_ok($$ select public.submit_report('ffffffff-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000001', 'SPAM') $$,
  'P0002', 'MEMBER_NOT_FOUND', 'the blocked member cannot report the blocker (they cannot see them)');
select lives_ok($$ select public.unblock_user('ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002') $$,
  'Musu unblocks Comfort');
select ok(public.can_view_profile('ffffffff-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000001'),
  'after unblocking they see each other again');
select is(public.member_profile_for_viewer('ffffffff-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000001') ->> 'display_name',
  'Musu', 'the profile view returns the public profile');
select ok(not (public.member_profile_for_viewer('ffffffff-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000001')
  ?| array['date_of_birth', 'phone', 'storage_path', 'status']), 'the profile view has no date of birth, phone, path or account status');
select is(public.member_profile_for_viewer('ffffffff-0000-0000-0000-000000000006', 'ffffffff-0000-0000-0000-000000000001'), null,
  'a PENDING member cannot view profiles');
select throws_ok($$ select public.submit_report('ffffffff-0000-0000-0000-000000000006', 'ffffffff-0000-0000-0000-000000000001', 'UNDER_18') $$,
  '42501', 'ACCOUNT_CANNOT_ACT', 'only verified ACTIVE members can report (no unverified sockpuppets)');
select lives_ok($$ select public.block_user('ffffffff-0000-0000-0000-000000000006', 'ffffffff-0000-0000-0000-000000000001') $$,
  'BR-24: any member account can block, even one that cannot see the other');
select is((select target_visible from public.blocks where blocker_id = 'ffffffff-0000-0000-0000-000000000006'), false,
  'the block records that the target was not visible');

-- ---------------------------------------------------------------------------
-- Reports: categories, priority and automatic actions
-- ---------------------------------------------------------------------------
-- BR-32: an under-18 report hides the member at once.
insert into rx select 'u18', public.submit_report('ffffffff-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000004',
  'UNDER_18', '  Looks very young.  ');
select is((select priority::text from public.reports where id = (select id from rx where n = 'u18')), 'HIGH', 'UNDER_18 is HIGH priority');
select is((select description from public.reports where id = (select id from rx where n = 'u18')), 'Looks very young.',
  'the optional details are trimmed');
select is((select hidden_reason from public.users where id = 'ffffffff-0000-0000-0000-000000000004'), 'UNDER_18_REPORT',
  'BR-32: one under-18 report hides the member immediately');
select ok(not public.can_view_profile('ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000004'),
  'BR-32: the hidden member is out of discovery');
select ok(public.can_view_profile('ffffffff-0000-0000-0000-000000000004', 'ffffffff-0000-0000-0000-000000000004'),
  'the hidden member still sees their own profile');
select is((select status::text from public.users where id = 'ffffffff-0000-0000-0000-000000000004'), 'ACTIVE',
  'auto-hide is not a ban or suspension');
select ok(not public.can_view_profile('ffffffff-0000-0000-0000-000000000004', 'ffffffff-0000-0000-0000-000000000001'),
  'BR-32: while hidden, the member cannot browse others either');
select lives_ok($$ select public.block_user('ffffffff-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000004') $$,
  'BR-24: the reporter can still block the member their report just hid ("Also block")');
select lives_ok($$ select public.block_user('ffffffff-0000-0000-0000-000000000007', 'ffffffff-0000-0000-0000-000000000004') $$,
  'another member blocks the hidden member');
select throws_ok($$ select public.submit_report('ffffffff-0000-0000-0000-000000000007', 'ffffffff-0000-0000-0000-000000000004', 'SPAM') $$,
  'P0002', 'MEMBER_NOT_FOUND', 'but a block made while the member was invisible does not open a way to report them');

-- BR-33: HIGH reports from distinct reporters within 24 h reach the threshold (DEV-ONLY 3).
select public.submit_report('ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000005', 'SELLING_SEX');
select public.submit_report('ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000005', 'MONEY_SCAM');
select public.submit_report('ffffffff-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000005', 'THREATS_HARASSMENT');
select is((select hidden_reason from public.users where id = 'ffffffff-0000-0000-0000-000000000005'), null,
  'BR-33: two distinct reporters are below the threshold (repeat reports by one member do not count twice)');
insert into rx select 'fatu3', public.submit_report('ffffffff-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000005', 'SELLING_SEX');
select is((select hidden_reason from public.users where id = 'ffffffff-0000-0000-0000-000000000005'), 'REPORT_THRESHOLD',
  'BR-33: the third distinct reporter auto-hides the member');
select is((select count(*)::int from public.moderation_flags where entity_type = 'USER'
  and entity_id = 'ffffffff-0000-0000-0000-000000000005' and reason = 'MANY_REPORTS' and status = 'OPEN'), 1,
  '§17: many reports raise one MANY_REPORTS flag');

-- LOW categories flag at the threshold but never hide.
select public.submit_report('ffffffff-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000002', 'SPAM');
select public.submit_report('ffffffff-0000-0000-0000-000000000007', 'ffffffff-0000-0000-0000-000000000002', 'OTHER');
select is((select hidden_reason from public.users where id = 'ffffffff-0000-0000-0000-000000000002'), null,
  'BR-33: LOW-priority reports never auto-hide');
select is((select count(*)::int from public.moderation_flags where entity_id = 'ffffffff-0000-0000-0000-000000000002'
  and reason = 'MANY_REPORTS'), 1, 'but three reporters of any category raise the MANY_REPORTS flag');
select throws_ok($$ select public.submit_report('ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002', 'SPAM') $$,
  '22023', 'ALREADY_REPORTED', 'one open report per reporter, member and category');
select public.raise_flag('USER', 'ffffffff-0000-0000-0000-000000000002', 'MANY_REPORTS');
select is((select count(*)::int from public.moderation_flags where entity_id = 'ffffffff-0000-0000-0000-000000000002'
  and reason = 'MANY_REPORTS'), 1, 'repeated signals do not flood the flags queue');

-- Inappropriate photo: that photo is hidden pending review.
select throws_ok($$ select public.submit_report('ffffffff-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000001', 'INAPPROPRIATE_PHOTO') $$,
  '22023', 'PHOTO_REQUIRED', 'an inappropriate-photo report names the photo');
select throws_ok($$ select public.submit_report('ffffffff-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000001', 'INAPPROPRIATE_PHOTO', null,
  (select id from pp where user_id = 'ffffffff-0000-0000-0000-000000000002' and sort_order = 0)) $$,
  '22023', 'PHOTO_REQUIRED', 'the photo must belong to the reported member');
insert into rx select 'photo', public.submit_report('ffffffff-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000001',
  'INAPPROPRIATE_PHOTO', null, (select id from pp where user_id = 'ffffffff-0000-0000-0000-000000000001' and sort_order = 1));
select is((select status::text from public.profile_photos where id = (select id from pp where user_id = 'ffffffff-0000-0000-0000-000000000001' and sort_order = 1)),
  'HIDDEN', '§17: the reported photo is hidden pending review');
select is((select count(*)::int from public.photos_for_viewer('ffffffff-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000001')), 2,
  'other members no longer see it');
select is((select priority::text from public.reports where id = (select id from rx where n = 'photo')), 'MEDIUM', 'INAPPROPRIATE_PHOTO is MEDIUM priority');
insert into rx select 'mainphoto', public.submit_report('ffffffff-0000-0000-0000-000000000007', 'ffffffff-0000-0000-0000-000000000001',
  'INAPPROPRIATE_PHOTO', null, (select id from pp where user_id = 'ffffffff-0000-0000-0000-000000000001' and sort_order = 0));
select is((select count(*)::int from public.profile_photos where user_id = 'ffffffff-0000-0000-0000-000000000001' and status = 'PENDING_REVIEW'), 0,
  'hiding the main photo pulls no other photo back into review');
select public.renumber_photos('ffffffff-0000-0000-0000-000000000001');
select ok((select is_primary from public.profile_photos where id = (select id from pp where user_id = 'ffffffff-0000-0000-0000-000000000001' and sort_order = 0))
  and not exists (select 1 from public.profile_photos where user_id = 'ffffffff-0000-0000-0000-000000000001' and status = 'PENDING_REVIEW'),
  'later photo changes keep the reported main photo as main until staff decide');
select throws_ok($$ select public.delete_photo('ffffffff-0000-0000-0000-000000000001',
  (select id from pp where user_id = 'ffffffff-0000-0000-0000-000000000001' and sort_order = 0)) $$,
  '22023', 'PHOTO_UNDER_REVIEW', 'a reported photo cannot be deleted before staff decide (evidence)');

select throws_ok($$ select public.submit_report('ffffffff-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000001', 'OTHER', repeat('x', 501)) $$,
  '22023', 'DESCRIPTION_TOO_LONG', 'details are limited to 500 characters');
select throws_ok($$ select public.submit_report('ffffffff-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000003', 'OTHER') $$,
  'P0002', 'MEMBER_NOT_FOUND', 'members cannot report themselves');
update public.app_settings set value = '1'::jsonb where key = 'reports.per_user_per_day';
select throws_ok($$ select public.submit_report('ffffffff-0000-0000-0000-000000000007', 'ffffffff-0000-0000-0000-000000000003', 'OTHER') $$,
  '22023', 'RATE_LIMITED', 'reports per member per day are limited (T-19)');
update public.app_settings set value = '30'::jsonb where key = 'reports.per_user_per_day';

-- ---------------------------------------------------------------------------
-- Staff: reports queue, notes, resolve (BR-34)
-- ---------------------------------------------------------------------------
create temp table er as select id from public.reports
  where reported_user_id = 'ffffffff-0000-0000-0000-000000000005' and status = 'OPEN';
grant select on er to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'mod'), true);
select is((select priority::text from public.staff_reports_queue() limit 1), 'HIGH', 'the queue is sorted by priority');
select ok(not (public.staff_report_detail((select id from rx where n = 'u18')) ?| array['storage_path', 'phone', 'reporter_id']),
  'the report detail has no storage path, phone or reporter identity');
select is(public.staff_report_detail((select id from rx where n = 'u18')) ->> 'description', 'Looks very young.',
  'staff read the details the reporter gave');
select lives_ok($$ select public.add_report_note((select id from rx where n = 'u18'), 'Checked photos; adult.') $$, 'moderator adds an internal note');
select is(jsonb_array_length(public.staff_report_detail((select id from rx where n = 'u18')) -> 'notes'), 1, 'the note is on the report');
select lives_ok($$ select public.resolve_report((select id from rx where n = 'u18'), true, true) $$,
  'moderator dismisses the under-18 report and restores visibility');
select throws_ok($$ select public.resolve_report((select id from rx where n = 'u18'), true) $$, 'P0002', 'REPORT_NOT_OPEN',
  'a closed report cannot be closed again');
select throws_ok($$ select public.resolve_report((select id from rx where n = 'fatu3'), false, true) $$, '22023', 'HIGH_REPORTS_OPEN',
  'visibility is not restored while other HIGH reports about the member are open');
select lives_ok($$ select public.resolve_report((select id from rx where n = 'photo'), true) $$,
  'dismissing the photo report puts the photo back');
select lives_ok($$ select public.resolve_report((select id from rx where n = 'mainphoto'), false, false, 'NUDITY_OR_SEXUAL') $$,
  'resolving the main-photo report rejects that photo');
select throws_ok($$ select public.unhide_member('ffffffff-0000-0000-0000-000000000005') $$, '22023', 'HIGH_REPORTS_OPEN',
  'a member stays hidden while HIGH reports about them are open');
select lives_ok($$ select public.resolve_report(id, true) from er $$, 'moderator dismisses every report about Fatu');
select throws_ok($$ select public.unhide_member('ffffffff-0000-0000-0000-000000000004') $$, '22023', 'NOT_HIDDEN',
  'unhide applies only to hidden members');
select lives_ok($$ select public.unhide_member('ffffffff-0000-0000-0000-000000000005') $$, 'and makes her visible again');
reset role;
select set_config('request.jwt.claims', '', true);

select is((select hidden_reason from public.users where id = 'ffffffff-0000-0000-0000-000000000004'), null,
  'BR-32: the member is visible again after review');
select is((select metadata ->> 'visibility_restored' from public.audit_logs where action = 'REPORT_RESOLVED'
  and entity_id = (select id::text from rx where n = 'u18')), 'true', 'BR-34: the decision is audited');
select is((select status::text from public.reports where id = (select id from rx where n = 'u18')), 'DISMISSED', 'the report is DISMISSED');
select is((select status::text from public.profile_photos where id = (select id from pp where user_id = 'ffffffff-0000-0000-0000-000000000001' and sort_order = 1)),
  'PENDING_REVIEW', 'the photo was put back, and once the main photo was rejected it became the main photo and goes to a main-photo check (§11)');
select is((select metadata ->> 'photo_decision' from public.audit_logs where action = 'REPORT_RESOLVED'
  and entity_id = (select id::text from rx where n = 'mainphoto')), 'REJECTED', 'BR-34: the photo decision is audited');
select is((select rejection_reason::text from public.profile_photos where id = (select id from pp where user_id = 'ffffffff-0000-0000-0000-000000000001' and sort_order = 0)),
  'NUDITY_OR_SEXUAL', 'the rejected photo keeps its reason');
select is((select metadata ->> 'hidden_reason' from public.audit_logs where action = 'USER_RESTORED'
  and entity_id = 'ffffffff-0000-0000-0000-000000000005'), 'REPORT_THRESHOLD', 'BR-34: unhiding is audited');
select public.submit_report('ffffffff-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000005', 'SELLING_SEX');
select is((select hidden_reason from public.users where id = 'ffffffff-0000-0000-0000-000000000005'), null,
  'BR-33: dismissed reports never count toward the threshold again');

-- ---------------------------------------------------------------------------
-- BR-5: suspension is an overlay that ends by itself
-- ---------------------------------------------------------------------------
select is(public.effective_account_status('PENDING', now() + interval '1 day'), 'SUSPENDED', 'BR-5: a suspended PENDING account reads SUSPENDED');
select is(public.effective_account_status('PENDING', now() - interval '1 day'), 'PENDING',
  'BR-5: when it ends, a never-verified account goes back to PENDING (not ACTIVE)');
select is(public.effective_account_status('ACTIVE', now() - interval '1 day'), 'ACTIVE', 'and an ACTIVE account back to ACTIVE');

set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'mod'), true);
select throws_ok($$ select public.suspend_user('ffffffff-0000-0000-0000-000000000002', now() - interval '1 hour') $$,
  '22023', 'INVALID_SUSPENSION_END', 'a suspension ends in the future');
select throws_ok($$ select public.suspend_user('ffffffff-0000-0000-0000-0000000000bb', now() + interval '1 day') $$,
  'P0002', 'MEMBER_NOT_FOUND', '§7: staff accounts cannot be suspended from the member tools');
select throws_ok($$ select public.suspend_user('ffffffff-0000-0000-0000-0000000000aa', now() + interval '1 day') $$,
  '42501', 'OWN_CONTENT', 'staff cannot act on their own account');
select lives_ok($$ select public.suspend_user('ffffffff-0000-0000-0000-000000000002', now() + interval '7 days', (select id from rx where n = 'u18')) $$,
  'moderator suspends Comfort for 7 days');
select throws_ok($$ select public.suspend_user('ffffffff-0000-0000-0000-000000000002', now() + interval '1 day') $$,
  '22023', 'ALREADY_SUSPENDED_LONGER', '§7: a moderator cannot shorten a suspension (only an admin lifts one)');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select public.effective_account_status(status, suspended_until)::text from public.users where id = 'ffffffff-0000-0000-0000-000000000002'),
  'SUSPENDED', 'BR-5: the account is suspended');
select ok(not public.can_view_profile('ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002'),
  'BR-5: a suspended member is out of discovery');
select is((select count(*)::int from public.audit_logs where action = 'USER_SUSPENDED'
  and entity_id = 'ffffffff-0000-0000-0000-000000000002'), 1, 'BR-34: the suspension is audited');
select ok((select not (metadata ? 'report_id') from public.audit_logs where action = 'USER_SUSPENDED'
  and entity_id = 'ffffffff-0000-0000-0000-000000000002'), 'the audit row cites a report only when it is about that member');
select throws_ok($$ select public.submit_report('ffffffff-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000003', 'SPAM') $$,
  '42501', 'ACCOUNT_CANNOT_ACT', 'BR-5: a suspended member cannot report');

-- ---------------------------------------------------------------------------
-- BR-6: ban (ADMIN only) and restore
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'mod'), true);
select throws_ok($$ select public.ban_user('ffffffff-0000-0000-0000-000000000005', 'SELLING_SEX') $$, '42501', 'ADMIN_REQUIRED',
  '§7: moderators cannot ban');
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
select throws_ok($$ select public.ban_user('ffffffff-0000-0000-0000-000000000005', 'selling sex') $$, '22023', 'REASON_REQUIRED',
  'a ban needs a reason code');
reset role;
update public.users set hidden_reason = 'UNDER_18_REPORT', hidden_at = now() where id = 'ffffffff-0000-0000-0000-000000000005';
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
select lives_ok($$ select public.ban_user('ffffffff-0000-0000-0000-000000000005', 'SELLING_SEX', (select id from rx where n = 'fatu3')) $$,
  'admin bans Fatu');
select throws_ok($$ select public.ban_user('ffffffff-0000-0000-0000-000000000005', 'SELLING_SEX') $$, '22023', 'ACCOUNT_NOT_BANNABLE',
  'banning twice is refused');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select status::text from public.users where id = 'ffffffff-0000-0000-0000-000000000005'), 'BANNED', 'BR-6: status BANNED');
select ok((select banned_until > now() from auth.users where id = 'ffffffff-0000-0000-0000-000000000005'),
  'BR-6: Supabase Auth refuses the banned account');
select ok(exists (select 1 from public.phone_blocklist where phone_hash = public.phone_hash('231770001005')),
  'BR-6: the phone number cannot register again');
select is((select metadata ->> 'reason' from public.audit_logs where action = 'USER_BANNED'
  and entity_id = 'ffffffff-0000-0000-0000-000000000005'), 'SELLING_SEX', 'BR-34: the ban is audited with its reason');
select throws_ok($$ select public.block_user('ffffffff-0000-0000-0000-000000000005', 'ffffffff-0000-0000-0000-000000000001') $$,
  '42501', 'ACCOUNT_CANNOT_ACT', 'a banned account cannot use member tools');

set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'mod'), true);
select throws_ok($$ select public.restore_user('ffffffff-0000-0000-0000-000000000005') $$, '42501', 'ADMIN_REQUIRED',
  '§7: moderators cannot restore');
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
select lives_ok($$ select public.restore_user('ffffffff-0000-0000-0000-000000000005') $$, 'admin restores Fatu');
select lives_ok($$ select public.restore_user('ffffffff-0000-0000-0000-000000000002') $$, 'admin lifts Comfort''s suspension');
select throws_ok($$ select public.restore_user('ffffffff-0000-0000-0000-000000000001') $$, '22023', 'NOTHING_TO_RESTORE',
  'restoring an account in good standing is refused');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select status::text from public.users where id = 'ffffffff-0000-0000-0000-000000000005'), 'PENDING',
  'a restored account is PENDING until it is verified again (no verification here)');
select ok(not exists (select 1 from public.phone_blocklist where phone_hash = public.phone_hash('231770001005')),
  'the phone leaves the blocklist');
select is((select hidden_reason from public.users where id = 'ffffffff-0000-0000-0000-000000000005'), 'UNDER_18_REPORT',
  'a report hide survives a ban and restore (the review is not skipped)');
select is((select metadata ->> 'from' from public.audit_logs where action = 'USER_RESTORED'
  and entity_id = 'ffffffff-0000-0000-0000-000000000002'), 'SUSPENDED', 'BR-34: lifting a suspension is logged as from SUSPENDED');
select is((select public.effective_account_status(status, suspended_until)::text from public.users where id = 'ffffffff-0000-0000-0000-000000000002'),
  'ACTIVE', 'the lifted suspension leaves Comfort ACTIVE');

-- ---------------------------------------------------------------------------
-- Flags: AGE_DOUBT (Q23) and the flags queue
-- ---------------------------------------------------------------------------
insert into public.verifications (user_id, pose_prompt, status, selfie_storage_path, submitted_at)
values ('ffffffff-0000-0000-0000-000000000006', 'Touch your left ear', 'PENDING', gen_random_uuid() || '.webp', now());
update public.verifications set status = 'REJECTED', rejection_reason = 'AGE_DOUBT', reviewed_at = now()
where user_id = 'ffffffff-0000-0000-0000-000000000006';
select is((select count(*)::int from public.moderation_flags where entity_id = 'ffffffff-0000-0000-0000-000000000006'
  and reason = 'AGE_DOUBT' and status = 'OPEN'), 1, 'Q23: a selfie rejected for doubt about age raises an AGE_DOUBT flag');

set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'mod'), true);
select ok(exists (select 1 from public.staff_flags_queue() where reason = 'AGE_DOUBT' and display_name = 'Siah'),
  'the flag is in the flags queue');
select lives_ok($$ select public.resolve_flag((select flag_id from public.staff_flags_queue() where reason = 'AGE_DOUBT'), false) $$,
  'moderator resolves the flag');
select ok(not exists (select 1 from public.staff_flags_queue() where reason = 'AGE_DOUBT'), 'it leaves the queue');
select ok((public.staff_queue_counts() ?& array['reports_open', 'reports_high', 'flags_open']), 'the dashboard counts reports and flags');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from public.audit_logs where action = 'REPORT_RESOLVED' and entity_type = 'moderation_flag'), 1,
  'BR-34: resolving a flag is audited');

delete from auth.users where id = 'ffffffff-0000-0000-0000-000000000003';
select ok(exists (select 1 from public.reports where reporter_id is null and reported_user_id = 'ffffffff-0000-0000-0000-000000000004'
  and category = 'UNDER_18'), 'reports outlive the reporter''s account (evidence is kept)');
update public.users set status = 'DELETED', deleted_at = now() where id = 'ffffffff-0000-0000-0000-000000000006';
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
-- Phase 10 (Q54): a ban still reaches an account deleted before its reports were decided, and lifting
-- it returns the account to DELETED, never back to life.
select lives_ok($$ select public.ban_user('ffffffff-0000-0000-0000-000000000006', 'SELLING_SEX') $$,
  'a deleted account can still be banned (deleting doesn''t dodge the blocklist)');
select lives_ok($$ select public.restore_user('ffffffff-0000-0000-0000-000000000006') $$, 'and the ban can be lifted');
reset role;
select is((select status::text from public.users where id = 'ffffffff-0000-0000-0000-000000000006'), 'DELETED',
  '§8: lifting the ban returns a deleted account to DELETED');
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
