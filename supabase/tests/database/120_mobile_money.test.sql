-- Phase 7: mobile money access (spec §16, §21; BR-26, 27, 28, 29, 30, 35, 36, 37, 38, 39, 41; §6 rule 11).
begin;
create extension if not exists pgtap with schema extensions;
select plan(77);

-- Fixtures (fictional): Musu and Hawa verified ACTIVE members; Siah PENDING (not verified); a moderator;
-- an admin (aal2 + TOTP) and the same admin without MFA.
insert into auth.users (id, phone, email, aud, role) values
  ('bbbbbbbb-7000-0000-0000-000000000001', '231770007001', null, 'authenticated', 'authenticated'),
  ('bbbbbbbb-7000-0000-0000-000000000002', '231770007002', null, 'authenticated', 'authenticated'),
  ('bbbbbbbb-7000-0000-0000-000000000003', '231770007003', null, 'authenticated', 'authenticated'),
  ('bbbbbbbb-7000-0000-0000-0000000000aa', null, 'mod-120@example.test', 'authenticated', 'authenticated'),
  ('bbbbbbbb-7000-0000-0000-0000000000bb', null, 'admin-120@example.test', 'authenticated', 'authenticated');
insert into public.profiles (user_id, date_of_birth, display_name, gender, seeking_genders, is_profile_complete)
select u.id, '1995-01-01', u.name, 'WOMAN', array['MAN']::public.gender[], true
from (values ('bbbbbbbb-7000-0000-0000-000000000001'::uuid, 'Musu'),
             ('bbbbbbbb-7000-0000-0000-000000000002'::uuid, 'Hawa'),
             ('bbbbbbbb-7000-0000-0000-000000000003'::uuid, 'Siah')) as u(id, name);
insert into public.verifications (user_id, pose_prompt, status, selfie_storage_path, submitted_at, reviewed_at)
select u, 'Touch your ear', 'VERIFIED', gen_random_uuid() || '.webp', now(), now()
from unnest(array['bbbbbbbb-7000-0000-0000-000000000001', 'bbbbbbbb-7000-0000-0000-000000000002']::uuid[]) as u;
update public.users set status = 'ACTIVE' where id in ('bbbbbbbb-7000-0000-0000-000000000001', 'bbbbbbbb-7000-0000-0000-000000000002');
update public.users set role = 'MODERATOR', status = 'ACTIVE' where id = 'bbbbbbbb-7000-0000-0000-0000000000aa';
update public.users set role = 'ADMIN', status = 'ACTIVE' where id = 'bbbbbbbb-7000-0000-0000-0000000000bb';

create temp table ids (n text primary key, id uuid);
grant select on ids to authenticated;
insert into ids select 'week', id from public.subscription_plans where code = 'MM_7DAY';
insert into ids select 'day', id from public.subscription_plans where code = 'MM_DAY';
create temp table claims (who text primary key, c text);
grant select on claims to authenticated;
insert into claims values
  ('member', '{"sub":"bbbbbbbb-7000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}'),
  ('mod', '{"sub":"bbbbbbbb-7000-0000-0000-0000000000aa","role":"authenticated","aal":"aal2","amr":[{"method":"password","timestamp":1},{"method":"totp","timestamp":2}]}'),
  ('admin', '{"sub":"bbbbbbbb-7000-0000-0000-0000000000bb","role":"authenticated","aal":"aal2","amr":[{"method":"password","timestamp":1},{"method":"totp","timestamp":2}]}'),
  ('admin_nomfa', '{"sub":"bbbbbbbb-7000-0000-0000-0000000000bb","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1}]}');

create temp table sha (n text primary key, h text);
grant select on sha to authenticated;
insert into sha values ('a', repeat('a', 64)), ('b', repeat('b', 64)), ('c', repeat('c', 64));

-- ---------------------------------------------------------------------------
-- §6 rule 11 / BR-26: no path but approve_payment_claim() creates mobile money access
-- ---------------------------------------------------------------------------
select is(public.get_setting('claims.max_pending')::int, 2, 'OD-21: two claims may wait at once (owner)');
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'member'), true);
select throws_ok($$ select * from public.payment_claims $$, '42501', null, 'members cannot read claims directly');
select throws_ok($$ insert into public.subscriptions (user_id, plan_id, source, status, starts_at, expires_at)
  values ('bbbbbbbb-7000-0000-0000-000000000001', (select id from ids where n = 'week'), 'MOBILE_MONEY', 'ACTIVE', now(), now() + interval '1 day') $$,
  '42501', null, 'BR-26: a member cannot create access');
