-- Phase 10: admin console + account lifecycle (spec §7, §8, §21; BR-7, BR-34; OD-7, OD-13, OD-30).
begin;
create extension if not exists pgtap with schema extensions;
select plan(158);

-- Fixtures (fictional). Members: Musu (deletes her account), Joseph, Prince, Hawa. Staff: a moderator,
-- an admin, a super admin, a second admin, and a brand-new email account about to become staff.
create function pg_temp.member(p_id uuid, p_name text, p_gender text, p_seeking text) returns void language plpgsql as $$
begin
  insert into auth.users (id, phone, aud, role, created_at)
  values (p_id, '23177010' || substr(replace(p_id::text, '-', ''), 29, 4), 'authenticated', 'authenticated', now() - interval '1 day');
  insert into public.profiles (user_id, date_of_birth, display_name, gender, seeking_genders, area_id, intent_relationship, intent_casual, is_profile_complete)
  values (p_id, '1996-03-04', p_name, p_gender::public.gender, array[p_seeking]::public.gender[], (select id from public.areas where name = 'Sinkor'), true, true, true);
  insert into public.profile_photos (user_id, status, storage_path, sort_order, is_primary, reviewed_as_primary, submitted_at)
  select p_id, 'APPROVED', 'photos/' || gen_random_uuid() || '.webp', n, n = 0, n = 0, now() from generate_series(0, 2) n;
  insert into public.verifications (user_id, pose_prompt, status, selfie_storage_path, submitted_at, reviewed_at)
  values (p_id, 'Touch your ear', 'VERIFIED', 'selfies/' || gen_random_uuid() || '.webp', now(), now());
  update public.users set status = 'ACTIVE' where id = p_id;
end $$;
create function pg_temp.give_pass(p_user uuid, p_hours integer) returns uuid language plpgsql as $$
declare v_pay uuid; v_key text := 'OM9' || substr(md5(p_user::text || clock_timestamp()::text), 1, 10);
begin
  insert into public.payments (user_id, plan_id, source, provider, provider_transaction_id, transaction_key, amount, currency, status, paid_at)
  values (p_user, (select id from public.subscription_plans where code = 'MM_DAY'), 'MOBILE_MONEY', 'ORANGE_MONEY', v_key, v_key, 1.00, 'USD', 'SUCCEEDED', now())
  returning id into v_pay;
  perform set_config('wk.claim_approval', 'on', true);
  insert into public.subscriptions (user_id, plan_id, source, status, starts_at, expires_at, source_payment_id)
  values (p_user, (select id from public.subscription_plans where code = 'MM_DAY'), 'MOBILE_MONEY', 'ACTIVE', now(), now() + make_interval(hours => p_hours), v_pay);
  perform set_config('wk.claim_approval', 'off', true);
  return v_pay;
end $$;

select pg_temp.member('eeeeeeee-1000-0000-0000-000000000001', 'Musu', 'WOMAN', 'MAN');
select pg_temp.member('eeeeeeee-1000-0000-0000-000000000002', 'Joseph', 'MAN', 'WOMAN');
select pg_temp.member('eeeeeeee-1000-0000-0000-000000000003', 'Prince', 'MAN', 'WOMAN');
select pg_temp.member('eeeeeeee-1000-0000-0000-000000000004', 'Hawa', 'WOMAN', 'MAN');

insert into auth.users (id, email, aud, role, created_at) values
  ('eeeeeeee-1000-0000-0000-0000000000aa', 'mod-150@example.test', 'authenticated', 'authenticated', now() - interval '1 day'),
  ('eeeeeeee-1000-0000-0000-0000000000bb', 'admin-150@example.test', 'authenticated', 'authenticated', now() - interval '1 day'),
  ('eeeeeeee-1000-0000-0000-0000000000cc', 'super-150@example.test', 'authenticated', 'authenticated', now() - interval '1 day'),
  ('eeeeeeee-1000-0000-0000-0000000000dd', 'admin2-150@example.test', 'authenticated', 'authenticated', now() - interval '1 day'),
  ('eeeeeeee-1000-0000-0000-0000000000ee', 'new-150@example.test', 'authenticated', 'authenticated', now()),
  ('eeeeeeee-1000-0000-0000-0000000000ef', 'old-150@example.test', 'authenticated', 'authenticated', now() - interval '1 day');
update public.users set role = 'MODERATOR', status = 'ACTIVE' where id = 'eeeeeeee-1000-0000-0000-0000000000aa';
update public.users set role = 'ADMIN', status = 'ACTIVE' where id in ('eeeeeeee-1000-0000-0000-0000000000bb', 'eeeeeeee-1000-0000-0000-0000000000dd');
update public.users set role = 'SUPER_ADMIN', status = 'ACTIVE' where id = 'eeeeeeee-1000-0000-0000-0000000000cc';

