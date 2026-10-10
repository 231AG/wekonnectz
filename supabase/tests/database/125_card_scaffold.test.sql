-- Phase 7b: card subscriptions scaffold (spec §16, §22; BR-26 card, BR-29, BR-40, BR-41; OD-19, OD-20).
begin;
create extension if not exists pgtap with schema extensions;
select plan(111);

-- Fixtures (fictional): Musu, Hawa, Kebeh verified ACTIVE members; Siah not verified.
insert into auth.users (id, phone, email, aud, role) values
  ('bbbbbbbb-7b00-0000-0000-000000000001', '231770007101', null, 'authenticated', 'authenticated'),
  ('bbbbbbbb-7b00-0000-0000-000000000002', '231770007102', null, 'authenticated', 'authenticated'),
  ('bbbbbbbb-7b00-0000-0000-000000000003', '231770007103', null, 'authenticated', 'authenticated'),
  ('bbbbbbbb-7b00-0000-0000-000000000004', '231770007104', null, 'authenticated', 'authenticated');
insert into public.profiles (user_id, date_of_birth, display_name, gender, seeking_genders, is_profile_complete)
select u.id, '1995-01-01', u.name, 'WOMAN', array['MAN']::public.gender[], true
from (values ('bbbbbbbb-7b00-0000-0000-000000000001'::uuid, 'Musu'),
             ('bbbbbbbb-7b00-0000-0000-000000000002'::uuid, 'Hawa'),
             ('bbbbbbbb-7b00-0000-0000-000000000003'::uuid, 'Siah'),
             ('bbbbbbbb-7b00-0000-0000-000000000004'::uuid, 'Kebeh')) as u(id, name);
insert into public.verifications (user_id, pose_prompt, status, selfie_storage_path, submitted_at, reviewed_at)
select u, 'Touch your ear', 'VERIFIED', gen_random_uuid() || '.webp', now(), now()
from unnest(array['bbbbbbbb-7b00-0000-0000-000000000001', 'bbbbbbbb-7b00-0000-0000-000000000002',
                  'bbbbbbbb-7b00-0000-0000-000000000004']::uuid[]) as u;
update public.users set status = 'ACTIVE'
where id in ('bbbbbbbb-7b00-0000-0000-000000000001', 'bbbbbbbb-7b00-0000-0000-000000000002',
             'bbbbbbbb-7b00-0000-0000-000000000004');

create temp table refs (n text primary key, id uuid);
grant all on refs to service_role;

