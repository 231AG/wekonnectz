-- Phase 4: verification, account state and notifications (spec §8, §9, §21; BR-10, 13, 14, 15, 34).
begin;
create extension if not exists pgtap with schema extensions;
select plan(63);

-- Fixtures: two members who finished steps 4–9 (3 photos in review), one who hasn't added photos,
-- a moderator and an admin.
insert into auth.users (id, phone, email, aud, role) values
  ('eeeeeeee-0000-0000-0000-000000000001', '231770000901', null, 'authenticated', 'authenticated'),
  ('eeeeeeee-0000-0000-0000-000000000002', '231770000902', null, 'authenticated', 'authenticated'),
  ('eeeeeeee-0000-0000-0000-000000000003', '231770000903', null, 'authenticated', 'authenticated'),
  ('eeeeeeee-0000-0000-0000-0000000000aa', null, 'mod-090@example.test', 'authenticated', 'authenticated'),
  ('eeeeeeee-0000-0000-0000-0000000000bb', null, 'admin-090@example.test', 'authenticated', 'authenticated');
insert into public.profiles (user_id, date_of_birth, display_name, gender, seeking_genders, area_id,
                             intent_relationship, intent_casual, is_profile_complete)
select u.id, '1996-02-02', u.name, 'WOMAN', array['MAN']::public.gender[],
       (select id from public.areas where name = 'Sinkor'), true, false, true
from (values ('eeeeeeee-0000-0000-0000-000000000001'::uuid, 'Musu'),
             ('eeeeeeee-0000-0000-0000-000000000002'::uuid, 'Comfort'),
             ('eeeeeeee-0000-0000-0000-000000000003'::uuid, 'Hawa')) as u(id, name);
insert into public.profile_photos (user_id, status, storage_path, sort_order, is_primary, submitted_at)
select u, 'PENDING_REVIEW', gen_random_uuid() || '.webp', n, n = 0, now()
from unnest(array['eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002']::uuid[]) as u,
     generate_series(0, 2) as n;
update public.users set role = 'MODERATOR', status = 'ACTIVE' where id = 'eeeeeeee-0000-0000-0000-0000000000aa';
update public.users set role = 'ADMIN', status = 'ACTIVE' where id = 'eeeeeeee-0000-0000-0000-0000000000bb';

create temp table pp as select id, user_id, sort_order from public.profile_photos
  where user_id in ('eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002');
grant select on pp to authenticated;
create temp table vx (n text primary key, id uuid, pose text);
grant select on vx to authenticated;
create temp table claims (who text primary key, c text);
grant select on claims to authenticated;
insert into claims values
  ('mod', '{"sub":"eeeeeeee-0000-0000-0000-0000000000aa","role":"authenticated","aal":"aal2","amr":[{"method":"password","timestamp":1},{"method":"totp","timestamp":2}]}'),
  ('admin', '{"sub":"eeeeeeee-0000-0000-0000-0000000000bb","role":"authenticated","aal":"aal2","amr":[{"method":"password","timestamp":1},{"method":"totp","timestamp":2}]}'),
  ('member', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1","amr":[{"method":"otp","timestamp":1}]}');

-- ---------------------------------------------------------------------------
-- BR-10: selfies are private
-- ---------------------------------------------------------------------------
select is((select public from storage.buckets where id = 'verification'), false, 'BR-10: the verification bucket is private');
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'member'), true);
select throws_ok($$ select id from public.verifications $$, '42501', null,
  'BR-10: members cannot read the verifications table (selfie paths)');
select throws_ok($$ select * from public.start_verification('eeeeeeee-0000-0000-0000-000000000001') $$, '42501', null,
  'members cannot call the verification functions directly');
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- Starting: after photos, members only, server-chosen pose
-- ---------------------------------------------------------------------------
select throws_ok($$ select * from public.start_verification('eeeeeeee-0000-0000-0000-000000000003') $$, '42501', 'PHOTOS_REQUIRED',
  'verification comes after the photos step');
select throws_ok($$ select * from public.start_verification('eeeeeeee-0000-0000-0000-0000000000aa') $$, '42501', null,
  '§7: staff accounts are never verified as members');

insert into vx select 'a', verification_id, pose_prompt from public.start_verification('eeeeeeee-0000-0000-0000-000000000001');
select ok((select pose from vx where n = 'a') in (select jsonb_array_elements_text(public.get_setting('verification.pose_prompts'))),
  'the pose comes from the server''s list');
