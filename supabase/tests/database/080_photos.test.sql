-- Phase 3: photos, private storage and the staff photo queue (spec §11, §21, BR-8, 9, 11, 12, 34).
begin;
create extension if not exists pgtap with schema extensions;
select plan(67);

-- Fixtures: two members who finished steps 4–8, one who didn't, one moderator.
insert into auth.users (id, phone, email, aud, role) values
  ('dddddddd-0000-0000-0000-000000000001', '231770000801', null, 'authenticated', 'authenticated'),
  ('dddddddd-0000-0000-0000-000000000002', '231770000802', null, 'authenticated', 'authenticated'),
  ('dddddddd-0000-0000-0000-000000000003', '231770000803', null, 'authenticated', 'authenticated'),
  ('dddddddd-0000-0000-0000-0000000000aa', null, 'moderator@example.test', 'authenticated', 'authenticated');
insert into public.profiles (user_id, date_of_birth, display_name, gender, seeking_genders, area_id,
                             intent_relationship, intent_casual, is_profile_complete)
select u.id, '1995-05-05', u.name, 'WOMAN', array['MAN']::public.gender[],
       (select id from public.areas where name = 'Sinkor'), true, false, u.complete
from (values ('dddddddd-0000-0000-0000-000000000001'::uuid, 'Musu', true),
             ('dddddddd-0000-0000-0000-000000000002'::uuid, 'Comfort', true),
             ('dddddddd-0000-0000-0000-000000000003'::uuid, 'Hawa', false)) as u(id, name, complete);
update public.users set role = 'MODERATOR', status = 'ACTIVE' where id = 'dddddddd-0000-0000-0000-0000000000aa';

-- ---------------------------------------------------------------------------
-- Buckets and storage (spec §4, BR-11)
-- ---------------------------------------------------------------------------
select set_eq($$ select id from storage.buckets where id in ('photos-quarantine', 'photos', 'verification', 'payment-evidence') and not public $$,
  array['photos-quarantine', 'photos', 'verification', 'payment-evidence'], 'the four buckets exist and are private');
select is((select allowed_mime_types from storage.buckets where id = 'photos'), array['image/webp'],
  'stored photos are WebP only (processed by the server)');

insert into storage.objects (bucket_id, name) values ('photos', 'dddddddd-0000-0000-0000-000000000002/x.webp');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is_empty($$ select name from storage.objects where bucket_id = 'photos' $$,
  'BR-11: a member cannot list or read another member''s photo object by path');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('photos', 'dddddddd-0000-0000-0000-000000000001/y.webp') $$,
  '42501', null, 'a member cannot write into the photos bucket directly');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('photos-quarantine', 'dddddddd-0000-0000-0000-000000000001/y') $$,
  '42501', null, 'a member cannot write into quarantine without a signed upload URL');
select throws_ok($$ select id from public.profile_photos $$, '42501', null,
  'profile_photos (with storage paths) is not readable by members');
select throws_ok($$ select public.begin_photo_upload('dddddddd-0000-0000-0000-000000000001') $$, '42501', null,
  'members cannot call the upload functions directly');
select throws_ok($$ select public.photos_for_viewer('dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002') $$,
  '42501', null, 'members cannot call the photo read function directly');
set local role anon;
select is_empty($$ select name from storage.objects where bucket_id = 'photos' $$, 'anon cannot read photo objects');
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- Upload pipeline (spec §11)
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.begin_photo_upload('dddddddd-0000-0000-0000-000000000003') $$, '42501', 'PROFILE_INCOMPLETE',
  'photos come after steps 4–8');
select throws_ok($$ select public.begin_photo_upload('dddddddd-0000-0000-0000-0000000000aa') $$, '42501', null,
  '§7: staff accounts cannot hold member photos');

create temp table ph (n int, id uuid);
grant select on ph to authenticated;
insert into ph select g, public.begin_photo_upload('dddddddd-0000-0000-0000-000000000001') from generate_series(1, 6) g;
select is((select count(*)::int from public.profile_photos where user_id = 'dddddddd-0000-0000-0000-000000000001' and status = 'UPLOADING'),
  6, 'six slots reserved, each UPLOADING');
select throws_ok($$ select public.begin_photo_upload('dddddddd-0000-0000-0000-000000000001') $$, '22023', 'PHOTO_LIMIT_REACHED',
  'spec §10: at most 6 photos');