select throws_ok($$ select public.submit_payment_claim('bbbbbbbb-7000-0000-0000-000000000001', (select id from ids where n = 'week'),
  'ORANGE_MONEY', 'OM123456', '+231770007001', now(), gen_random_uuid() || '.webp', repeat('a', 64)) $$,
  '42501', null, 'members cannot call submit_payment_claim directly (the server passes the session user)');
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
select throws_ok($$ insert into public.subscriptions (user_id, plan_id, source, status, starts_at, expires_at)
  values ('bbbbbbbb-7000-0000-0000-000000000001', (select id from ids where n = 'week'), 'MOBILE_MONEY', 'ACTIVE', now(), now() + interval '1 day') $$,
  '42501', null, 'BR-26: not even an admin session can insert access');
reset role;
select set_config('request.jwt.claims', '', true);
set local role service_role;
select throws_ok($$ insert into public.subscriptions (user_id, plan_id, source, status, starts_at, expires_at)
  values ('bbbbbbbb-7000-0000-0000-000000000001', (select id from ids where n = 'week'), 'MOBILE_MONEY', 'ACTIVE', now(), now() + interval '1 day') $$,
  '42501', null, 'BR-26: nor the server key');
select throws_ok($$ select public.approve_payment_claim(gen_random_uuid(), 1.00) $$, '42501', null,
  '§6 rule 11: the server key cannot approve a claim (only an admin session)');
reset role;
select throws_ok($$ insert into public.subscriptions (user_id, plan_id, source, status, starts_at, expires_at)
  values ('bbbbbbbb-7000-0000-0000-000000000001', (select id from ids where n = 'week'), 'MOBILE_MONEY', 'ACTIVE', now(), now() + interval '1 day') $$,
  '42501', 'ACCESS_ONLY_BY_CLAIM_APPROVAL', 'BR-26: even the database owner can''t insert mobile money access outside the approval');

-- ---------------------------------------------------------------------------
-- Submitting claims (§16 validation)
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.submit_payment_claim('bbbbbbbb-7000-0000-0000-000000000003', (select id from ids where n = 'week'),
  'ORANGE_MONEY', 'OM123456', '+231770007003', now(), gen_random_uuid() || '.webp', repeat('a', 64)) $$,
  '42501', 'ACCOUNT_CANNOT_PAY', 'only verified ACTIVE members can pay');
select throws_ok($$ select public.submit_payment_claim('bbbbbbbb-7000-0000-0000-000000000001', (select id from ids where n = 'week'),
  'ORANGE_MONEY', 'no!', '+231770007001', now(), gen_random_uuid() || '.webp', repeat('a', 64)) $$,
  '22023', 'INVALID_TRANSACTION_ID', 'T-14: transaction IDs must match the provider''s format');
select throws_ok($$ select public.submit_payment_claim('bbbbbbbb-7000-0000-0000-000000000001', (select id from ids where n = 'week'),
  'ORANGE_MONEY', 'OM123456', '+15555550100', now(), gen_random_uuid() || '.webp', repeat('a', 64)) $$,
  '22023', 'INVALID_SENDER', 'the sender is a +231 number');
select throws_ok($$ select public.submit_payment_claim('bbbbbbbb-7000-0000-0000-000000000001', (select id from ids where n = 'week'),
  'ORANGE_MONEY', 'OM123456', '+231770007001', now() + interval '1 day', gen_random_uuid() || '.webp', repeat('a', 64)) $$,
  '22023', 'INVALID_PAID_AT', 'payment time cannot be in the future');
insert into ids select 'c1', public.submit_payment_claim('bbbbbbbb-7000-0000-0000-000000000001', (select id from ids where n = 'week'),
  'ORANGE_MONEY', ' om 123456 ', '+231770007001', now() - interval '1 hour', gen_random_uuid() || '.webp', repeat('a', 64));
select is((select status::text from public.payment_claims where id = (select id from ids where n = 'c1')), 'PENDING_REVIEW', 'a claim starts PENDING_REVIEW');
select is((select amount from public.payment_claims where id = (select id from ids where n = 'c1')), 5.00::numeric,
  'the amount is locked to the plan price');