create temp table claims (who text primary key, c text);
grant select on claims to authenticated;
insert into claims values
  ('member', '{"sub":"eeeeeeee-1000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}'),
  ('mod', '{"sub":"eeeeeeee-1000-0000-0000-0000000000aa","role":"authenticated","aal":"aal2","amr":[{"method":"password","timestamp":1},{"method":"totp","timestamp":2}]}'),
  ('admin', '{"sub":"eeeeeeee-1000-0000-0000-0000000000bb","role":"authenticated","aal":"aal2","amr":[{"method":"password","timestamp":1},{"method":"totp","timestamp":2}]}'),
  ('admin_nomfa', '{"sub":"eeeeeeee-1000-0000-0000-0000000000bb","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1}]}'),
  ('super', '{"sub":"eeeeeeee-1000-0000-0000-0000000000cc","role":"authenticated","aal":"aal2","amr":[{"method":"password","timestamp":1},{"method":"totp","timestamp":2}]}');

create temp table r (n text primary key, id uuid);
grant all on r to service_role, authenticated;
insert into r select 'pay_hawa', pg_temp.give_pass('eeeeeeee-1000-0000-0000-000000000004', 24);
insert into r select 'sub_hawa', id from public.subscriptions where source_payment_id = (select id from r where n = 'pay_hawa');
select pg_temp.give_pass(u, 24) from unnest(array['eeeeeeee-1000-0000-0000-000000000001', 'eeeeeeee-1000-0000-0000-000000000002']::uuid[]) u;

-- Musu: in the pool, liked Joseph, matched with Prince (with a message), sent Joseph a request; Joseph saved her.
set local role service_role;
select public.set_availability(u, null, now() + interval '4 hours')
from unnest(array['eeeeeeee-1000-0000-0000-000000000001', 'eeeeeeee-1000-0000-0000-000000000002']::uuid[]) u;
select public.like_user('eeeeeeee-1000-0000-0000-000000000001', 'eeeeeeee-1000-0000-0000-000000000002');
select public.like_user('eeeeeeee-1000-0000-0000-000000000001', 'eeeeeeee-1000-0000-0000-000000000003');
insert into r select 'conv', (public.like_user('eeeeeeee-1000-0000-0000-000000000003', 'eeeeeeee-1000-0000-0000-000000000001') ->> 'conversation_id')::uuid;
select public.send_message('eeeeeeee-1000-0000-0000-000000000001', (select id from r where n = 'conv'), 'Hello Prince');
select public.send_message_request('eeeeeeee-1000-0000-0000-000000000001', 'eeeeeeee-1000-0000-0000-000000000002', 'Hi Joseph, fancy a chat?');
select public.save_profile('eeeeeeee-1000-0000-0000-000000000002', 'eeeeeeee-1000-0000-0000-000000000001', true);
reset role;

-- ---------------------------------------------------------------------------
-- §7 permission matrix: who may call what
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'member'), true);
select throws_ok($$ select public.staff_users_search() $$, '42501', 'STAFF_ONLY', '§7: a member cannot search users');
select throws_ok($$ select public.staff_dashboard() $$, '42501', 'STAFF_ONLY', '§7: a member cannot see the dashboard');
select throws_ok($$ select public.member_delete_account('eeeeeeee-1000-0000-0000-000000000001') $$, '42501', null,
  'members cannot call member_delete_account directly (the server passes the session user)');
select throws_ok($$ select public.member_data_export('eeeeeeee-1000-0000-0000-000000000001') $$, '42501', null,
  'members cannot call member_data_export directly');
select throws_ok($$ select public.accounts_due_for_purge() $$, '42501', null, 'members cannot list accounts due for purge');

select set_config('request.jwt.claims', (select c from claims where who = 'mod'), true);
select ok((select count(*) from public.staff_users_search('Musu')) = 1, '§7: a moderator can search users');
select is((select has_access from public.staff_users_search('Musu')), null::boolean, '§7: a moderator does not see Casual access');
select ok(public.staff_user_detail('eeeeeeee-1000-0000-0000-000000000001') ->> 'display_name' = 'Musu', '§7: a moderator can open a user');
select ok(public.staff_user_detail('eeeeeeee-1000-0000-0000-000000000001') -> 'payments' = 'null'::jsonb
          and public.staff_user_detail('eeeeeeee-1000-0000-0000-000000000001') -> 'subscriptions' = 'null'::jsonb,
  '§7: a moderator does not see subscriptions or payments');
select ok(public.staff_user_detail('eeeeeeee-1000-0000-0000-000000000001') -> 'audit' = 'null'::jsonb, '§7: a moderator does not see the audit trail');
select throws_ok($$ select public.staff_dashboard() $$, '42501', 'STAFF_ONLY', '§7: dashboard figures are ADMIN (moderators see queue counts)');
select throws_ok($$ select public.staff_subscriptions() $$, '42501', 'STAFF_ONLY', '§7: a moderator cannot view subscriptions');
select throws_ok($$ select public.staff_payments() $$, '42501', 'STAFF_ONLY', '§7: a moderator cannot view payments');
select throws_ok($$ select public.staff_webhook_log() $$, '42501', 'STAFF_ONLY', '§7: a moderator cannot view the webhook log');
select throws_ok($$ select public.staff_extend_subscription((select id from r where n = 'sub_hawa'), 1, 'goodwill gesture') $$,
  '42501', 'STAFF_ONLY', '§7: a moderator cannot modify subscriptions');