select throws_ok($$ select public.complete_photo_upload('dddddddd-0000-0000-0000-000000000001', (select id from ph where n = 1),
  'dddddddd-0000-0000-0000-000000000001/' || (select id from ph where n = 1) || '.webp') $$,
  '22023', 'INVALID_STORAGE_PATH', 'stored objects have opaque names (no user id in signed URLs)');
select throws_ok($$ select public.complete_photo_upload('dddddddd-0000-0000-0000-000000000002', (select id from ph where n = 1),
  (select id from ph where n = 1) || '.webp') $$,
  'P0002', 'PHOTO_NOT_FOUND', 'a member cannot complete another member''s upload');

select lives_ok($$ select public.complete_photo_upload('dddddddd-0000-0000-0000-000000000001', id,
  id || '.webp') from ph where n <= 4 $$, 'four uploads completed');
select is((select count(*)::int from public.profile_photos where user_id = 'dddddddd-0000-0000-0000-000000000001' and status = 'PENDING_REVIEW'),
  4, 'completed uploads wait for review (PENDING_REVIEW)');
select is((select id from public.profile_photos where user_id = 'dddddddd-0000-0000-0000-000000000001' and is_primary),
  (select id from ph where n = 1), 'the first photo is the main photo');
select lives_ok($$ select public.abort_photo_upload('dddddddd-0000-0000-0000-000000000001', id) from ph where n in (5, 6) $$,
  'failed uploads free their slots');
select is((select count(*)::int from public.profile_photos where user_id = 'dddddddd-0000-0000-0000-000000000001'), 4,
  'aborted rows are gone');
select is((public.onboarding_progress_for('dddddddd-0000-0000-0000-000000000001') ->> 'photos_done')::boolean, true,
  'photos step done with 3+ photos uploaded');

-- Stale UPLOADING rows (closed tab) free their slot after an hour.
insert into public.profile_photos (user_id, status, created_at) values
  ('dddddddd-0000-0000-0000-000000000002', 'UPLOADING', now() - interval '2 hours');
select lives_ok($$ select public.begin_photo_upload('dddddddd-0000-0000-0000-000000000002') $$, 'new upload reserved');
select is((select count(*)::int from public.profile_photos where user_id = 'dddddddd-0000-0000-0000-000000000002'), 1,
  'the abandoned upload was cleared');

-- ---------------------------------------------------------------------------
-- Main photo, order, delete
-- ---------------------------------------------------------------------------
select lives_ok($$ select public.set_primary_photo('dddddddd-0000-0000-0000-000000000001', (select id from ph where n = 3)) $$,
  'a photo can be made the main photo');
select is((select array_agg(p.n order by pp.sort_order) from public.profile_photos pp join ph p on p.id = pp.id
  where pp.status <> 'DELETED'), array[3, 1, 2, 4], 'it moves to the front; the rest keep their order');
select is((select id from public.profile_photos where user_id = 'dddddddd-0000-0000-0000-000000000001' and is_primary),
  (select id from ph where n = 3), 'and it is the main photo');

select is(public.delete_photo('dddddddd-0000-0000-0000-000000000001', (select id from ph where n = 3)),
  (select id from ph where n = 3) || '.webp',
  'delete returns the stored path so the server removes the object');
select is((select status::text || coalesce(storage_path, '-') from public.profile_photos where id = (select id from ph where n = 3)),
  'DELETED-', 'the row is DELETED and keeps no path');
select is((select id from public.profile_photos where user_id = 'dddddddd-0000-0000-0000-000000000001' and is_primary),
  (select id from ph where n = 1), 'deleting the main photo promotes the next one');
select throws_ok($$ select public.delete_photo('dddddddd-0000-0000-0000-000000000002', (select id from ph where n = 1)) $$,
  'P0002', 'PHOTO_NOT_FOUND', 'a member cannot delete another member''s photo');
select is((public.onboarding_progress_for('dddddddd-0000-0000-0000-000000000001') ->> 'photos_done')::boolean, true,
  'three photos left: step still done');