select is((select transaction_id from public.payment_claims where id = (select id from ids where n = 'c1')), 'OM123456',
  'transaction IDs are normalised (spaces, case)');
select matches((select reference_code from public.payment_claims where id = (select id from ids where n = 'c1')), '^WK-[A-Z0-9]{4}$',
  'the member''s reference code is stored');
select throws_ok($$ select public.submit_payment_claim('bbbbbbbb-7000-0000-0000-000000000002', (select id from ids where n = 'week'),
  'ORANGE_MONEY', 'OM123456', '+231770007002', now(), gen_random_uuid() || '.webp', repeat('b', 64)) $$,
  '22023', 'TRANSACTION_ALREADY_CLAIMED', 'BR-35: a live transaction ID cannot be claimed twice');
select throws_ok($$ select public.submit_payment_claim('bbbbbbbb-7000-0000-0000-000000000002', (select id from ids where n = 'week'),
  'ORANGE_MONEY', 'OM.1234.56', '+231770007002', now(), gen_random_uuid() || '.webp', repeat('b', 64)) $$,
  '22023', 'TRANSACTION_ALREADY_CLAIMED', 'BR-35: punctuation doesn''t make it a different transaction');
insert into ids select 'c2', public.submit_payment_claim('bbbbbbbb-7000-0000-0000-000000000001', (select id from ids where n = 'week'),
  'MTN_MOMO', '99887766', '+231770007001', now() - interval '30 minutes', gen_random_uuid() || '.webp', repeat('a', 64));
select is((select reason from public.moderation_flags where entity_type = 'CLAIM' and entity_id = (select id from ids where n = 'c2')),
  'DUPLICATE_EVIDENCE', '§17: the same screenshot on another claim auto-flags it');
select throws_ok($$ select public.submit_payment_claim('bbbbbbbb-7000-0000-0000-000000000001', (select id from ids where n = 'week'),
  'MTN_MOMO', '11223344', '+231770007001', now(), gen_random_uuid() || '.webp', repeat('c', 64)) $$,
  '22023', 'TOO_MANY_PENDING', 'BR-39 / OD-21: at most two claims waiting at once');

-- ---------------------------------------------------------------------------
-- Staff (BR-37, BR-38)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'mod'), true);
select throws_ok($$ select * from public.staff_claims_queue() $$, '42501', 'ADMIN_REQUIRED', 'Q9 / BR-37: moderators cannot see claims');
select throws_ok($$ select public.approve_payment_claim((select id from ids where n = 'c1'), 5.00) $$, '42501', 'ADMIN_REQUIRED',
  'BR-37: moderators cannot decide claims');
select ok(not exists (select 1 from public.staff_flags_queue() where entity_type = 'CLAIM'), 'Q9: payment flags are hidden from moderators');
select ok(not (public.staff_queue_counts() ? 'claims_pending'), 'and so are claim counts');
select set_config('request.jwt.claims', (select c from claims where who = 'admin_nomfa'), true);
select throws_ok($$ select public.approve_payment_claim((select id from ids where n = 'c1'), 5.00) $$, '42501', 'ADMIN_REQUIRED',
  'BR-37: an admin without TOTP cannot decide claims');
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
select is((select claim_id from public.staff_claims_queue() limit 1), (select id from ids where n = 'c1'), 'the queue is oldest first');
select ok(exists (select 1 from public.staff_flags_queue() where entity_type = 'CLAIM'), 'admins see payment flags');
select is((public.staff_queue_counts() ->> 'claims_pending')::int, 2, 'the dashboard counts pending claims for admins');
select throws_ok($$ select public.approve_payment_claim((select id from ids where n = 'c1'), 5.00) $$, '22023', 'EVIDENCE_NOT_VIEWED',
  'BR-38: the admin must open the screenshot before approving');
select lives_ok($$ select public.log_evidence_view((select id from ids where n = 'c1')) $$, 'admin views the screenshot');
select lives_ok($$ select public.approve_payment_claim((select id from ids where n = 'c1'), 5.00) $$, 'admin approves the claim');
select throws_ok($$ select public.approve_payment_claim((select id from ids where n = 'c1'), 5.00) $$, 'P0002', 'CLAIM_NOT_PENDING',
  'a claim is decided once');