select throws_ok($$ select public.staff_record_refund((select id from r where n = 'pay_hawa'), 'refund requested') $$,
  '42501', 'STAFF_ONLY', '§7: a moderator cannot issue refunds');
select throws_ok($$ select public.staff_analytics() $$, '42501', 'STAFF_ONLY', '§7: a moderator cannot see analytics');
select throws_ok($$ select public.staff_settings() $$, '42501', 'STAFF_ONLY', '§7: a moderator cannot see settings');
select throws_ok($$ select public.staff_update_setting('messages.max_per_minute', '61') $$, '42501', 'STAFF_ONLY',
  '§7: a moderator cannot change settings');
select throws_ok($$ select public.staff_audit_logs() $$, '42501', 'STAFF_ONLY', '§7: a moderator cannot read audit logs');
select throws_ok($$ select public.staff_correct_dob('eeeeeeee-1000-0000-0000-000000000004', '1996-03-05', 'typo at signup') $$,
  '42501', 'STAFF_ONLY', 'a moderator cannot correct a date of birth');
select throws_ok($$ select public.staff_list() $$, '42501', 'STAFF_ONLY', '§7: a moderator cannot manage staff');

select set_config('request.jwt.claims', (select c from claims where who = 'admin_nomfa'), true);
select throws_ok($$ select public.staff_dashboard() $$, '42501', 'STAFF_ONLY', '§7 [NEW]: an admin without MFA gets nothing');
select throws_ok($$ select public.staff_users_search() $$, '42501', 'STAFF_ONLY', '§7 [NEW]: an admin without MFA cannot search users');

select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
select ok(public.staff_dashboard() ? 'access_by_plan', '§7: an admin sees the dashboard');
select ok((public.staff_dashboard() -> 'queues') ? 'claims_pending', '§21: the dashboard includes pending claims and their age');
select ok((select has_access from public.staff_users_search('Musu')), '§7: an admin sees Casual access');
select ok(jsonb_array_length(public.staff_user_detail('eeeeeeee-1000-0000-0000-000000000004') -> 'payments') = 1,
  '§7: an admin sees a member''s payments');
select ok((select count(*) from public.staff_subscriptions()) >= 3, '§7: an admin views subscriptions');
select ok((select count(*) from public.staff_payments()) >= 3, '§7: an admin views payments');
select is((select count(*)::int from public.staff_analytics(7)), 7, '§7: an admin sees analytics, one row per day');
select ok((select count(*) from public.staff_settings()) > 30, '§7: an admin sees settings');
select throws_ok($$ select public.staff_list() $$, '42501', 'STAFF_ONLY', '§7: an admin cannot manage staff');
select throws_ok($$ select public.staff_set_role('eeeeeeee-1000-0000-0000-0000000000aa', 'ADMIN') $$, '42501', 'STAFF_ONLY',
  '§7: an admin cannot change roles');
select throws_ok($$ select public.staff_update_setting('geo.enforcement_mode', '"EVERY_SESSION"') $$, '42501', 'SUPER_ADMIN_ONLY',
  '§7: feature flags and system config are SUPER_ADMIN');
select throws_ok($$ select public.staff_update_setting('account.deletion_purge_days', '60') $$, '42501', 'SUPER_ADMIN_ONLY',
  '§7: data retention (OD-7) is SUPER_ADMIN');

select set_config('request.jwt.claims', (select c from claims where who = 'super'), true);
select ok((select count(*) from public.staff_list()) >= 4, '§7: a super admin manages staff');
select ok((select mfa from public.staff_list() where email = 'super-150@example.test') is not null, 'the staff list shows MFA status');
select ok(public.staff_dashboard() ? 'users', '§7: a super admin has every admin view');
reset role;
select set_config('request.jwt.claims', '', true);

-- The server key cannot call staff functions (staff act as themselves, audited).
set local role service_role;
select throws_ok($$ select public.staff_dashboard() $$, '42501', null, 'the server key cannot call staff functions');
select throws_ok($$ select public.staff_record_refund((select id from r where n = 'pay_hawa'), 'refund requested') $$, '42501', null,
  'the server key cannot record refunds');
reset role;

-- ---------------------------------------------------------------------------
-- Users: phone search without returning phones; DOB correction (BR-4, BR-34)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'mod'), true);
select is((select display_name from public.staff_users_search(p_phone => '0770100001')), 'Musu', '§21: users can be found by phone (local format)');
select is((select display_name from public.staff_users_search(p_phone => '+231 770 100 001')), 'Musu', '§21: …and international format');
select is((select count(*)::int from public.staff_users_search(p_phone => '0770999999')), 0, 'an unknown phone finds nobody');
select is((select display_name from public.staff_users_search('eeeeeeee-1000-0000-0000-000000000004')), 'Hawa', '§21: users can be found by ID');
select ok(public.staff_user_detail('eeeeeeee-1000-0000-0000-000000000001')::text !~ '23177010', '§6 rule 7: user detail never contains the phone');
select ok(public.staff_user_detail('eeeeeeee-1000-0000-0000-000000000001')::text !~ 'photos/|selfies/', '§6 rule 5: user detail never contains storage paths');
select throws_ok($$ select public.staff_user_detail('eeeeeeee-1000-0000-0000-0000000000bb') $$, 'P0002', 'MEMBER_NOT_FOUND',
  'staff accounts are not members');