-- ---------------------------------------------------------------------------
-- Staff queue and decisions (spec §21, BR-34)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$ select * from public.staff_photo_queue() $$, '42501', 'NOT_STAFF', 'a member cannot open the photo queue');
select throws_ok($$ select public.review_photo((select id from ph where n = 1), true) $$, '42501', 'NOT_STAFF',
  'a member cannot approve photos');
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-0000000000aa","role":"authenticated","aal":"aal1"}', true);
select throws_ok($$ select * from public.staff_photo_queue() $$, '42501', 'NOT_STAFF',
  '§7: staff without an MFA (aal2) session are refused');
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-0000000000aa","role":"authenticated","aal":"aal2","amr":[{"method":"otp","timestamp":1},{"method":"totp","timestamp":2}]}', true);
select throws_ok($$ select * from public.staff_photo_queue() $$, '42501', 'NOT_STAFF',
  '§7: a session opened by email link (no password) is refused even with TOTP');
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-0000000000aa","role":"authenticated","aal":"aal2","amr":[{"method":"password","timestamp":1},{"method":"totp","timestamp":2}]}', true);
select is((select count(*)::int from public.staff_photo_queue() where user_id = 'dddddddd-0000-0000-0000-000000000001'), 3,
  'moderator sees the member''s pending photos');
select ok(not exists (select 1 from information_schema.routines r
  join information_schema.parameters p on p.specific_name = r.specific_name
  where r.routine_schema = 'public' and r.routine_name = 'staff_photo_queue' and p.parameter_name = 'storage_path'),
  'the queue never returns storage paths');
select throws_ok($$ select public.review_photo((select id from ph where n = 1), false) $$, '22023', 'REASON_REQUIRED',
  'spec §11: rejecting needs a reason');
select lives_ok($$ select public.review_photo((select id from ph where n = 1), true) $$, 'moderator approves a photo');
select lives_ok($$ select public.review_photo((select id from ph where n = 2), false, 'TEXT_OR_CONTACT') $$,
  'moderator rejects a photo with a reason');
select throws_ok($$ select public.review_photo((select id from ph where n = 1), false, 'POOR_QUALITY') $$, 'P0002', 'PHOTO_NOT_PENDING',
  'a decided photo cannot be decided again');
select is((select count(*)::int from public.staff_photo_queue() where user_id = 'dddddddd-0000-0000-0000-000000000001'), 1,
  'one of the member''s photos still pending');
select ok((select (staff_queue_counts() ->> 'photos_pending')::int) >= 1, 'queue count includes it');
reset role;
select set_config('request.jwt.claims', '', true);

select is((select array_agg(action::text order by action::text) from public.audit_logs
  where actor_id = 'dddddddd-0000-0000-0000-0000000000aa' and entity_type = 'profile_photo'),
  array['PHOTO_APPROVED', 'PHOTO_REJECTED'], 'BR-34: each decision is audit-logged');
select is((select metadata ->> 'reason' from public.audit_logs where action = 'PHOTO_REJECTED'
  and actor_id = 'dddddddd-0000-0000-0000-0000000000aa'), 'TEXT_OR_CONTACT', 'the audit row records the reason, no path');
select is((select status::text || '|' || rejection_reason::text from public.profile_photos where id = (select id from ph where n = 2)),
  'REJECTED|TEXT_OR_CONTACT', 'rejected photo keeps its reason for the member');
select is((public.onboarding_progress_for('dddddddd-0000-0000-0000-000000000001') ->> 'photos_done')::boolean, false,
  'BR-9: a rejected photo no longer counts toward the 3');
select is((select count(*)::int from public.review_photo_paths(array[(select id from ph where n = 1), (select id from ph where n = 4)])), 1,
  'review paths are only given for photos still waiting for review');

-- ---------------------------------------------------------------------------
-- Who sees whose photos (spec §11, OD-3 = A, BR-9, BR-11)
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.photos_for_viewer('dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001')),
  3, 'the owner sees all their own photos (approved, rejected, pending)');
select is((select count(*)::int from public.photos_for_viewer('dddddddd-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001')),
  0, 'BR-11: a member who is not ACTIVE sees nothing');
update public.users set status = 'ACTIVE' where id in ('dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002');
select is((select array_agg(status::text) from public.photos_for_viewer('dddddddd-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001')),
  array['APPROVED'], 'BR-9: another ACTIVE member sees APPROVED photos only');
select is((select count(*)::int from public.photos_for_viewer('dddddddd-0000-0000-0000-0000000000aa', 'dddddddd-0000-0000-0000-000000000001')),
  0, 'staff accounts do not browse member photos outside the queue');