select is((select verification_id from public.start_verification('eeeeeeee-0000-0000-0000-000000000001')), (select id from vx where n = 'a'),
  'starting again returns the same open capture (no re-rolling the pose)');
select is((select pose_prompt from public.start_verification('eeeeeeee-0000-0000-0000-000000000001')), (select pose from vx where n = 'a'),
  'with the same pose');
select is(public.latest_verification_status('eeeeeeee-0000-0000-0000-000000000001'), 'NOT_STARTED',
  'an unsubmitted capture still reads as NOT_STARTED');

-- ---------------------------------------------------------------------------
-- Submitting
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.submit_verification('eeeeeeee-0000-0000-0000-000000000001', (select id from vx where n = 'a'),
  (select id from vx where n = 'a') || '.webp') $$, 'P0002', 'VERIFICATION_NOT_FOUND', 'a selfie must be claimed (processed) before it is submitted');
select ok(public.claim_verification_selfie('eeeeeeee-0000-0000-0000-000000000001', (select id from vx where n = 'a')), 'the server claims the capture');
select ok(not public.claim_verification_selfie('eeeeeeee-0000-0000-0000-000000000001', (select id from vx where n = 'a')),
  'a second submit for the same capture is refused');
select ok(not public.claim_verification_selfie('eeeeeeee-0000-0000-0000-000000000002', (select id from vx where n = 'a')),
  'another member cannot claim it');
select throws_ok($$ select public.submit_verification('eeeeeeee-0000-0000-0000-000000000001', (select id from vx where n = 'a'), 'x/y.webp') $$,
  '22023', 'INVALID_STORAGE_PATH', 'the stored selfie path is fixed by the server');
select lives_ok($$ select public.submit_verification('eeeeeeee-0000-0000-0000-000000000001', (select id from vx where n = 'a'),
  (select id from vx where n = 'a') || '.webp') $$, 'selfie submitted');
select is(public.onboarding_progress_for('eeeeeeee-0000-0000-0000-000000000001') ->> 'verification', 'PENDING',
  'progress shows the verification as PENDING');
select throws_ok($$ select * from public.start_verification('eeeeeeee-0000-0000-0000-000000000001') $$, '22023', 'ALREADY_SUBMITTED',
  'no second selfie while one is waiting for review');
select is((select escalated from public.verifications where id = (select id from vx where n = 'a')), false, 'a first selfie is not escalated');

-- ---------------------------------------------------------------------------
-- Staff queue, selfie views (BR-34), decisions
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'member'), true);
select throws_ok($$ select * from public.staff_verification_queue() $$, '42501', 'NOT_STAFF', 'members cannot open the verification queue');
select throws_ok($$ select public.log_selfie_view((select id from vx where n = 'a')) $$, '42501', 'NOT_STAFF', 'members cannot view selfies');
select set_config('request.jwt.claims', (select c from claims where who = 'mod'), true);
select is((select count(*)::int from public.staff_verification_queue() where verification_id = (select id from vx where n = 'a')), 1,
  'the moderator sees the submission in the queue');
select is((public.staff_verification_detail((select id from vx where n = 'a')) ->> 'pose_prompt'), (select pose from vx where n = 'a'),
  'the detail shows the pose the member was given');
select ok(not (public.staff_verification_detail((select id from vx where n = 'a')) ?| array['selfie_storage_path', 'storage_path']),
  'the detail never contains a storage path');
select lives_ok($$ select public.log_selfie_view((select id from vx where n = 'a')) $$, 'viewing the selfie is logged');
select lives_ok($$ select public.log_selfie_view((select id from vx where n = 'a')) $$, 'and logged again on every view');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from public.audit_logs where action = 'SELFIE_VIEWED' and entity_id = (select id::text from vx where n = 'a')
  and actor_id = 'eeeeeeee-0000-0000-0000-0000000000aa'), 2, 'BR-34: one SELFIE_VIEWED audit row per view');
select is((select count(*)::int from public.verification_review_paths((select id from vx where n = 'a'))), 4,
  'the server gets the selfie and the 3 photos to show side by side');

set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'mod'), true);
select throws_ok($$ select public.review_verification((select id from vx where n = 'a'), false) $$, '22023', 'REASON_REQUIRED',
  'rejecting needs a reason');