select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
select throws_ok($$ select public.staff_correct_dob('eeeeeeee-1000-0000-0000-000000000004', '1996-03-05', '') $$, '22023', 'REASON_REQUIRED',
  'a DOB correction needs a reason');
select lives_ok($$ select public.staff_correct_dob('eeeeeeee-1000-0000-0000-000000000004', '1996-03-05', 'Typo at signup, ID checked') $$,
  'an admin corrects a locked date of birth');
reset role;
select is((select date_of_birth from public.profiles where user_id = 'eeeeeeee-1000-0000-0000-000000000004'), '1996-03-05'::date, 'the date changed');
select ok((select dob_locked from public.profiles where user_id = 'eeeeeeee-1000-0000-0000-000000000004'), 'BR-4: it stays locked');
select is((select metadata from public.audit_logs where action = 'DOB_CORRECTED' and entity_id = 'eeeeeeee-1000-0000-0000-000000000004'),
  '{"reason": "Typo at signup, ID checked"}'::jsonb, 'BR-34: audited with the reason and never the date (§6 rule 7)');
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
select throws_ok($$ select public.staff_correct_dob('eeeeeeee-1000-0000-0000-000000000004', (current_date - interval '17 years')::date, 'Typo at signup') $$,
  '22023', 'UNDER_18', 'BR-4: a correction can''t make a member under 18');

-- ---------------------------------------------------------------------------
-- Subscriptions: manual extension (OD-30), audited
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.staff_extend_subscription((select id from r where n = 'sub_hawa'), 8, 'goodwill gesture') $$,
  '22023', 'EXTENSION_OUT_OF_RANGE', 'OD-30: an extension over the cap is refused');
select throws_ok($$ select public.staff_extend_subscription((select id from r where n = 'sub_hawa'), 2, '') $$,
  '22023', 'REASON_REQUIRED', 'an extension needs a reason');
select lives_ok($$ select public.staff_extend_subscription((select id from r where n = 'sub_hawa'), 2, 'Outage compensation') $$,
  'an admin extends a running subscription');
reset role;
select ok((select expires_at > now() + interval '2 days 23 hours' from public.subscriptions where id = (select id from r where n = 'sub_hawa')),
  'the subscription now ends two days later');
select is((select (metadata ->> 'days')::int from public.audit_logs where action = 'SUBSCRIPTION_MODIFIED'
           and entity_id = (select id::text from r where n = 'sub_hawa')), 2, 'BR-34: the extension is audited with days and reason');
update public.app_settings set value = null where key = 'subscriptions.manual_extension_max_days';
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
select throws_ok($$ select public.staff_extend_subscription((select id from r where n = 'sub_hawa'), 1, 'Outage compensation') $$,
  'P0001', null, '§6 rule 9: no extension at all while OD-30 is unset');
reset role;
update public.app_settings set value = '7' where key = 'subscriptions.manual_extension_max_days';
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
select throws_ok($$ select public.staff_extend_subscription((select id from r where n = 'sub_hawa'), 6, 'More outage time') $$,
  '22023', 'EXTENSION_OUT_OF_RANGE', 'OD-30: the cap is a total per pass (2 + 6 > 7), not per click');
select throws_ok($$ select public.staff_update_setting('subscriptions.manual_extension_max_days', '60') $$, '42501', 'SUPER_ADMIN_ONLY',
  'an admin can''t raise their own extension cap');
reset role;
insert into r select 'sub_joseph', id from public.subscriptions where user_id = 'eeeeeeee-1000-0000-0000-000000000002';
select pg_temp.give_pass('eeeeeeee-1000-0000-0000-000000000002', 48);
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
select throws_ok($$ select public.staff_extend_subscription((select id from r where n = 'sub_joseph'), 1, 'Outage compensation') $$,
  '22023', 'EXTEND_LAST_PASS', 'BR-28: with a pass stacked after it, only the last pass is extended');
reset role;

-- ---------------------------------------------------------------------------
-- Refunds (§21; OD-13 decides when): recorded, access ends, audited
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
select lives_ok($$ select public.staff_record_refund((select id from r where n = 'pay_hawa'), 'Paid twice by mistake') $$,
  'an admin records a mobile money refund');
reset role;
select is((select status::text from public.payments where id = (select id from r where n = 'pay_hawa')), 'REFUNDED', 'the payment is REFUNDED');
select ok(not public.has_casual_access('eeeeeeee-1000-0000-0000-000000000004'), 'the access it paid for ends');
select is((select actor_id from public.payment_events where payment_id = (select id from r where n = 'pay_hawa') and type = 'STATUS_CHANGED'),
  'eeeeeeee-1000-0000-0000-0000000000bb'::uuid, '§16: the status change is a payment event with the admin as actor');