-- ---------------------------------------------------------------------------
-- Main photo rules (spec §11: the main photo shows the face; a rejected photo is never main)
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.set_primary_photo('dddddddd-0000-0000-0000-000000000001', (select id from ph where n = 2)) $$,
  'P0002', 'PHOTO_NOT_FOUND', 'a rejected photo cannot be made the main photo');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-0000000000aa","role":"authenticated","aal":"aal2","amr":[{"method":"password","timestamp":1},{"method":"totp","timestamp":2}]}', true);
select lives_ok($$ select public.review_photo((select id from ph where n = 4), true) $$, 'a secondary photo is approved');
reset role;
select set_config('request.jwt.claims', '', true);
select lives_ok($$ select public.set_primary_photo('dddddddd-0000-0000-0000-000000000001', (select id from ph where n = 4)) $$,
  'the member makes it the main photo');
select is((select status::text || '|' || is_primary from public.profile_photos where id = (select id from ph where n = 4)),
  'PENDING_REVIEW|true', '§11: a photo approved as secondary is checked again before it is the main photo');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-0000000000aa","role":"authenticated","aal":"aal2","amr":[{"method":"password","timestamp":1},{"method":"totp","timestamp":2}]}', true);
select lives_ok($$ select public.review_photo((select id from ph where n = 4), false, 'FACE_NOT_CLEAR') $$,
  'moderator rejects it as a main photo');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select id from public.profile_photos where user_id = 'dddddddd-0000-0000-0000-000000000001' and is_primary),
  (select id from ph where n = 1), 'a rejected main photo stops being main; the approved one returns');
select is((select status::text from public.profile_photos where id = (select id from ph where n = 1)), 'APPROVED',
  'a photo approved as the main photo stays approved when it becomes main again');

-- Own content, double processing, rate limits
insert into public.profile_photos (id, user_id, status, storage_path, submitted_at) values
  ('dddddddd-0000-0000-0000-00000000f0f0', 'dddddddd-0000-0000-0000-0000000000aa', 'PENDING_REVIEW', 'x.webp', now());
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-0000000000aa","role":"authenticated","aal":"aal2","amr":[{"method":"password","timestamp":1},{"method":"totp","timestamp":2}]}', true);
select throws_ok($$ select public.review_photo('dddddddd-0000-0000-0000-00000000f0f0', true) $$, '42501', 'OWN_CONTENT',
  'staff never decide on their own content');
reset role;
select set_config('request.jwt.claims', '', true);

create temp table up as select public.begin_photo_upload('dddddddd-0000-0000-0000-000000000002') as id;
select ok(public.claim_photo_upload('dddddddd-0000-0000-0000-000000000002', (select id from up)), 'first finish claims the upload');
select ok(not public.claim_photo_upload('dddddddd-0000-0000-0000-000000000002', (select id from up)),
  'a second finish for the same upload is refused (no double processing)');
update public.app_settings set value = '0'::jsonb where key = 'photos.max_uploads_per_hour';
select throws_ok($$ select public.begin_photo_upload('dddddddd-0000-0000-0000-000000000002') $$, '22023', 'RATE_LIMITED',
  'uploads are rate limited per member');
update public.app_settings set value = '2'::jsonb where key = 'staff_login.max_per_account_per_hour';
update public.app_settings set value = '1000'::jsonb where key = 'staff_login.max_per_ip_per_hour';
select is(array[public.staff_sign_in_allowed('198.51.100.7', 'Mod@Example.test'),
                public.staff_sign_in_allowed('198.51.100.8', 'mod@example.test'),
                public.staff_sign_in_allowed('198.51.100.9', 'mod@example.test')],
  array[true, true, false], 'staff sign-in attempts are limited per account, whatever the IP or letter case');

-- ---------------------------------------------------------------------------
-- First SUPER_ADMIN (T-07)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('dddddddd-0000-0000-0000-0000000000bb', 'owner@example.test', 'authenticated', 'authenticated');
select throws_ok($$ select public.bootstrap_super_admin('dddddddd-0000-0000-0000-000000000001') $$, '22023', 'NOT_A_FRESH_STAFF_ACCOUNT',
  'a member account can never become the first admin');
select lives_ok($$ select public.bootstrap_super_admin('dddddddd-0000-0000-0000-0000000000bb') $$, 'first SUPER_ADMIN created');
select throws_ok($$ select public.bootstrap_super_admin('dddddddd-0000-0000-0000-0000000000aa') $$, '42501', 'SUPER_ADMIN_EXISTS',
  'the bootstrap works once only');

select * from finish();
rollback;
