-- Phase 11: notifications (spec §16, §20; OD-25 in-app + web push).
begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

-- Fixtures (fictional): Musu, Joseph, Prince — verified ACTIVE members looking for Relationship and Casual.
create function pg_temp.member(p_id uuid, p_name text, p_gender text, p_seeking text) returns void language plpgsql as $$
begin
  insert into auth.users (id, phone, aud, role) values (p_id, '23177011' || substr(replace(p_id::text, '-', ''), 29, 4), 'authenticated', 'authenticated');
  insert into public.profiles (user_id, date_of_birth, display_name, gender, seeking_genders, area_id, intent_relationship, intent_casual, is_profile_complete)
  values (p_id, '1996-03-04', p_name, p_gender::public.gender, array[p_seeking]::public.gender[], (select id from public.areas where name = 'Sinkor'), true, true, true);
  insert into public.profile_photos (user_id, status, storage_path, sort_order, is_primary, reviewed_as_primary, submitted_at)
  select p_id, 'APPROVED', gen_random_uuid() || '.webp', n, n = 0, n = 0, now() from generate_series(0, 2) n;
  insert into public.verifications (user_id, pose_prompt, status, selfie_storage_path, submitted_at, reviewed_at)
  values (p_id, 'Touch your ear', 'VERIFIED', gen_random_uuid() || '.webp', now(), now());
  update public.users set status = 'ACTIVE' where id = p_id;
end $$;
create function pg_temp.give_pass(p_user uuid, p_start timestamptz, p_hours integer) returns uuid language plpgsql as $$
declare v_pay uuid; v_sub uuid; v_key text := 'OM9' || substr(md5(p_user::text || clock_timestamp()::text), 1, 10);
begin
  insert into public.payments (user_id, plan_id, source, provider, provider_transaction_id, transaction_key, amount, currency, status, paid_at)
  values (p_user, (select id from public.subscription_plans where code = 'MM_DAY'), 'MOBILE_MONEY', 'ORANGE_MONEY', v_key, v_key, 1.00, 'USD', 'SUCCEEDED', now())
  returning id into v_pay;
  perform set_config('wk.claim_approval', 'on', true);
  insert into public.subscriptions (user_id, plan_id, source, status, starts_at, expires_at, source_payment_id)
  values (p_user, (select id from public.subscription_plans where code = 'MM_DAY'), 'MOBILE_MONEY', 'ACTIVE', p_start, p_start + make_interval(hours => p_hours), v_pay)
  returning id into v_sub;
  perform set_config('wk.claim_approval', 'off', true);
  return v_sub;
end $$;

select pg_temp.member('cccccccc-1100-0000-0000-000000000001', 'Musu', 'WOMAN', 'MAN');
select pg_temp.member('cccccccc-1100-0000-0000-000000000002', 'Joseph', 'MAN', 'WOMAN');
select pg_temp.member('cccccccc-1100-0000-0000-000000000003', 'Prince', 'MAN', 'WOMAN');
create temp table r (n text primary key, id uuid);
grant all on r to service_role;
create function pg_temp.count(p_user uuid, p_type text) returns int language sql as $$
  select count(*)::int from public.notifications where user_id = p_user and type::text = p_type;
$$;

-- ---------------------------------------------------------------------------
-- Clients: no direct access
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-1100-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select * from public.push_subscriptions $$, '42501', null, 'members cannot read push subscriptions');
select throws_ok($$ select public.member_notifications('cccccccc-1100-0000-0000-000000000002') $$, '42501', null,
  'members cannot read notifications through the server function (the server passes the session user)');
select throws_ok($$ select public.save_push_subscription('cccccccc-1100-0000-0000-000000000002', 'https://push.example.test/x', repeat('a', 40), repeat('b', 16)) $$,
  '42501', null, 'members cannot register a device for someone else');
select is((select count(*)::int from public.notifications where user_id <> 'cccccccc-1100-0000-0000-000000000001'), 0,
  'RLS: a member sees only their own notifications');
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- Requests (§14): received, accepted; a decline is never told (Q45)
-- ---------------------------------------------------------------------------
insert into public.message_requests (sender_id, recipient_id, body, body_hash, expires_at)
values ('cccccccc-1100-0000-0000-000000000002', 'cccccccc-1100-0000-0000-000000000001', 'Hi Musu, fancy a chat?', md5('x'), now() + interval '2 hours')
returning id as req1 \gset
select is(pg_temp.count('cccccccc-1100-0000-0000-000000000001', 'REQUEST_RECEIVED'), 1, 'a new request notifies the recipient');
select ok((select payload::text !~ 'fancy a chat|Joseph' from public.notifications where type = 'REQUEST_RECEIVED'),
  '§6 rule 7: the notice holds no request text and no name');
insert into public.conversations (type) values ('CASUAL') returning id as conv1 \gset
update public.message_requests set status = 'ACCEPTED', responded_at = now(), conversation_id = :'conv1' where id = :'req1';
select is((select payload ->> 'conversation_id' from public.notifications
           where user_id = 'cccccccc-1100-0000-0000-000000000002' and type = 'REQUEST_ACCEPTED'), :'conv1',
  'an accepted request notifies the sender, pointing at the chat');