select ok(exists (select 1 from public.audit_logs where action = 'PAYMENT_REFUNDED' and entity_id = (select id::text from r where n = 'pay_hawa')
                  and actor_id = 'eeeeeeee-1000-0000-0000-0000000000bb'), 'BR-34: the refund is audited');
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
select throws_ok($$ select public.staff_record_refund((select id from r where n = 'pay_hawa'), 'Paid twice by mistake') $$,
  '22023', 'NOT_REFUNDABLE', 'a payment is refunded once');
select is((select count(*)::int from public.staff_payment_events((select id from r where n = 'pay_hawa'))), 1,
  '§21: the payment''s event history is shown');

-- ---------------------------------------------------------------------------
-- Settings: validated by kind, audited with old and new value (BR-34)
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.staff_update_setting('messages.max_per_minute', '"lots"') $$, '22023', 'INVALID_VALUE', 'a number setting refuses text');
select throws_ok($$ select public.staff_update_setting('messages.max_per_minute', '1.5') $$, '22023', 'INVALID_VALUE', 'a number setting refuses fractions');
select throws_ok($$ select public.staff_update_setting('messages.max_per_minute', '-1') $$, '22023', 'INVALID_VALUE', 'a number setting refuses negatives');
select throws_ok($$ select public.staff_update_setting('card.allow_during_mobile_money_pass', '1') $$, '22023', 'INVALID_VALUE', 'a yes/no setting refuses numbers');
select throws_ok($$ select public.staff_update_setting('verification.pose_prompts', '[]') $$, '22023', 'INVALID_VALUE', 'a list setting refuses an empty list');
select throws_ok($$ select public.staff_update_setting('no.such.key', '1') $$, 'P0002', 'UNKNOWN_SETTING', 'unknown keys are refused');
select lives_ok($$ select public.staff_update_setting('messages.max_per_minute', '45') $$, 'an admin changes a limit');
reset role;
select is(public.get_setting('messages.max_per_minute'), '45'::jsonb, 'the new value is live');
select is((select metadata from public.audit_logs where action = 'SETTING_CHANGED' and entity_id = 'messages.max_per_minute'),
  '{"from": 60, "to": 45}'::jsonb, 'BR-34: audited with old and new value');
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'super'), true);
select throws_ok($$ select public.staff_update_setting('geo.enforcement_mode', '"ALWAYS"') $$, '22023', 'INVALID_VALUE', 'a choice setting refuses other values');
select lives_ok($$ select public.staff_update_setting('geo.enforcement_mode', '"EVERY_SESSION"') $$, 'a super admin changes a feature flag');
select throws_ok($$ select public.staff_update_setting('subscriptions.manual_extension_max_days', '31') $$, '22023', 'INVALID_VALUE',
  'OD-30: the extension cap has an upper bound');
select throws_ok($$ select public.staff_update_setting('claims.transaction_id_patterns', '{"ORANGE_MONEY": "(", "MTN_MOMO": "^[0-9]+$"}') $$,
  '22023', 'INVALID_VALUE', 'a transaction-ID pattern that doesn''t compile is refused (claims would all fail)');
select throws_ok($$ select public.staff_update_setting('claims.transaction_id_patterns', '{"ORANGE_MONEY": "^[0-9]+$"}') $$,
  '22023', 'INVALID_VALUE', 'both providers need a pattern');
select lives_ok($$ select public.staff_update_setting('claims.transaction_id_patterns', '{"ORANGE_MONEY": "^[A-Z0-9.]{6,30}$", "MTN_MOMO": "^[0-9]{6,20}$"}') $$,
  'valid patterns are accepted');
select throws_ok($$ select public.staff_update_setting('detection.terms', '{"price": ["usd"]}') $$, '22023', 'INVALID_VALUE',
  'detection term groups can''t be dropped');
select throws_ok($$ select public.staff_update_setting('verification.pose_prompts', '[1, 2]') $$, '22023', 'INVALID_VALUE',
  'pose prompts must be text');
select throws_ok($$ select public.staff_update_setting('photos.min_required', '7') $$, '22023', 'INVALID_VALUE',
  'members must be allowed at least the photos onboarding requires');
select lives_ok($$ select public.staff_update_setting('relationship.pass_cooldown_days', '0') $$, 'zero is allowed where it means "none"');
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
select throws_ok($$ select public.staff_update_setting('messages.max_per_minute', '0') $$, '22023', 'INVALID_VALUE',
  'a limit can''t be 0 (it would switch the feature off for everyone)');

-- Plans, merchant accounts, interests, areas.
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
select lives_ok($$ select public.staff_save_plan((select plan_id from public.staff_plans() where code = 'MM_DAY'), 'IGNORED', 'Day Pass', 'MOBILE_MONEY', 24, 1.50, null, true, 1) $$,
  'OD-1: an admin changes a price');
reset role;
select is((select price from public.subscription_plans where code = 'MM_DAY'), 1.50::numeric, 'the price changed; the code did not');
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
select throws_ok($$ select public.staff_save_plan((select plan_id from public.staff_plans() where code = 'MM_DAY'), '', 'Day Pass', 'MOBILE_MONEY', 48, 1.50, null, true, 1) $$,
  '22023', 'PLAN_IN_USE', 'a used plan''s length can''t change (members paid for it)');