select lives_ok($$ select public.review_verification((select id from vx where n = 'a'), false, 'NOT_SAME_PERSON') $$,
  'moderator rejects the selfie');
select throws_ok($$ select public.review_verification((select id from vx where n = 'a'), true) $$, 'P0002', 'VERIFICATION_NOT_PENDING',
  'a decided verification cannot be decided again');
reset role;
select set_config('request.jwt.claims', '', true);

select is((select metadata ->> 'reason' from public.audit_logs where action = 'VERIFICATION_REJECTED'
  and entity_id = (select id::text from vx where n = 'a')), 'NOT_SAME_PERSON', 'BR-34: the rejection is audited with its reason');
select is((select type::text from public.notifications where user_id = 'eeeeeeee-0000-0000-0000-000000000001'
  order by created_at desc limit 1), 'VERIFICATION_REJECTED', 'the member is notified');
select is(public.latest_verification_status('eeeeeeee-0000-0000-0000-000000000001'), 'REJECTED', 'BR-15: status REJECTED');
select is((select status::text from public.users where id = 'eeeeeeee-0000-0000-0000-000000000001'), 'PENDING',
  'BR-15: a rejected member stays PENDING (no discovery, no availability)');

-- Resubmission; doubt about age escalates (§9).
insert into vx select 'b', verification_id, pose_prompt from public.start_verification('eeeeeeee-0000-0000-0000-000000000001');
select isnt((select id from vx where n = 'b'), (select id from vx where n = 'a'), 'a rejected member may try again (new capture)');
select public.claim_verification_selfie('eeeeeeee-0000-0000-0000-000000000001', (select id from vx where n = 'b'));
select public.submit_verification('eeeeeeee-0000-0000-0000-000000000001', (select id from vx where n = 'b'), (select id from vx where n = 'b') || '.webp');
select is((select escalated from public.verifications where id = (select id from vx where n = 'b')), false,
  'one earlier rejection is below the escalation threshold');
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'mod'), true);
select throws_ok($$ select public.review_verification((select id from vx where n = 'b'), false, 'UNCLEAR') $$, '42501', 'SELFIE_NOT_VIEWED',
  'a reviewer cannot decide a selfie they never opened');
select public.log_selfie_view((select id from vx where n = 'b'));
select lives_ok($$ select public.review_verification((select id from vx where n = 'b'), false, 'AGE_DOUBT') $$,
  'moderator rejects for doubt about age');
reset role;
select set_config('request.jwt.claims', '', true);

insert into vx select 'c', verification_id, pose_prompt from public.start_verification('eeeeeeee-0000-0000-0000-000000000001');
select public.claim_verification_selfie('eeeeeeee-0000-0000-0000-000000000001', (select id from vx where n = 'c'));
select public.submit_verification('eeeeeeee-0000-0000-0000-000000000001', (select id from vx where n = 'c'), (select id from vx where n = 'c') || '.webp');
select is((select escalated from public.verifications where id = (select id from vx where n = 'c')), true,
  '§9: after a doubt about age, the next selfie goes to an admin');
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'mod'), true);
select throws_ok($$ select public.review_verification((select id from vx where n = 'c'), true) $$, '42501', 'ADMIN_REQUIRED',
  'a moderator cannot decide an escalated verification');
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
select public.log_selfie_view((select id from vx where n = 'c'));
select lives_ok($$ select public.review_verification((select id from vx where n = 'c'), true) $$, 'an admin approves it');
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- BR-13 / spec §10: ACTIVE exactly when VERIFIED and 3 photos APPROVED
-- ---------------------------------------------------------------------------
select is(public.latest_verification_status('eeeeeeee-0000-0000-0000-000000000001'), 'VERIFIED', 'BR-13: verification VERIFIED');
select is((select status::text from public.users where id = 'eeeeeeee-0000-0000-0000-000000000001'), 'PENDING',
  'BR-13: verified but no photos approved yet → still PENDING');

set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'mod'), true);
select public.review_photo(id, true) from pp
  where user_id = 'eeeeeeee-0000-0000-0000-000000000001' and sort_order < 2;
reset role;
select set_config('request.jwt.claims', '', true);
-- Deferred account checks run at commit; fire them here as a commit would.
set constraints all immediate;
set constraints all deferred;
select is((select status::text from public.users where id = 'eeeeeeee-0000-0000-0000-000000000001'), 'PENDING',
  'BR-8: verified with 2 approved photos → still PENDING');