insert into public.message_requests (sender_id, recipient_id, body, body_hash, expires_at)
values ('cccccccc-1100-0000-0000-000000000003', 'cccccccc-1100-0000-0000-000000000001', 'Hello', md5('y'), now() + interval '2 hours')
returning id as req2 \gset
update public.message_requests set status = 'DECLINED', responded_at = now() where id = :'req2';
select is((select count(*)::int from public.notifications where user_id = 'cccccccc-1100-0000-0000-000000000003'), 0,
  'Q45: a declined sender is never notified');

-- ---------------------------------------------------------------------------
-- Matches and messages (§11, §12)
-- ---------------------------------------------------------------------------
set local role service_role;
select public.like_user('cccccccc-1100-0000-0000-000000000001', 'cccccccc-1100-0000-0000-000000000003');
insert into r select 'conv2', (public.like_user('cccccccc-1100-0000-0000-000000000003', 'cccccccc-1100-0000-0000-000000000001') ->> 'conversation_id')::uuid;
reset role;
select is(pg_temp.count('cccccccc-1100-0000-0000-000000000001', 'MATCH_CREATED') + pg_temp.count('cccccccc-1100-0000-0000-000000000003', 'MATCH_CREATED'), 2,
  'a match notifies both members');
set local role service_role;
select public.send_message('cccccccc-1100-0000-0000-000000000003', (select id from r where n = 'conv2'), 'Hi Musu');
select public.send_message('cccccccc-1100-0000-0000-000000000003', (select id from r where n = 'conv2'), 'How was your day?');
reset role;
select is(pg_temp.count('cccccccc-1100-0000-0000-000000000001', 'MESSAGE_RECEIVED'), 1, 'one notice per conversation, however many messages');
select is((select (payload ->> 'count')::int from public.notifications where user_id = 'cccccccc-1100-0000-0000-000000000001' and type = 'MESSAGE_RECEIVED'), 2,
  '…counting the messages');
select ok((select payload::text !~ 'Hi Musu|How was' from public.notifications where type = 'MESSAGE_RECEIVED'), '§6 rule 7: no message text');
select is(pg_temp.count('cccccccc-1100-0000-0000-000000000003', 'MESSAGE_RECEIVED'), 0, 'the sender gets nothing');
set local role service_role;
select public.mark_conversation_read('cccccccc-1100-0000-0000-000000000001', (select id from r where n = 'conv2'));
reset role;
select ok((select read_at is not null from public.notifications where user_id = 'cccccccc-1100-0000-0000-000000000001' and type = 'MESSAGE_RECEIVED'),
  'reading the chat reads its notice');
set local role service_role;
select public.send_message('cccccccc-1100-0000-0000-000000000003', (select id from r where n = 'conv2'), 'Still there?');
reset role;
select is((select count(*)::int from public.notifications where user_id = 'cccccccc-1100-0000-0000-000000000001' and type = 'MESSAGE_RECEIVED' and read_at is null), 1,
  'a message after reading starts a new notice');

-- ---------------------------------------------------------------------------
-- Preferences
-- ---------------------------------------------------------------------------
set local role service_role;
select is(public.member_notification_prefs('cccccccc-1100-0000-0000-000000000001'),
  '{"matches": true, "messages": true, "requests": true, "reminders": true}'::jsonb, 'everything is on by default');
select throws_ok($$ select public.set_notification_prefs('cccccccc-1100-0000-0000-000000000001', '{"account": false}') $$, '22023', 'INVALID_PREFS',
  'account, review and payment notices can''t be turned off');
select throws_ok($$ select public.set_notification_prefs('cccccccc-1100-0000-0000-000000000001', '{"messages": "no"}') $$, '22023', 'INVALID_PREFS',
  'preferences are yes / no');
select is(public.set_notification_prefs('cccccccc-1100-0000-0000-000000000003', '{"messages": false}') ->> 'messages', 'false', 'a member turns messages off');
select public.send_message('cccccccc-1100-0000-0000-000000000001', (select id from r where n = 'conv2'), 'Yes!');
reset role;
select is(pg_temp.count('cccccccc-1100-0000-0000-000000000003', 'MESSAGE_RECEIVED'), 0, '…and gets no message notices');
select is((select (public.member_notification_prefs('cccccccc-1100-0000-0000-000000000003') ->> 'matches')::boolean), true, 'other categories stay on');

-- ---------------------------------------------------------------------------
-- Reminders (§16)
-- ---------------------------------------------------------------------------
insert into r select 'pass_j', pg_temp.give_pass('cccccccc-1100-0000-0000-000000000002', now() - interval '10 hours', 20);
set local role service_role;
select is(public.send_pass_expiry_warnings(), 1, 'a pass ending within the warning time gets a reminder');
select is(public.send_pass_expiry_warnings(), 0, '…once');
reset role;
select is((select payload ->> 'ends_at' from public.notifications where type = 'PASS_EXPIRING')::timestamptz,
  (select expires_at from public.subscriptions where id = (select id from r where n = 'pass_j')), 'the reminder says when access ends');