select throws_ok($$ select public.staff_save_plan((select plan_id from public.staff_plans() where code = 'CARD_WEEKLY'), '', 'Weekly', 'CARD', 168, 4.00, 'CARD_WEEKLY', true, 1) $$,
  '22023', 'PRICE_ID_REQUIRED', 'a new card price needs a new processor price ID');
reset role;
select ok(exists (select 1 from public.audit_logs where action = 'SETTING_CHANGED' and entity_type = 'subscription_plan'), 'BR-34: plan change audited');
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
insert into r select 'wallet', public.staff_save_merchant_account(null, 'ORANGE_MONEY', 'WeKonnectz Ltd', '0770000999', true);
reset role;
select is((select count(*)::int from public.merchant_accounts where provider = 'ORANGE_MONEY' and active), 1, 'one active wallet per provider');
select ok((select active from public.merchant_accounts where id = (select id from r where n = 'wallet')), 'the new wallet is the active one');
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
insert into r select 'interest', public.staff_save_interest(null, 'Board Games', true);
insert into r select 'area', public.staff_save_area(null, 'Montserrado', 'Paynesville Red Light', true);
reset role;
select is((select slug from public.interests where id = (select id from r where n = 'interest')), 'board-games', 'a new interest gets a slug');
select is((select count(*)::int from public.audit_logs where action = 'SETTING_CHANGED' and entity_type in ('merchant_account', 'interest', 'area')), 3,
  'BR-34: wallet, interest and area changes audited');

-- Audit log viewer: filters, read-only.
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
select ok((select bool_and(action = 'SETTING_CHANGED') from public.staff_audit_logs(p_action => 'SETTING_CHANGED')), '§21: audit logs filter by action');
select ok((select bool_and(actor = 'super-150@example.test') from public.staff_audit_logs(p_actor_email => 'super-150@example.test')), '§21: …and by actor');
select is((select count(*)::int from public.staff_audit_logs(p_entity_type => 'app_setting', p_entity_id => 'geo.enforcement_mode')), 1, '§21: …and by entity');
select throws_ok($$ delete from public.audit_logs $$, '42501', null, 'audit logs are read-only');

-- ---------------------------------------------------------------------------
-- Staff management (SUPER_ADMIN)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', (select c from claims where who = 'super'), true);
select throws_ok($$ select public.staff_register_new('eeeeeeee-1000-0000-0000-000000000004', 'MODERATOR') $$, '22023', 'NOT_A_NEW_STAFF_ACCOUNT',
  '§7 [NEW]: a member account never becomes staff');
select throws_ok($$ select public.staff_register_new('eeeeeeee-1000-0000-0000-0000000000ef', 'MODERATOR') $$, '22023', 'NOT_A_NEW_STAFF_ACCOUNT',
  'only a just-created email account can be registered');
select throws_ok($$ select public.staff_register_new('eeeeeeee-1000-0000-0000-0000000000ee', 'USER') $$, '22023', 'BAD_ROLE', 'staff need a staff role');
select lives_ok($$ select public.staff_register_new('eeeeeeee-1000-0000-0000-0000000000ee', 'MODERATOR') $$, 'a super admin creates a moderator');
select throws_ok($$ select public.staff_set_role('eeeeeeee-1000-0000-0000-0000000000cc', 'ADMIN') $$, '22023', 'NOT_YOURSELF',
  'a super admin cannot change their own role');
select throws_ok($$ select public.staff_set_role('eeeeeeee-1000-0000-0000-000000000004', 'ADMIN') $$, 'P0002', 'STAFF_NOT_FOUND',
  'a member cannot be promoted');
select lives_ok($$ select public.staff_set_role('eeeeeeee-1000-0000-0000-0000000000aa', 'ADMIN') $$, 'a super admin promotes a moderator');
select lives_ok($$ select public.staff_set_enabled('eeeeeeee-1000-0000-0000-0000000000dd', false) $$, 'a super admin turns a staff account off');
reset role;
select is((select role::text from public.users where id = 'eeeeeeee-1000-0000-0000-0000000000ee'), 'MODERATOR', 'the new account is a moderator');
select ok((select banned_until > now() from auth.users where id = 'eeeeeeee-1000-0000-0000-0000000000dd'), 'a turned-off account cannot sign in');
select is((select count(*)::int from public.audit_logs where action in ('ADMIN_CREATED', 'ROLE_CHANGED')
           and entity_id in ('eeeeeeee-1000-0000-0000-0000000000ee', 'eeeeeeee-1000-0000-0000-0000000000aa', 'eeeeeeee-1000-0000-0000-0000000000dd')), 3,
  'BR-34: creating staff, changing a role and turning an account off are audited');
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'super'), true);
select lives_ok($$ select public.staff_set_enabled('eeeeeeee-1000-0000-0000-0000000000dd', true) $$, 'and back on');
reset role;
select ok((select banned_until is null from auth.users where id = 'eeeeeeee-1000-0000-0000-0000000000dd'), 'a turned-on account can sign in again');
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- Data export: the member's own data, no storage paths
-- ---------------------------------------------------------------------------
create temp table ex as select public.member_data_export('eeeeeeee-1000-0000-0000-000000000001') as j;
select is((select j -> 'profile' ->> 'display_name' from ex), 'Musu', 'the export contains the profile');
select is((select jsonb_array_length(j -> 'messages_sent') from ex), 1, 'the export contains messages the member sent');
select is((select jsonb_array_length(j -> 'requests_sent') from ex), 1, 'the export contains requests the member sent');
select is((select jsonb_array_length(j -> 'photos') from ex), 3, 'the export lists photos');
select ok((select j::text !~ 'photos/|selfies/|storage_path' from ex), '§6 rule 5: the export contains no storage paths');