select lives_ok($$ select public.log_evidence_view((select id from ids where n = 'c2')) $$, 'admin views the second screenshot');
select lives_ok($$ select public.approve_payment_claim((select id from ids where n = 'c2'), 5.00) $$, 'admin approves the second claim');
reset role;
select set_config('request.jwt.claims', '', true);

select is((select count(*)::int from public.audit_logs where action = 'EVIDENCE_VIEWED' and entity_id = (select id::text from ids where n = 'c1')), 1,
  'BR-34: every screenshot view is audited');
select is((select status::text from public.payments where claim_id = (select id from ids where n = 'c1')), 'SUCCEEDED',
  'approval writes a SUCCEEDED payment');
select is((select type from public.payment_events where claim_id = (select id from ids where n = 'c1')), 'CLAIM_APPROVED', 'and an event');
select is((select count(*)::int from public.audit_logs where action = 'PAYMENT_CLAIM_APPROVED'
  and entity_id = (select id::text from ids where n = 'c1') and actor_id = 'bbbbbbbb-7000-0000-0000-0000000000bb'), 1, 'BR-34: and an audit row');
select is((select type::text from public.notifications where user_id = 'bbbbbbbb-7000-0000-0000-000000000001'
  order by created_at desc limit 1), 'PAYMENT_APPROVED', 'the member is notified');
select ok(public.has_casual_access('bbbbbbbb-7000-0000-0000-000000000001'), 'BR-26 / BR-30: access exists after approval, read from server state');
select ok(not public.has_casual_access('bbbbbbbb-7000-0000-0000-000000000002'), 'and only for that member');
select is((select starts_at from public.subscriptions s join public.payments p on p.id = s.source_payment_id
           where p.claim_id = (select id from ids where n = 'c2')),
          (select expires_at from public.subscriptions s join public.payments p on p.id = s.source_payment_id
           where p.claim_id = (select id from ids where n = 'c1')),
  'BR-28: a second pass starts when the current one ends');
select ok(public.casual_access_until('bbbbbbbb-7000-0000-0000-000000000001') between now() + interval '335 hours' and now() + interval '337 hours',
  'two 7-day passes stack to 14 days');
-- BR-27: access ends exactly at expires_at.
select ok(public.has_casual_access('bbbbbbbb-7000-0000-0000-000000000001',
  public.casual_access_until('bbbbbbbb-7000-0000-0000-000000000001') - interval '1 second'), 'BR-27: access a second before expiry');
select ok(not public.has_casual_access('bbbbbbbb-7000-0000-0000-000000000001',
  public.casual_access_until('bbbbbbbb-7000-0000-0000-000000000001')), 'BR-27: none at expires_at');

-- BR-35: an approved transaction ID stays taken.
select throws_ok($$ select public.submit_payment_claim('bbbbbbbb-7000-0000-0000-000000000002', (select id from ids where n = 'week'),
  'ORANGE_MONEY', 'OM123456', '+231770007002', now(), gen_random_uuid() || '.webp', repeat('b', 64)) $$,
  '22023', 'TRANSACTION_ALREADY_CLAIMED', 'BR-35: an approved transaction ID can never be claimed again');

-- BR-29: payments are immutable; status changes are events; events are append-only.
select throws_ok($$ update public.payments set amount = 99 where claim_id = (select id from ids where n = 'c1') $$,
  '42501', 'PAYMENT_IMMUTABLE', 'BR-29: the amount never changes');
select throws_ok($$ delete from public.payments where claim_id = (select id from ids where n = 'c1') $$,
  '42501', 'PAYMENT_IMMUTABLE', 'BR-29: payments are never deleted');
update public.payments set status = 'REFUNDED' where claim_id = (select id from ids where n = 'c2');
select is((select raw_payload ->> 'to' from public.payment_events where claim_id = (select id from ids where n = 'c2')
  and type = 'STATUS_CHANGED'), 'REFUNDED', 'BR-29: a status change is appended as an event');
select throws_ok($$ update public.payment_events set type = 'X_EDITED' where claim_id = (select id from ids where n = 'c1') $$,
  '42501', 'APPEND_ONLY', 'events are append-only');