set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'mod'), true);
select public.review_photo(id, true) from pp
  where user_id = 'eeeeeeee-0000-0000-0000-000000000001' and sort_order = 2;
reset role;
select set_config('request.jwt.claims', '', true);
-- Deferred account checks run at commit; fire them here as a commit would.
set constraints all immediate;
set constraints all deferred;
select is((select status::text from public.users where id = 'eeeeeeee-0000-0000-0000-000000000001'), 'ACTIVE',
  'BR-13: the third approved photo makes a verified member ACTIVE');
select is((select count(*)::int from public.notifications where user_id = 'eeeeeeee-0000-0000-0000-000000000001' and type = 'ACCOUNT_ACTIVE'), 1,
  'the member is told the profile is live');

-- The other order: photos approved first, verification last.
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'mod'), true);
select public.review_photo(id, true) from pp where user_id = 'eeeeeeee-0000-0000-0000-000000000002' and sort_order < 2;
select public.review_photo(id, false, 'POOR_QUALITY') from pp where user_id = 'eeeeeeee-0000-0000-0000-000000000002' and sort_order = 2;
reset role;
select set_config('request.jwt.claims', '', true);
-- Deferred account checks run at commit; fire them here as a commit would.
set constraints all immediate;
set constraints all deferred;
select is((select count(*)::int from public.notifications where user_id = 'eeeeeeee-0000-0000-0000-000000000002'
  and type = 'PHOTO_REJECTED'), 1, 'a rejected photo is notified to the member');
select is(public.onboarding_progress_for('eeeeeeee-0000-0000-0000-000000000002') ->> 'photos_done', 'false',
  'with a photo rejected, the member must add another before verifying');
select throws_ok($$ select * from public.start_verification('eeeeeeee-0000-0000-0000-000000000002') $$, '42501', 'PHOTOS_REQUIRED',
  'and cannot start verification yet');

-- Members read their own notifications only.
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'member'), true);
select ok((select bool_and(user_id = 'eeeeeeee-0000-0000-0000-000000000001') from public.notifications), 'members see only their own notifications');
select lives_ok($$ select public.mark_notifications_read() $$, 'members can mark their notifications read');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from public.notifications where user_id = 'eeeeeeee-0000-0000-0000-000000000001' and read_at is null), 0,
  'all marked read');

-- ---------------------------------------------------------------------------
-- Regressions from the Phase 4 audit
-- ---------------------------------------------------------------------------
-- BR-13: rejecting a pending main photo sends the next one (approved as secondary) back to review;
-- the account is judged on the final state, so 2 approved photos never make it ACTIVE.
insert into public.profile_photos (id, user_id, status, storage_path, sort_order, is_primary, submitted_at, reviewed_as_primary) values
  ('eeeeeeee-0000-0000-0000-00000000f001', 'eeeeeeee-0000-0000-0000-000000000003', 'PENDING_REVIEW', 'f001.webp', 0, true, now(), false),
  ('eeeeeeee-0000-0000-0000-00000000f002', 'eeeeeeee-0000-0000-0000-000000000003', 'APPROVED', 'f002.webp', 1, false, now(), false),
  ('eeeeeeee-0000-0000-0000-00000000f003', 'eeeeeeee-0000-0000-0000-000000000003', 'APPROVED', 'f003.webp', 2, false, now(), false),
  ('eeeeeeee-0000-0000-0000-00000000f004', 'eeeeeeee-0000-0000-0000-000000000003', 'APPROVED', 'f004.webp', 3, false, now(), false);
insert into public.verifications (user_id, pose_prompt, status, selfie_storage_path, submitted_at, reviewed_at) values
  ('eeeeeeee-0000-0000-0000-000000000003', 'Touch your chin with one finger', 'VERIFIED', 'v3.webp', now(), now());
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'mod'), true);
select lives_ok($$ select public.review_photo('eeeeeeee-0000-0000-0000-00000000f001', false, 'FACE_NOT_CLEAR') $$,
  'moderator rejects the main photo');
reset role;
select set_config('request.jwt.claims', '', true);
-- Deferred account checks run at commit; fire them here as a commit would.
set constraints all immediate;
set constraints all deferred;
select is((select status::text from public.profile_photos where id = 'eeeeeeee-0000-0000-0000-00000000f002'), 'PENDING_REVIEW',
  'the next photo becomes main and goes back to review');