-- A normalised event, as the adapter passes it after verifying the signature.
create function pg_temp.ev(p_id text, p_type text, p_at timestamptz, p_extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('id', p_id, 'type', p_type, 'occurred_at', p_at) || p_extra;
$$;
grant execute on function pg_temp.ev(text, text, timestamptz, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- BR-26 (card): no path but a verified processor event creates card access
-- ---------------------------------------------------------------------------
select throws_ok($$ insert into public.subscriptions (user_id, plan_id, source, status, starts_at, expires_at, processor)
  values ('bbbbbbbb-7b00-0000-0000-000000000001', (select id from public.subscription_plans where code = 'CARD_WEEKLY'),
          'CARD', 'ACTIVE', now(), now() + interval '7 days', 'fake') $$,
  '42501', 'ACCESS_ONLY_BY_CARD_EVENT', 'BR-26: card access can''t be inserted outside the card event functions');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-7b00-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.apply_card_event('fake', '{}'::jsonb) $$, '42501', null,
  'members cannot call apply_card_event');
select throws_ok($$ select public.start_card_checkout('bbbbbbbb-7b00-0000-0000-000000000001', 'CARD_WEEKLY', 'fake') $$,
  '42501', null, 'members cannot call start_card_checkout directly (the server passes the session user)');
select throws_ok($$ select public.log_invalid_card_webhook('fake', 'x', 'x') $$, '42501', null,
  'members cannot write webhook logs');
reset role;
select set_config('request.jwt.claims', '', true);

set local role service_role;
select throws_ok($$ select public.start_card_checkout('bbbbbbbb-7b00-0000-0000-000000000003', 'CARD_WEEKLY', 'fake') $$,
  '42501', 'ACCOUNT_CANNOT_PAY', 'only verified ACTIVE members can start a card checkout');
select throws_ok($$ select public.start_card_checkout('bbbbbbbb-7b00-0000-0000-000000000001', 'MM_7DAY', 'fake') $$,
  '22023', 'PLAN_NOT_AVAILABLE', 'a mobile money plan can''t be bought by card');
insert into refs select 'm1', (public.start_card_checkout('bbbbbbbb-7b00-0000-0000-000000000001', 'CARD_WEEKLY', 'fake') ->> 'reference')::uuid;
select is((select status::text from public.subscriptions where id = (select id from refs where n = 'm1')), 'PENDING',
  'a started checkout is PENDING');
select ok(not public.has_casual_access('bbbbbbbb-7b00-0000-0000-000000000001'), 'BR-26: PENDING gives no access');
insert into refs select 'm2', (public.start_card_checkout('bbbbbbbb-7b00-0000-0000-000000000001', 'CARD_WEEKLY', 'fake') ->> 'reference')::uuid;
select is((select status::text from public.subscriptions where id = (select id from refs where n = 'm1')), 'EXPIRED',
  'starting a new checkout closes the earlier open one');

-- ---------------------------------------------------------------------------
-- First charge, idempotency, rejected events
-- ---------------------------------------------------------------------------
select is(public.apply_card_event('fake', pg_temp.ev('evt_1', 'CHECKOUT_COMPLETED', now() - interval '1 hour',
  jsonb_build_object('reference', (select id from refs where n = 'm2'), 'subscription_ref', 'sub_musu', 'customer_ref', 'cus_musu',
                     'charge_id', 'ch_1', 'amount', 3.00, 'currency', 'USD', 'period_end', now() + interval '6 days 23 hours'))),
  '{"outcome": "APPLIED", "result": "ACTIVATED", "cancel_at_processor": false}'::jsonb, 'BR-26: a verified completed checkout activates the subscription');
select ok(public.has_casual_access('bbbbbbbb-7b00-0000-0000-000000000001'), 'access is live after the first charge');
select is((select status::text from public.subscriptions where processor_subscription_id = 'sub_musu'), 'ACTIVE', 'subscription ACTIVE');
select is((select transaction_key from public.payments where provider_transaction_id = 'ch_1'), 'CARD:fake:ch_1',
  'card payments get a prefixed key that no mobile money key can equal');
reset role;
select isnt(public.transaction_key('CARD:fake:ch_1'), 'CARD:fake:ch_1', 'BR-35 keys (letters and digits only) never contain the card prefix');
select is((select count(*)::int from public.card_customers where user_id = 'bbbbbbbb-7b00-0000-0000-000000000001'), 1,
  'the processor customer is remembered (manage link)');
set local role service_role;

select is(public.apply_card_event('fake', pg_temp.ev('evt_1', 'CHECKOUT_COMPLETED', now() - interval '1 hour',
  jsonb_build_object('reference', (select id from refs where n = 'm2'), 'subscription_ref', 'sub_musu',
                     'charge_id', 'ch_1', 'amount', 3.00, 'currency', 'USD', 'period_end', now() + interval '6 days 23 hours'))),
  '{"outcome": "DUPLICATE", "cancel_at_processor": false}'::jsonb, '§22: a replayed event is a no-op');
select is((select count(*)::int from public.payments where processor_subscription_ref = 'sub_musu'), 1, 'replay: no second payment');
select is((select count(*)::int from public.payment_events where processor = 'fake' and processor_event_id = 'evt_1'), 1,
  'replay: the event is stored once');
select is((select raw_payload ->> 'subscription_ref' from public.payment_events where processor_event_id = 'evt_1'), 'sub_musu',
  'the verified event is stored as received');

select is(public.apply_card_event('fake', pg_temp.ev('evt_2', 'CHECKOUT_COMPLETED', now(),
  jsonb_build_object('reference', gen_random_uuid(), 'subscription_ref', 'sub_x', 'charge_id', 'ch_x', 'amount', 3, 'currency', 'USD',
                     'period_end', now() + interval '7 days'))) ->> 'outcome', 'REJECTED', 'an unknown checkout is rejected');
select is((select raw_payload ->> 'reason' from public.payment_events where type = 'CARD_EVENT_REJECTED'
           and raw_payload ->> 'event_id' = 'evt_2'), 'UNKNOWN_CHECKOUT', 'the rejection is recorded with its reason');
select is(public.apply_card_event('fake', pg_temp.ev('evt_2b', 'SOMETHING_ELSE', now(), '{"subscription_ref":"sub_musu"}')) ->> 'reason',
  'UNKNOWN_EVENT_TYPE', 'an unknown event type is rejected, not guessed');
select throws_ok($$ select public.apply_card_event('fake', '{"type":"CHECKOUT_COMPLETED"}'::jsonb) $$, '22023', 'BAD_EVENT',
  'an event without an ID is refused before anything is stored');
select throws_ok($$ select public.apply_card_event('Fake!', pg_temp.ev('evt_bad', 'CHECKOUT_COMPLETED', now())) $$, '22023', 'BAD_EVENT',
  'a malformed processor name is refused');

select throws_ok($$ select public.start_card_checkout('bbbbbbbb-7b00-0000-0000-000000000001', 'CARD_MONTHLY', 'fake') $$,
  '22023', 'CARD_SUBSCRIPTION_ACTIVE', 'one card subscription at a time');
reset role;
select ok(public.has_active_card_subscription('bbbbbbbb-7b00-0000-0000-000000000001'), 'BR-41: card subscription counts as active');
set local role service_role;

-- ---------------------------------------------------------------------------
-- Renewals, failed renewal with grace (BR-40 / OD-20), stale events
-- ---------------------------------------------------------------------------
select is(public.apply_card_event('fake', pg_temp.ev('evt_3', 'RENEWAL_SUCCEEDED', now() - interval '30 minutes',
  jsonb_build_object('subscription_ref', 'sub_musu', 'charge_id', 'ch_2', 'amount', 3.00, 'currency', 'USD',
                     'period_end', now() + interval '13 days 23 hours'))) ->> 'result', 'RENEWED', 'a renewal extends the period');
select is((select expires_at from public.subscriptions where processor_subscription_id = 'sub_musu'),
  now() + interval '13 days 23 hours', 'renewal: access until the new period end');
select is((select count(*)::int from public.payments where processor_subscription_ref = 'sub_musu'), 2, 'renewal: a new payment row (BR-29)');
select is(public.apply_card_event('fake', pg_temp.ev('evt_3b', 'RENEWAL_SUCCEEDED', now() - interval '29 minutes',
  jsonb_build_object('subscription_ref', 'sub_musu', 'charge_id', 'ch_2', 'amount', 3.00, 'currency', 'USD',
                     'period_end', now() + interval '13 days 23 hours'))) ->> 'result', 'IGNORED_CHARGE_RECORDED',
  'the same charge under a new event ID is not counted twice');
select is(public.apply_card_event('fake', pg_temp.ev('evt_eur', 'RENEWAL_SUCCEEDED', now() - interval '28 minutes',
  jsonb_build_object('subscription_ref', 'sub_musu', 'charge_id', 'ch_eur', 'amount', 3.00, 'currency', 'EUR',
                     'period_end', now() + interval '20 days'))) ->> 'reason', 'CURRENCY_NOT_SUPPORTED', 'OD-2: USD only');

select is(public.apply_card_event('fake', pg_temp.ev('evt_4', 'RENEWAL_FAILED', now() - interval '10 minutes',
  '{"subscription_ref":"sub_musu"}')) ->> 'result', 'PAYMENT_FAILED', 'BR-40: a failed renewal enters PAYMENT_FAILED');
select is((select expires_at from public.subscriptions where processor_subscription_id = 'sub_musu'),
  now() + interval '13 days 23 hours' + interval '48 hours', 'BR-40: access runs for the grace period (OD-20 setting) after the period end');
select ok(public.has_casual_access('bbbbbbbb-7b00-0000-0000-000000000001', now() + interval '13 days 23 hours' + interval '47 hours'),
  'BR-40: still in access during the grace period');
select ok(not public.has_casual_access('bbbbbbbb-7b00-0000-0000-000000000001', now() + interval '13 days 23 hours' + interval '49 hours'),
  'BR-40: access ends when the grace period ends');
select is(public.apply_card_event('fake', pg_temp.ev('evt_5', 'RENEWAL_FAILED', now() - interval '5 minutes',
  '{"subscription_ref":"sub_musu"}')) ->> 'result', 'IGNORED_GRACE_USED', 'a failed retry does not extend the grace period');
select is(public.apply_card_event('fake', pg_temp.ev('evt_old', 'RENEWAL_FAILED', now() - interval '20 minutes',
  '{"subscription_ref":"sub_musu"}')) ->> 'result', 'IGNORED_STALE', 'a failure older than the last event applied is stale');
select is(public.apply_card_event('fake', pg_temp.ev('evt_6', 'RENEWAL_SUCCEEDED', now() - interval '4 minutes',
  jsonb_build_object('subscription_ref', 'sub_musu', 'charge_id', 'ch_3', 'amount', 3.00, 'currency', 'USD',
                     'period_end', now() + interval '20 days 23 hours'))) ->> 'result', 'RENEWED', 'a successful retry recovers');
select is((select status::text from public.subscriptions where processor_subscription_id = 'sub_musu'), 'ACTIVE',
  'after a successful retry the subscription is ACTIVE again');

-- ---------------------------------------------------------------------------
-- Cancel at period end (BR-40)
-- ---------------------------------------------------------------------------
insert into refs select 'musu', id from public.subscriptions where processor_subscription_id = 'sub_musu';
select throws_ok($$ select public.member_cancel_card_subscription('bbbbbbbb-7b00-0000-0000-000000000002', (select id from refs where n = 'musu')) $$,
  '22023', 'NOTHING_TO_CANCEL', 'a member cannot cancel someone else''s subscription');
select lives_ok($$ select public.member_cancel_card_subscription('bbbbbbbb-7b00-0000-0000-000000000001', (select id from refs where n = 'musu')) $$,
  'the member cancels');
select is((select status::text || ':' || cancel_at_period_end || ':' || auto_renew from public.subscriptions
           where id = (select id from refs where n = 'musu')), 'CANCELLED:true:false', 'cancel: CANCELLED, will not renew');
select ok(public.has_casual_access('bbbbbbbb-7b00-0000-0000-000000000001', now() + interval '20 days 22 hours'),
  'BR-40: a cancelled subscription keeps access until the period ends');
select ok(not public.has_casual_access('bbbbbbbb-7b00-0000-0000-000000000001', now() + interval '20 days 23 hours 1 minute'),
  'BR-40: and not after');
select is((select cancel_at_period_end from public.member_card_subscription('bbbbbbbb-7b00-0000-0000-000000000001')), true,
  'My profile shows the cancellation');
select lives_ok($$ select public.member_cancel_card_subscription('bbbbbbbb-7b00-0000-0000-000000000001', (select id from refs where n = 'musu')) $$,
  'cancelling twice is a no-op');
select is((select count(*)::int from public.payment_events where type = 'CARD_CANCEL_REQUESTED'
           and raw_payload ->> 'subscription_id' = (select id from refs where n = 'musu')::text), 1, 'the cancel request is logged once');
select is(public.apply_card_event('fake', pg_temp.ev('evt_7', 'CANCEL_SCHEDULED', now() - interval '1 minute',
  '{"subscription_ref":"sub_musu"}')) ->> 'result', 'CANCELLED', 'the processor''s own cancel event agrees');

-- ---------------------------------------------------------------------------
-- Disputes and refunds (§16 SUSPENDED / REFUNDED)
-- ---------------------------------------------------------------------------
select is(public.apply_card_event('fake', pg_temp.ev('evt_8', 'DISPUTE_OPENED', now(), '{"subscription_ref":"sub_musu","charge_id":"ch_3","dispute_id":"dp_1"}')) ->> 'result',
  'SUSPENDED', 'a processor dispute suspends the subscription');
select ok(not public.has_casual_access('bbbbbbbb-7b00-0000-0000-000000000001'), 'no access while suspended');
select is(public.apply_card_event('fake', pg_temp.ev('evt_9', 'DISPUTE_CLOSED', now(), '{"subscription_ref":"sub_musu","won":true,"dispute_id":"dp_1"}')) ->> 'result',
  'RESTORED', 'a won dispute restores it');
select is((select status::text from public.subscriptions where id = (select id from refs where n = 'musu')), 'CANCELLED',
  'restored to the state it had (cancelled at period end)');
select is(public.apply_card_event('fake', pg_temp.ev('evt_10', 'REFUNDED', now(), '{"subscription_ref":"sub_musu","charge_id":"ch_1"}')) ->> 'result',
  'REFUNDED_EARLIER_CHARGE', 'refunding an earlier charge leaves the current period alone');
select is(public.apply_card_event('fake', pg_temp.ev('evt_11', 'REFUNDED', now(), '{"subscription_ref":"sub_musu","charge_id":"ch_3"}')) ->> 'result',
  'REFUNDED', 'refunding the charge for the current period ends access');
select ok(not public.has_casual_access('bbbbbbbb-7b00-0000-0000-000000000001'), 'no access after a refund');
select is((select count(*)::int from public.payment_events e join public.payments p on p.id = e.payment_id
           where p.provider_transaction_id = 'ch_3' and e.type = 'STATUS_CHANGED' and e.raw_payload ->> 'to' = 'REFUNDED'), 1,
  'BR-29: the refund is a logged status change, money fields untouched');
reset role;
select throws_ok($$ update public.payments set amount = 1 where provider_transaction_id = 'ch_3' $$, '42501', 'PAYMENT_IMMUTABLE',
  'BR-29: card payment amounts never change');
select throws_ok($$ update public.payments set processor_subscription_ref = 'other' where provider_transaction_id = 'ch_3' $$, '42501',
  'PAYMENT_IMMUTABLE', 'BR-29: nor the subscription a charge belongs to');
select throws_ok($$ update public.subscriptions set expires_at = now() + interval '1 year' where id = (select id from refs where n = 'musu') $$,
  '42501', 'SUBSCRIPTION_IMMUTABLE', 'card subscriptions change only through the card functions');

-- ---------------------------------------------------------------------------
-- Late completion of a closed checkout; OD-20 unset; OD-19
-- ---------------------------------------------------------------------------
set local role service_role;
insert into refs select 'h1', (public.start_card_checkout('bbbbbbbb-7b00-0000-0000-000000000002', 'CARD_WEEKLY', 'fake') ->> 'reference')::uuid;
insert into refs select 'h2', (public.start_card_checkout('bbbbbbbb-7b00-0000-0000-000000000002', 'CARD_WEEKLY', 'fake') ->> 'reference')::uuid;
select is(public.apply_card_event('fake', pg_temp.ev('evt_h1', 'CHECKOUT_COMPLETED', now(),
  jsonb_build_object('reference', (select id from refs where n = 'h1'), 'subscription_ref', 'sub_hawa',
                     'charge_id', 'ch_h1', 'amount', 3.00, 'currency', 'USD', 'period_end', now() + interval '7 days'))) ->> 'result',
  'ACTIVATED', 'a member who paid a checkout that was closed meanwhile still gets what they paid for');
reset role;
update public.app_settings set value = null where key = 'card.grace_hours';
set local role service_role;
select throws_ok($$ select public.apply_card_event('fake', pg_temp.ev('evt_h2', 'RENEWAL_FAILED', now(), '{"subscription_ref":"sub_hawa"}')) $$,
  'P0001', null, 'OD-20 unset: a failed renewal is not guessed; the webhook fails so the processor retries');
select is((select count(*)::int from public.payment_events where processor_event_id = 'evt_h2'), 0,
  'and the event is not marked as seen, so the retry is applied');
reset role;
update public.app_settings set value = '48'::jsonb where key = 'card.grace_hours';

-- Kebeh has an active mobile money pass (inserted the way approve_payment_claim does).
insert into public.payments (id, user_id, plan_id, source, provider, provider_transaction_id, transaction_key, amount, currency, status, paid_at)
values ('bbbbbbbb-7b00-0000-0000-0000000000f1', 'bbbbbbbb-7b00-0000-0000-000000000004',
        (select id from public.subscription_plans where code = 'MM_7DAY'), 'MOBILE_MONEY', 'ORANGE_MONEY', 'OM7B0001', 'OM7B0001',
        5.00, 'USD', 'SUCCEEDED', now());
select set_config('wk.claim_approval', 'on', true);
insert into public.subscriptions (user_id, plan_id, source, status, starts_at, expires_at, source_payment_id)
values ('bbbbbbbb-7b00-0000-0000-000000000004', (select id from public.subscription_plans where code = 'MM_7DAY'),
        'MOBILE_MONEY', 'ACTIVE', now(), now() + interval '7 days', 'bbbbbbbb-7b00-0000-0000-0000000000f1');
select set_config('wk.claim_approval', 'off', true);
update public.app_settings set value = 'false'::jsonb where key = 'card.allow_during_mobile_money_pass';
set local role service_role;
select throws_ok($$ select public.start_card_checkout('bbbbbbbb-7b00-0000-0000-000000000004', 'CARD_WEEKLY', 'fake') $$,
  '22023', 'MOBILE_MONEY_PASS_ACTIVE', 'OD-19 = no: a card subscription can''t start during a mobile money pass');
reset role;
update public.app_settings set value = null where key = 'card.allow_during_mobile_money_pass';
set local role service_role;
select throws_ok($$ select public.start_card_checkout('bbbbbbbb-7b00-0000-0000-000000000004', 'CARD_WEEKLY', 'fake') $$,
  'P0001', null, 'OD-19 unset: the choice is not guessed');
reset role;
update public.app_settings set value = 'true'::jsonb where key = 'card.allow_during_mobile_money_pass';
set local role service_role;
select is((public.member_payment_options('bbbbbbbb-7b00-0000-0000-000000000004') ->> 'mobile_money_active')::boolean, true,
  'the Get access screen knows to warn about the running pass (OD-19)');
select lives_ok($$ select public.start_card_checkout('bbbbbbbb-7b00-0000-0000-000000000004', 'CARD_WEEKLY', 'fake') $$,
  'OD-19 = yes: allowed, both run at once');

-- ---------------------------------------------------------------------------
-- Self-audit round 1: grace once per period, out-of-order events, second paid checkout, amounts
-- ---------------------------------------------------------------------------
reset role;
select set_config('wk.subscription_admin', 'on', true);
update public.subscriptions set period_end = now() - interval '3 days', expires_at = now() - interval '3 days',
       starts_at = now() - interval '10 days', last_event_at = now() - interval '3 days'
where processor_subscription_id = 'sub_hawa';
select set_config('wk.subscription_admin', 'off', true);
set local role service_role;
select is(public.apply_card_event('fake', pg_temp.ev('evt_g1', 'RENEWAL_FAILED', now() - interval '2 days 23 hours',
  '{"subscription_ref":"sub_hawa"}')) ->> 'result', 'PAYMENT_FAILED', 'renewal fails: grace starts');
select ok(public.expire_subscriptions() >= 1, 'grace runs out and the tidy job expires it');
select is(public.apply_card_event('fake', pg_temp.ev('evt_g2', 'RENEWAL_FAILED', now() - interval '1 hour',
  '{"subscription_ref":"sub_hawa"}')) ->> 'result', 'IGNORED_GRACE_USED', 'BR-40: a later failed retry never gives a second grace period');
select ok(not public.has_casual_access('bbbbbbbb-7b00-0000-0000-000000000002'), 'BR-40: EXPIRED after the grace period');

select throws_ok($$ select public.apply_card_event('fake', pg_temp.ev('evt_early', 'REFUNDED', now(),
  '{"subscription_ref":"sub_not_yet","charge_id":"ch_zz"}')) $$, '55000', 'UNKNOWN_SUBSCRIPTION',
  'an event for a subscription we don''t know yet fails so the processor retries it');
select is((select count(*)::int from public.payment_events where processor_event_id = 'evt_early'), 0,
  'and is not marked as seen');
select is(public.apply_card_event('fake', pg_temp.ev('evt_old2', 'REFUNDED', now() - interval '4 days',
  '{"subscription_ref":"sub_not_yet","charge_id":"ch_zz"}')) ->> 'reason', 'UNKNOWN_SUBSCRIPTION',
  'after three days it is recorded as rejected instead');
select throws_ok($$ select public.apply_card_event('fake', pg_temp.ev('evt_wrongsub', 'REFUNDED', now(),
  '{"subscription_ref":"sub_hawa","charge_id":"ch_3"}')) $$, '55000', 'UNKNOWN_CHARGE',
  'a refund only touches a charge of the same subscription');

-- Kebeh: a second paid checkout while a card subscription is active is kept for a refund, not activated.
insert into refs select 'k1', (public.start_card_checkout('bbbbbbbb-7b00-0000-0000-000000000004', 'CARD_WEEKLY', 'fake') ->> 'reference')::uuid;
insert into refs select 'k2', (public.start_card_checkout('bbbbbbbb-7b00-0000-0000-000000000004', 'CARD_WEEKLY', 'fake') ->> 'reference')::uuid;
select is(public.apply_card_event('fake', pg_temp.ev('evt_k2', 'CHECKOUT_COMPLETED', now(),
  jsonb_build_object('reference', (select id from refs where n = 'k2'), 'subscription_ref', 'sub_k2',
                     'charge_id', 'ch_k2', 'amount', 3.00, 'currency', 'USD', 'period_end', now() + interval '7 days'))) ->> 'result',
  'ACTIVATED', 'the newer checkout activates');
select is(public.apply_card_event('fake', pg_temp.ev('evt_k1', 'CHECKOUT_COMPLETED', now(),
  jsonb_build_object('reference', (select id from refs where n = 'k1'), 'subscription_ref', 'sub_k1',
                     'charge_id', 'ch_k1', 'amount', 3.00, 'currency', 'USD', 'period_end', now() + interval '7 days'))) ->> 'result',
  'NEEDS_REFUND', 'a second paid checkout is recorded for a refund, not a second subscription');
select is((select count(*)::int from public.payment_events where type = 'CARD_NEEDS_REFUND'
           and raw_payload ->> 'subscription_ref' = 'sub_k1'), 1, 'staff see it needs a refund');
select is(public.apply_card_event('fake', pg_temp.ev('evt_k1r', 'RENEWAL_SUCCEEDED', now(),
  jsonb_build_object('subscription_ref', 'sub_k1', 'charge_id', 'ch_k1r', 'amount', 3.00, 'currency', 'USD',
                     'period_end', now() + interval '14 days'))) ->> 'result', 'NEEDS_REFUND',
  'a charge on a refunded subscription never restores access; it is kept for a refund');
select is(public.apply_card_event('fake', pg_temp.ev('evt_k2r', 'RENEWAL_SUCCEEDED', now(),
  jsonb_build_object('subscription_ref', 'sub_k2', 'charge_id', 'ch_k2r', 'amount', 0.50, 'currency', 'USD',
                     'period_end', now() + interval '14 days'))) ->> 'result', 'NEEDS_REFUND',
  'a charge that isn''t the plan price gives no time');
select is(public.apply_card_event('fake', pg_temp.ev('evt_k2r2', 'RENEWAL_SUCCEEDED', now(),
  jsonb_build_object('subscription_ref', 'sub_k2', 'charge_id', 'ch_k2r2', 'amount', 3.00, 'currency', 'USD',
                     'period_end', now() + interval '300 days'))) ->> 'result', 'RENEWED', 'a renewal');
reset role;
select ok((select period_end from public.subscriptions where processor_subscription_id = 'sub_k2') <= now() + interval '15 days 1 minute',
  'a period end beyond the plan''s length is capped');
set local role service_role;

-- Self-audit round 2
select is((public.apply_card_event('fake', pg_temp.ev('evt_k1r', 'RENEWAL_SUCCEEDED', now(), '{"subscription_ref":"sub_k1"}'))
           ->> 'cancel_at_processor')::boolean, true,
  'a replay of an event on a subscription awaiting refund still asks the server to cancel renewals (retry)');
reset role;
update public.subscription_plans set price = 4.00 where code = 'CARD_WEEKLY';
set local role service_role;
select is(public.apply_card_event('fake', pg_temp.ev('evt_k2r3', 'RENEWAL_SUCCEEDED', now(),
  jsonb_build_object('subscription_ref', 'sub_k2', 'charge_id', 'ch_k2r3', 'amount', 3.00, 'currency', 'USD',
                     'period_end', now() + interval '21 days'))) ->> 'result', 'RENEWED',
  'a later price change never breaks existing subscribers (the price is locked at checkout)');
reset role;
update public.subscription_plans set price = 3.00 where code = 'CARD_WEEKLY';
set local role service_role;
select is(public.apply_card_event('fake', pg_temp.ev('evt_k2late', 'RENEWAL_SUCCEEDED', now(),
  jsonb_build_object('subscription_ref', 'sub_k2', 'charge_id', 'ch_k2old', 'amount', 3.00, 'currency', 'USD',
                     'period_end', now() + interval '7 days'))) ->> 'result', 'CHARGE_RECORDED',
  'a late charge for a period already covered is recorded only');
select is(public.apply_card_event('fake', pg_temp.ev('evt_k2d', 'DISPUTE_OPENED', now(), '{"dispute_id":"dp_k2","subscription_ref":"sub_k2"}')) ->> 'result',
  'SUSPENDED', 'dispute opened');
select is(public.apply_card_event('fake', pg_temp.ev('evt_k2bad', 'RENEWAL_SUCCEEDED', now(),
  jsonb_build_object('subscription_ref', 'sub_k2', 'charge_id', 'ch_k2bad', 'amount', 9.99, 'currency', 'USD',
                     'period_end', now() + interval '28 days'))) ->> 'result', 'NEEDS_REFUND', 'a wrong-amount charge during a dispute');
reset role;
select is((select status::text from public.subscriptions where processor_subscription_id = 'sub_k2'), 'SUSPENDED',
  'a wrong-amount charge never lifts a dispute suspension');
set local role service_role;
select is(public.apply_card_event('fake', pg_temp.ev('evt_m_closed', 'DISPUTE_CLOSED', now(), '{"dispute_id":"dp_m","subscription_ref":"sub_hawa","won":true}')) ->> 'result',
  'IGNORED_STATE', 'a dispute closed before it was opened (out of order) is ignored');
select is(public.apply_card_event('fake', pg_temp.ev('evt_m_opened', 'DISPUTE_OPENED', now() - interval '1 minute', '{"dispute_id":"dp_m","subscription_ref":"sub_hawa"}')) ->> 'result',
  'IGNORED_STATE', 'and the "opened" arriving afterwards no longer suspends it');

-- Self-audit round 3: a dispute opened before a later charge still applies; a lost dispute refunds
-- whatever the state; the cancel request stops once the processor confirmed it.
select is(public.apply_card_event('fake', pg_temp.ev('evt_k2won', 'DISPUTE_CLOSED', now(), '{"dispute_id":"dp_k2","subscription_ref":"sub_k2","won":true}')) ->> 'result',
  'RESTORED', 'dispute won');
select is(public.apply_card_event('fake', pg_temp.ev('evt_k2d2', 'DISPUTE_OPENED', now() - interval '2 days', '{"dispute_id":"dp_k2","subscription_ref":"sub_k2"}')) ->> 'result',
  'IGNORED_STATE', 'a dispute already closed can''t be reopened by a late event');
select is(public.apply_card_event('fake', pg_temp.ev('evt_k2lost', 'DISPUTE_CLOSED', now(),
  '{"dispute_id":"dp_k2l","subscription_ref":"sub_k2","won":false,"charge_id":"ch_k2r3"}')) ->> 'result', 'REFUNDED',
  'a lost dispute ends access even if the "opened" event never suspended it');
select ok(not public.has_casual_access('bbbbbbbb-7b00-0000-0000-000000000004', now() + interval '8 days'),
  'no card access after a lost dispute (the mobile money pass has ended by then)');
select is((public.apply_card_event('fake', pg_temp.ev('evt_k2lost', 'DISPUTE_CLOSED', now(), '{"subscription_ref":"sub_k2"}')) ->> 'cancel_at_processor')::boolean, true,
  'renewals must be stopped at the processor');
select lives_ok($$ select public.mark_processor_cancelled('fake', 'sub_k2') $$, 'the server records the processor confirmed');
select is((public.apply_card_event('fake', pg_temp.ev('evt_k2lost', 'DISPUTE_CLOSED', now(), '{"subscription_ref":"sub_k2"}')) ->> 'cancel_at_processor')::boolean, false,
  'and stops asking (no endless retries)');

-- Self-audit round 4: disputes tracked by ID.
insert into refs select 'f1', (public.start_card_checkout('bbbbbbbb-7b00-0000-0000-000000000004', 'CARD_WEEKLY', 'fake') ->> 'reference')::uuid;
select is(public.apply_card_event('fake', pg_temp.ev('evt_f1', 'CHECKOUT_COMPLETED', now() - interval '1 hour',
  jsonb_build_object('reference', (select id from refs where n = 'f1'), 'subscription_ref', 'sub_f1',
                     'charge_id', 'ch_f1', 'amount', 3.00, 'currency', 'USD', 'period_end', now() + interval '7 days'))) ->> 'result',
  'ACTIVATED', 'a new card subscription');
select is(public.apply_card_event('fake', pg_temp.ev('evt_f1r', 'RENEWAL_SUCCEEDED', now(),
  jsonb_build_object('subscription_ref', 'sub_f1', 'charge_id', 'ch_f1r', 'amount', 3.00, 'currency', 'USD',
                     'period_end', now() + interval '14 days'))) ->> 'result', 'RENEWED', 'renewed');
select is(public.apply_card_event('fake', pg_temp.ev('evt_fd1', 'DISPUTE_OPENED', now(), '{"subscription_ref":"sub_f1","dispute_id":"dp_a","charge_id":"ch_f1"}')) ->> 'result',
  'SUSPENDED', 'first dispute');
select is(public.apply_card_event('fake', pg_temp.ev('evt_fd2', 'DISPUTE_OPENED', now(), '{"subscription_ref":"sub_f1","dispute_id":"dp_b","charge_id":"ch_f1r"}')) ->> 'result',
  'SUSPENDED', 'second dispute');
select is(public.apply_card_event('fake', pg_temp.ev('evt_fd3', 'DISPUTE_CLOSED', now(), '{"subscription_ref":"sub_f1","dispute_id":"dp_b","won":true}')) ->> 'result',
  'IGNORED_STATE', 'winning one dispute doesn''t lift the suspension while another is open');
select is(public.apply_card_event('fake', pg_temp.ev('evt_fd4', 'DISPUTE_CLOSED', now(),
  '{"subscription_ref":"sub_f1","dispute_id":"dp_a","won":false,"charge_id":"ch_f1"}')) ->> 'result',
  'REFUNDED_EARLIER_CHARGE', 'losing a dispute over an earlier charge refunds that charge');
reset role;
select is((select status::text from public.subscriptions where processor_subscription_id = 'sub_f1'), 'ACTIVE',
  'and the paid current period is restored once no dispute is open (no endless suspension)');
set local role service_role;

-- ---------------------------------------------------------------------------
-- Invalid signatures, renewal reminders, tidy job, account purge
-- ---------------------------------------------------------------------------
select ok(public.log_invalid_card_webhook('fake', 'BAD_SIGNATURE', repeat('x', 5000)), 'a bad signature is logged');
select is((select length(raw_payload ->> 'prefix') || ':' || (raw_payload ->> 'length') || ':' || length(raw_payload ->> 'sha256')
                  || ':' || signature_valid
           from public.payment_events where type = 'CARD_WEBHOOK_INVALID' order by received_at desc limit 1),
  '256:5000:64:false', 'logged as invalid: a hash and a short prefix of the body only');
select is((select count(*)::int from generate_series(1, 120) g where public.log_invalid_card_webhook('fake', 'BAD_SIGNATURE', 'x')), 99,
  'a flood of forged requests stops being logged after 100 in ten minutes');

select is((select count(*)::int from public.card_renewals_due() where user_id = 'bbbbbbbb-7b00-0000-0000-000000000002'), 0,
  'no reminder a week before renewal');
reset role;
select set_config('wk.subscription_admin', 'on', true);
update public.subscriptions set status = 'ACTIVE', period_end = now() + interval '3 hours', expires_at = now() + interval '3 hours'
where processor_subscription_id = 'sub_hawa';
insert into refs select 'k3', (public.start_card_checkout('bbbbbbbb-7b00-0000-0000-000000000001', 'CARD_WEEKLY', 'fake') ->> 'reference')::uuid;
update public.subscriptions set starts_at = now() - interval '3 hours', expires_at = now() - interval '2 hours'
where id = (select id from refs where n = 'k3');
select set_config('wk.subscription_admin', 'off', true);
set local role service_role;
select is((select count(*)::int from public.card_renewals_due() where user_id = 'bbbbbbbb-7b00-0000-0000-000000000002'), 1,
  'the renewal reminder hook lists a renewal within the lead time');
select ok(public.expire_subscriptions() >= 1, 'the tidy job closes abandoned checkouts');
select is((select status::text from public.subscriptions where id = (select id from refs where n = 'k3')),
  'EXPIRED', 'an abandoned checkout is EXPIRED');
reset role;

delete from auth.users where id = 'bbbbbbbb-7b00-0000-0000-000000000002';
select is((select count(*)::int from public.payments where provider_transaction_id = 'ch_h1' and user_id is null), 1,
  'an account purge removes the card subscription but keeps the payment record (unlinked)');

select * from finish();
rollback;