-- ---------------------------------------------------------------------------
-- Needs info, reply, reject (BR-36), resubmission, cancel
-- ---------------------------------------------------------------------------
insert into ids select 'c3', public.submit_payment_claim('bbbbbbbb-7000-0000-0000-000000000002', (select id from ids where n = 'day'),
  'MTN_MOMO', '55554444', '+231770007002', now(), gen_random_uuid() || '.webp', repeat('b', 64));
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
select public.log_evidence_view((select id from ids where n = 'c3'));
select lives_ok($$ select public.request_claim_info((select id from ids where n = 'c3'), 'Please send a clearer screenshot.') $$,
  'admin asks for more information');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select staff_question from public.member_claims('bbbbbbbb-7000-0000-0000-000000000002') where claim_id = (select id from ids where n = 'c3')),
  'Please send a clearer screenshot.', 'the member sees the question');
select lives_ok($$ select public.reply_payment_claim('bbbbbbbb-7000-0000-0000-000000000002', (select id from ids where n = 'c3'), 'Here it is.',
  gen_random_uuid() || '.webp', repeat('c', 64)) $$, 'the member replies with a new screenshot');
select is((select count(*)::int from public.claim_evidence where claim_id = (select id from ids where n = 'c3')), 2,
  '§17: the replaced screenshot is kept as evidence');
select is((select status::text from public.payment_claims where id = (select id from ids where n = 'c3')), 'PENDING_REVIEW', 'back to review');
update public.subscription_plans set price = 2.00 where id = (select id from ids where n = 'day');
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
select throws_ok($$ select public.approve_payment_claim((select id from ids where n = 'c3'), 1.00) $$, '22023', 'EVIDENCE_NOT_VIEWED',
  'BR-38: a view of the replaced screenshot doesn''t count — the new one must be opened');
select lives_ok($$ select public.log_evidence_view((select id from ids where n = 'c3')) $$, 'admin views the new screenshot');
select throws_ok($$ select public.approve_payment_claim((select id from ids where n = 'c3'), 0.50) $$, '22023', 'AMOUNT_MISMATCH',
  'BR-36: the wallet amount must equal the price the member was shown, exactly');
select throws_ok($$ select public.reject_payment_claim((select id from ids where n = 'c3'), null) $$, '22023', 'REASON_REQUIRED',
  'a rejection needs a reason');
select lives_ok($$ select public.reject_payment_claim((select id from ids where n = 'c3'), 'AMOUNT_MISMATCH') $$,
  'OD-17: a wrong amount is rejected (refunded outside the app)');
reset role;
select set_config('request.jwt.claims', '', true);
update public.subscription_plans set price = 1.00 where id = (select id from ids where n = 'day');
select ok(not exists (select 1 from public.notifications where type = 'PAYMENT_REJECTED' and payload ? 'reason')
  and exists (select 1 from public.notifications where type = 'PAYMENT_REJECTED' and (payload ->> 'refund')::boolean),
  '§17: the member''s notification never says which check failed (only that a refund is coming)');
select is((select metadata ->> 'reason' from public.audit_logs where action = 'PAYMENT_CLAIM_REJECTED'
  and entity_id = (select id::text from ids where n = 'c3')), 'AMOUNT_MISMATCH', 'BR-34: the rejection is audited');
select is((select count(*)::int from public.audit_logs where action = 'PAYMENT_CLAIM_NEEDS_INFO'
  and entity_id = (select id::text from ids where n = 'c3') and not (metadata ? 'question')), 1,
  'the needs-info request is audited (without its text)');
insert into ids select 'c4', public.submit_payment_claim('bbbbbbbb-7000-0000-0000-000000000002', (select id from ids where n = 'day'),
  'MTN_MOMO', '55554444', '+231770007002', now(), gen_random_uuid() || '.webp', repeat('d', 64));
select is((select reason from public.moderation_flags where entity_type = 'CLAIM' and entity_id = (select id from ids where n = 'c4')),
  'REUSED_TRANSACTION', 'a rejected transaction ID may be claimed again, but it is flagged');
select lives_ok($$ select public.cancel_payment_claim('bbbbbbbb-7000-0000-0000-000000000002', (select id from ids where n = 'c4')) $$,
  'a member can withdraw a claim before review');
select throws_ok($$ select public.cancel_payment_claim('bbbbbbbb-7000-0000-0000-000000000001', (select id from ids where n = 'c4')) $$,
  'P0002', 'CLAIM_NOT_OPEN', 'only their own, open claim');