select is((select status::text from public.users where id = 'eeeeeeee-0000-0000-0000-000000000003'), 'PENDING',
  'BR-13: verified with only 2 approved photos left → stays PENDING');
select is((select metadata ->> 'requeued_photo_id' from public.audit_logs where action = 'PHOTO_REJECTED'
  and entity_id = 'eeeeeeee-0000-0000-0000-00000000f001'), 'eeeeeeee-0000-0000-0000-00000000f002',
  'BR-34: the photo sent back to review is recorded in the audit row');

-- §8: a suspended member is never made ACTIVE by an approval.
update public.users set status = 'SUSPENDED', suspended_until = now() + interval '7 days'
where id = 'eeeeeeee-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'mod'), true);
select public.review_photo('eeeeeeee-0000-0000-0000-00000000f002', true);
reset role;
select set_config('request.jwt.claims', '', true);
-- Deferred account checks run at commit; fire them here as a commit would.
set constraints all immediate;
set constraints all deferred;
select is((select status::text from public.users where id = 'eeeeeeee-0000-0000-0000-000000000003'), 'SUSPENDED',
  '§8: verified with 3 approved photos, a SUSPENDED account stays SUSPENDED');

-- §9: escalation after N rejections (threshold set to 1 here).
update public.app_settings set value = '1'::jsonb where key = 'verification.rejections_before_escalation';
insert into public.profile_photos (user_id, status, storage_path, sort_order, is_primary, submitted_at)
select 'eeeeeeee-0000-0000-0000-000000000002', 'PENDING_REVIEW', gen_random_uuid() || '.webp', 5, false, now();
insert into vx select 'd', verification_id, pose_prompt from public.start_verification('eeeeeeee-0000-0000-0000-000000000002');
select public.claim_verification_selfie('eeeeeeee-0000-0000-0000-000000000002', (select id from vx where n = 'd'));
select public.submit_verification('eeeeeeee-0000-0000-0000-000000000002', (select id from vx where n = 'd'), (select id from vx where n = 'd') || '.webp');
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'mod'), true);
select public.log_selfie_view((select id from vx where n = 'd'));
select public.review_verification((select id from vx where n = 'd'), false, 'UNCLEAR');
reset role;
select set_config('request.jwt.claims', '', true);
insert into vx select 'e', verification_id, pose_prompt from public.start_verification('eeeeeeee-0000-0000-0000-000000000002');
select public.claim_verification_selfie('eeeeeeee-0000-0000-0000-000000000002', (select id from vx where n = 'e'));
select public.submit_verification('eeeeeeee-0000-0000-0000-000000000002', (select id from vx where n = 'e'), (select id from vx where n = 'e') || '.webp');
select is((select escalated from public.verifications where id = (select id from vx where n = 'e')), true,
  '§9: after the set number of rejections, the next selfie goes to an admin');

-- Staff never review their own account.
insert into public.verifications (id, user_id, pose_prompt, status, selfie_storage_path, submitted_at) values
  ('eeeeeeee-0000-0000-0000-00000000f0aa', 'eeeeeeee-0000-0000-0000-0000000000aa', 'Touch your chin with one finger', 'PENDING', 'own.webp', now());
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'mod'), true);
select throws_ok($$ select public.log_selfie_view('eeeeeeee-0000-0000-0000-00000000f0aa') $$, '42501', 'OWN_CONTENT',
  'staff cannot open their own selfie');
select throws_ok($$ select public.review_verification('eeeeeeee-0000-0000-0000-00000000f0aa', true) $$, '42501', 'OWN_CONTENT',
  'staff cannot decide their own verification');
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- Selfie retention (OD-6)
-- ---------------------------------------------------------------------------
update public.verifications set reviewed_at = now() - interval '200 days' where id = (select id from vx where n = 'a');
select is((select array_agg(verification_id) from public.selfies_due_for_deletion()), array[(select id from vx where n = 'a')],
  'OD-6: only selfies decided longer ago than the retention period are due');
select is(public.mark_selfies_deleted(array[(select id from vx where n = 'a'), (select id from vx where n = 'c')]), 1,
  'only selfies past the retention period are marked deleted (the recent decision is kept)');
select is((select (selfie_storage_path is null and selfie_deleted_at is not null and status = 'REJECTED')
  from public.verifications where id = (select id from vx where n = 'a')), true,
  'the decision record stays; only the image reference is gone');

select * from finish();
rollback;