-- BR-28: a stacked pass moves the end, so no reminder until the last pass is near its end.
select pg_temp.give_pass('cccccccc-1100-0000-0000-000000000001', now() - interval '10 hours', 20);
select pg_temp.give_pass('cccccccc-1100-0000-0000-000000000001', now() + interval '10 hours', 48);
set local role service_role;
select is(public.send_pass_expiry_warnings(), 0, 'BR-28: a stacked pass means access isn''t ending yet');
reset role;
update public.app_settings set value = null where key = 'notifications.pass_expiry_warning_hours';
set local role service_role;
select is(public.send_pass_expiry_warnings(), 0, '§6 rule 9: no reminders while the setting is unset');
reset role;
update public.app_settings set value = '24' where key = 'notifications.pass_expiry_warning_hours';

-- Card renewal reminder: Prince's card plan renews in 10 hours.
set local role service_role;
insert into r select 'prince_ref', (public.start_card_checkout('cccccccc-1100-0000-0000-000000000003', 'CARD_WEEKLY', 'fake') ->> 'reference')::uuid;
select public.apply_card_event('fake', jsonb_build_object('id', 'evt_p11_1', 'type', 'CHECKOUT_COMPLETED', 'occurred_at', now() - interval '6 days',
  'reference', (select id from r where n = 'prince_ref'), 'subscription_ref', 'sub_prince_p11', 'customer_ref', 'cus_prince_p11',
  'charge_id', 'ch_p11', 'amount', 3.00, 'currency', 'USD', 'period_end', now() + interval '10 hours'));
select is(public.send_card_renewal_reminders(), 1, '§16: a card plan renewing soon gets a reminder');
select is(public.send_card_renewal_reminders(), 0, '…once per renewal');
select is(public.send_pass_expiry_warnings(), 0, 'a renewing card plan is not "ending"');
reset role;

-- ---------------------------------------------------------------------------
-- Member reads
-- ---------------------------------------------------------------------------
set local role service_role;
select ok((select count(*) from public.member_notifications('cccccccc-1100-0000-0000-000000000001')) >= 3, 'the inbox lists the member''s notices');
select ok(not exists (select 1 from public.member_notifications('cccccccc-1100-0000-0000-000000000001') where payload ? 'reason' or payload ? 'sender_id'),
  'the inbox never carries staff reasons or other members'' ids');
select ok(public.member_unread_notifications('cccccccc-1100-0000-0000-000000000001') > 0, 'unread count');
select public.member_mark_notifications_read('cccccccc-1100-0000-0000-000000000001');
select is(public.member_unread_notifications('cccccccc-1100-0000-0000-000000000001'), 0, 'opening the inbox reads everything');
reset role;

-- ---------------------------------------------------------------------------
-- Web push (OD-25)
-- ---------------------------------------------------------------------------
set local role service_role;
select throws_ok($$ select public.save_push_subscription('cccccccc-1100-0000-0000-000000000002', 'http://push.example.test/x', repeat('a', 40), repeat('b', 16)) $$,
  '23514', null, 'push endpoints must be https');
select public.save_push_subscription('cccccccc-1100-0000-0000-000000000002', 'https://push.example.test/joseph', repeat('a', 40), repeat('b', 16));
select is(public.member_push_device_count('cccccccc-1100-0000-0000-000000000002'), 1, 'a device is registered');
reset role;
-- A fresh request for Joseph.
insert into public.message_requests (sender_id, recipient_id, body, body_hash, expires_at)
values ('cccccccc-1100-0000-0000-000000000001', 'cccccccc-1100-0000-0000-000000000002', 'Hello Joseph', md5('z'), now() + interval '2 hours');
set local role service_role;
select is((select count(*)::int from public.claim_push_batch(array['cccccccc-1100-0000-0000-000000000002']::uuid[]) where type = 'REQUEST_RECEIVED'), 1,
  'the new notice is claimed for push with the member''s devices');
select is((select count(*)::int from public.claim_push_batch(array['cccccccc-1100-0000-0000-000000000002']::uuid[])), 0, 'and never pushed twice');
select is((select count(*)::int from public.claim_push_batch(array['cccccccc-1100-0000-0000-000000000001']::uuid[])), 0,
  'members without a device are skipped');
select public.drop_push_endpoint('https://push.example.test/joseph');
select is(public.member_push_device_count('cccccccc-1100-0000-0000-000000000002'), 0, 'a gone browser is forgotten');
reset role;

-- BR-7: a deleted member gets nothing.
update public.users set status = 'DELETED', deleted_at = now() where id = 'cccccccc-1100-0000-0000-000000000003';
insert into public.message_requests (sender_id, recipient_id, body, body_hash, expires_at)
values ('cccccccc-1100-0000-0000-000000000001', 'cccccccc-1100-0000-0000-000000000003', 'Hi', md5('w'), now() + interval '2 hours');
select is(pg_temp.count('cccccccc-1100-0000-0000-000000000003', 'REQUEST_RECEIVED'), 0, 'BR-7: a deleted account gets no notifications');

select * from finish();
rollback;