-- BR-37: never on the admin's own account.
with own as (
  insert into public.payment_claims (user_id, plan_id, provider, merchant_account_id, reference_code, transaction_id,
                                     transaction_key, sender_phone, amount, currency, paid_at, evidence_path, evidence_sha256)
  select 'bbbbbbbb-7000-0000-0000-0000000000bb', (select id from ids where n = 'day'), 'ORANGE_MONEY',
         (select id from public.merchant_accounts where provider = 'ORANGE_MONEY' and active), 'WK-AAAA', 'OWN00001', 'OWN00001',
         '+231770007009', 1.00, 'USD', now(), gen_random_uuid() || '.webp', repeat('e', 64)
  returning id
)
insert into ids select 'own', id from own;
set local role authenticated;
select set_config('request.jwt.claims', (select c from claims where who = 'admin'), true);
select throws_ok($$ select public.approve_payment_claim((select id from ids where n = 'own'), 1.00) $$, '42501', 'OWN_CONTENT',
  'BR-37: never on the reviewer''s own account');
select throws_ok($$ select public.log_evidence_view((select id from ids where n = 'own')) $$, '42501', 'OWN_CONTENT',
  'nor viewing its screenshot');
reset role;
select set_config('request.jwt.claims', '', true);

-- BR-41: no mobile money purchase while a card subscription is active (card rows arrive in Phase 7b).
select throws_ok($$ insert into public.subscriptions (user_id, plan_id, source, status, starts_at, expires_at, auto_renew)
  values ('bbbbbbbb-7000-0000-0000-000000000002', (select id from ids where n = 'week'), 'CARD', 'ACTIVE', now(), now() + interval '7 days', true) $$,
  '42501', 'ACCESS_ONLY_BY_CARD_EVENT', 'card access only through the card event function (Phase 7b)');
select set_config('wk.card_event', 'on', true);
insert into public.subscriptions (user_id, plan_id, source, status, starts_at, expires_at, auto_renew)
values ('bbbbbbbb-7000-0000-0000-000000000002', (select id from ids where n = 'week'), 'CARD', 'ACTIVE', now(), now() + interval '7 days', true);
select throws_ok($$ select public.submit_payment_claim('bbbbbbbb-7000-0000-0000-000000000002', (select id from ids where n = 'week'),
  'ORANGE_MONEY', 'OM777777', '+231770007002', now(), gen_random_uuid() || '.webp', repeat('f', 64)) $$,
  '22023', 'CARD_SUBSCRIPTION_ACTIVE', 'BR-41: blocked while a card subscription is active');
select set_config('wk.card_event', 'off', true);
select ok((public.member_payment_options('bbbbbbbb-7000-0000-0000-000000000002') ->> 'card_active')::boolean,
  'the Get access screen knows about the card subscription');

-- Member screens and the tidy job.
select ok(jsonb_array_length(public.member_payment_options('bbbbbbbb-7000-0000-0000-000000000001') -> 'plans') >= 3
  and jsonb_array_length(public.member_payment_options('bbbbbbbb-7000-0000-0000-000000000001') -> 'wallets') = 2,
  'payment options list the active plans and one wallet per provider');
select is((select count(*)::int from public.member_passes('bbbbbbbb-7000-0000-0000-000000000001')), 2, 'the member sees both passes as receipts');
select throws_ok($$ update public.subscriptions set expires_at = expires_at + interval '30 days'
  where user_id = 'bbbbbbbb-7000-0000-0000-000000000001' $$, '42501', 'SUBSCRIPTION_IMMUTABLE',
  'access can''t be extended by editing a subscription');
select set_config('wk.subscription_admin', 'on', true);
update public.subscriptions set starts_at = now() - interval '2 days', expires_at = now() - interval '1 day'
where user_id = 'bbbbbbbb-7000-0000-0000-000000000002';
select set_config('wk.subscription_admin', 'off', true);
select ok(public.expire_subscriptions() >= 1, 'the tidy job marks ended access EXPIRED');
select is((select status::text from public.subscriptions where user_id = 'bbbbbbbb-7000-0000-0000-000000000002'), 'EXPIRED', 'recorded');

-- OD-7: purging a member's account still works when they had passes and payments (records kept).
delete from auth.users where id = 'bbbbbbbb-7000-0000-0000-000000000001';
select is((select count(*)::int from public.payments where user_id is null and claim_id = (select id from ids where n = 'c1')), 1,
  'an account purge removes the access but keeps the payment record (unlinked)');

select * from finish();
rollback;