-- Before deleting: Musu has an open card checkout, Hawa blocked her, Joseph reported her; Prince pays by card.
set local role service_role;
insert into r select 'musu_ref', (public.start_card_checkout('eeeeeeee-1000-0000-0000-000000000001', 'CARD_WEEKLY', 'fake') ->> 'reference')::uuid;
insert into r select 'prince_ref', (public.start_card_checkout('eeeeeeee-1000-0000-0000-000000000003', 'CARD_WEEKLY', 'fake') ->> 'reference')::uuid;
select public.apply_card_event('fake', jsonb_build_object('id', 'evt_p10_1', 'type', 'CHECKOUT_COMPLETED', 'occurred_at', now(),
  'reference', (select id from r where n = 'prince_ref'), 'subscription_ref', 'sub_prince_p10', 'customer_ref', 'cus_prince_p10',
  'charge_id', 'ch_p10', 'amount', 3.00, 'currency', 'USD', 'period_end', now() + interval '7 days'));
select is((select count(*)::int from public.card_stops_due('eeeeeeee-1000-0000-0000-000000000003')), 0, 'a card plan in good standing needs no stop');
select is((select count(*)::int from public.card_stops_due('eeeeeeee-1000-0000-0000-000000000003', true)), 1, 'before an account is deleted, every card plan is stopped');
select public.block_user('eeeeeeee-1000-0000-0000-000000000004', 'eeeeeeee-1000-0000-0000-000000000001');
reset role;
insert into public.reports (reporter_id, reported_user_id, category, priority) values ('eeeeeeee-1000-0000-0000-000000000002', 'eeeeeeee-1000-0000-0000-000000000001', 'SPAM', 'LOW');

-- ---------------------------------------------------------------------------
-- BR-7: a deleted account is hidden everywhere, at once
-- ---------------------------------------------------------------------------
set local role service_role;
select lives_ok($$ select public.member_delete_account('eeeeeeee-1000-0000-0000-000000000001') $$, '§8: a member deletes their account');
select throws_ok($$ select public.member_delete_account('eeeeeeee-1000-0000-0000-000000000001') $$, '22023', 'CANNOT_DELETE', 'only once');
reset role;
select is((select status::text from public.users where id = 'eeeeeeee-1000-0000-0000-000000000001'), 'DELETED', 'status DELETED');
select is((select status::text from public.subscriptions where user_id = 'eeeeeeee-1000-0000-0000-000000000001' and source = 'CARD'), 'EXPIRED',
  'an open card checkout is closed, so paying it can''t start a plan');
set local role service_role;
select is((select count(*)::int from public.member_blocked_list('eeeeeeee-1000-0000-0000-000000000004')), 0, 'BR-7: gone from the blocked list too');
select is(public.apply_card_event('fake', jsonb_build_object('id', 'evt_p10_late', 'type', 'CHECKOUT_COMPLETED', 'occurred_at', now(),
  'reference', (select id from r where n = 'musu_ref'), 'subscription_ref', 'sub_musu_late', 'customer_ref', 'cus_musu_late',
  'charge_id', 'ch_musu_late', 'amount', 3.00, 'currency', 'USD', 'period_end', now() + interval '7 days')) ->> 'result', 'NEEDS_REFUND',
  'a checkout paid after deletion gives no access: the charge goes on the refund list');
reset role;
select ok(public.card_cancel_needed('fake', 'sub_musu_late'), '…and its renewals are stopped');
set local role service_role;
reset role;
select ok((select banned_until > now() from auth.users where id = 'eeeeeeee-1000-0000-0000-000000000001'), 'BR-7: Auth refuses the account');
select ok(not public.is_in_pool('eeeeeeee-1000-0000-0000-000000000001'), 'BR-7: out of the pool');
set local role service_role;
select is((select count(*)::int from public.pool_candidates('eeeeeeee-1000-0000-0000-000000000002')
           where card ->> 'display_name' = 'Musu'), 0, 'BR-7: not in Available Now');
select is(public.casual_profile('eeeeeeee-1000-0000-0000-000000000002', 'eeeeeeee-1000-0000-0000-000000000001'), null, 'BR-7: no Casual profile');
select is(public.member_profile_for_viewer('eeeeeeee-1000-0000-0000-000000000002', 'eeeeeeee-1000-0000-0000-000000000001'), null, 'BR-7: no profile');
select is((select count(*)::int from public.discover_candidates('eeeeeeee-1000-0000-0000-000000000002') where card ->> 'display_name' = 'Musu'), 0,
  'BR-7: not in Discover');
select is((select count(*)::int from public.likes_received('eeeeeeee-1000-0000-0000-000000000002')), 0, 'BR-7: her like is no longer shown');
select is((select count(*)::int from public.matches_list('eeeeeeee-1000-0000-0000-000000000003')), 0, 'BR-7: the match is gone');
select is((select count(*)::int from public.conversations_list('eeeeeeee-1000-0000-0000-000000000003') where card ->> 'display_name' = 'Musu'), 0,
  'BR-7: the conversation is gone from the list');
select is((select count(*)::int from public.requests_received('eeeeeeee-1000-0000-0000-000000000002')), 0, 'BR-7: her request is gone');
select is((select count(*)::int from public.saved_list('eeeeeeee-1000-0000-0000-000000000002')), 0, 'BR-7: gone from Saved');
reset role;
select is((select status::text from public.conversations where id = (select id from r where n = 'conv')), 'CLOSED', 'her conversations are closed');

-- OD-7: purge only after the retention period, with the files to remove.
set local role service_role;
select is((select count(*)::int from public.accounts_due_for_purge() where user_id = 'eeeeeeee-1000-0000-0000-000000000001'), 0,
  'OD-7: not purged before the retention period');
reset role;
update public.users set deleted_at = now() - interval '31 days' where id = 'eeeeeeee-1000-0000-0000-000000000001';
set local role service_role;
select is((select count(*)::int from public.accounts_due_for_purge() where user_id = 'eeeeeeee-1000-0000-0000-000000000001'), 0,
  'OD-7: an open report against the member is decided before the purge');
reset role;
update public.reports set status = 'RESOLVED', reviewed_at = now(), reviewed_by = 'eeeeeeee-1000-0000-0000-0000000000aa' where reported_user_id = 'eeeeeeee-1000-0000-0000-000000000001';
set local role service_role;
select is((select cardinality(photo_paths) + cardinality(selfie_paths) from public.accounts_due_for_purge()
           where user_id = 'eeeeeeee-1000-0000-0000-000000000001'), 4, 'OD-7: due after the period, with photos and selfie to delete');
reset role;
set local role service_role;
select throws_ok($$ select public.purge_account_content('eeeeeeee-1000-0000-0000-000000000002') $$, '22023', 'NOT_DUE',
  'OD-7: only a deleted account past the retention period can be purged');
select lives_ok($$ select public.purge_account_content('eeeeeeee-1000-0000-0000-000000000001') $$, 'OD-7: the purge removes conversations and matches first');
reset role;
-- The purge job then deletes the Auth user (as Supabase Auth does); everything personal cascades.
select lives_ok($$ delete from auth.users where id = 'eeeeeeee-1000-0000-0000-000000000001' $$, 'OD-7: the purge removes the account');
select is((select count(*)::int from public.profiles where user_id = 'eeeeeeee-1000-0000-0000-000000000001'), 0, 'OD-7: the profile is gone');
select is((select count(*)::int from public.messages where body = 'Hello Prince'), 0, 'OD-7: their messages are gone');
select ok(exists (select 1 from public.payments where user_id is null and amount = 1.00), 'OD-7: payment records are kept, unlinked');
select is((select count(*)::int from public.reports where reported_user_id is null and category = 'SPAM'), 1,
  'reports about a purged member are kept, unlinked');
insert into r select 'spam_report', id from public.reports where reported_user_id is null and category = 'SPAM';
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
select ok(exists (select 1 from public.staff_reports_queue(p_include_closed => true) where reported_user_id is null and category = 'SPAM'),
  '…and still listed for staff (closed view)');
select is(public.staff_report_detail((select id from r where n = 'spam_report')) ->> 'account_status',
  'DELETED', '…and its detail opens, showing the member as deleted');
reset role;
select set_config('request.jwt.claims', '', true);
update public.app_settings set value = null where key = 'account.deletion_purge_days';
set local role service_role;
select is((select count(*)::int from public.accounts_due_for_purge()), 0, '§6 rule 9: nothing is purged while OD-7 is unset');
reset role;

-- A banned member's card plan must stop renewing.
update public.users set status = 'BANNED' where id = 'eeeeeeee-1000-0000-0000-000000000003';
set local role service_role;
select is((select count(*)::int from public.card_stops_due('eeeeeeee-1000-0000-0000-000000000003')), 1, 'a banned member''s card plan is stopped at the processor');
reset role;

-- Your account: a staff password change is audited.
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'mod'), true);
select lives_ok($$ select public.staff_log_password_change() $$, 'staff record their own password change');
reset role;
select ok(exists (select 1 from public.audit_logs where action = 'STAFF_PASSWORD_CHANGED' and actor_id = 'eeeeeeee-1000-0000-0000-0000000000aa'),
  '§22: the change is in the audit log');

select * from finish();
rollback;
