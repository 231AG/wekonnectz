-- Phase 11 — Notifications (spec §16, §20; plan Phase 11; OD-25 in-app + web push). In-app
-- notifications for requests, accepted requests, matches and messages, reminders before a pass ends
-- and before a card plan renews; per-category preferences; web push delivery records. Notifications
-- never contain message or request text, names or phone numbers: they point to the screen to open.

-- ---------------------------------------------------------------------------
-- Types and settings
-- ---------------------------------------------------------------------------
-- The new notification types are added in 20261016900000_notification_types.sql (an enum value can't be
-- used in an index in the transaction that adds it).

insert into public.app_settings (key, value, description, kind, min_value, max_value) values
  ('notifications.pass_expiry_warning_hours', null,
   'Hours before a pass ends that the member is reminded (§16). The reminder job runs daily, so at least 24. No reminder while unset.', 'int', 24, 168)
on conflict (key) do nothing;

-- Push: when a notification was sent to the member's devices (null = not yet / not pushed).
alter table public.notifications add column pushed_at timestamptz;
create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;
create index notifications_push_due_idx on public.notifications (created_at) where pushed_at is null;
-- One unread message notice per conversation, even when two messages arrive at once.
create unique index notifications_one_unread_message_idx on public.notifications (user_id, (payload ->> 'conversation_id'))
  where type = 'MESSAGE_RECEIVED' and read_at is null;
-- The card reminder runs from the same daily job.
update public.app_settings set min_value = 24 where key = 'card.renewal_reminder_hours';

-- ---------------------------------------------------------------------------
-- Web push subscriptions (OD-25). One row per browser; only the server reads them.
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  -- Only the browsers' own push services: the server never sends to an address a member chose.
  endpoint     text not null unique check (length(endpoint) <= 1000 and endpoint ~
    '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/'),
  p256dh       text not null check (length(p256dh) between 20 and 200),
  auth         text not null check (length(auth) between 8 and 100),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated, service_role;
create policy push_subscriptions_no_client_access on public.push_subscriptions
  as restrictive for all to anon, authenticated using (false) with check (false);

-- ---------------------------------------------------------------------------
-- Preferences: per category, on unless the member turned it off. Review outcomes, account and payment
-- notifications are always sent (they change what the member can do).
-- ---------------------------------------------------------------------------
create or replace function public.notification_category(p_type public.notification_type)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type::text
    when 'REQUEST_RECEIVED' then 'requests'
    when 'REQUEST_ACCEPTED' then 'requests'
    when 'MATCH_CREATED' then 'matches'
    when 'MESSAGE_RECEIVED' then 'messages'
    when 'PASS_EXPIRING' then 'reminders'
    when 'CARD_RENEWAL_REMINDER' then 'reminders'
    else 'account'
  end;
$$;

create or replace function public.member_notification_prefs(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('requests', true, 'matches', true, 'messages', true, 'reminders', true)
         || coalesce((select s.notification_prefs from public.user_settings s where s.user_id = p_user), '{}'::jsonb);
$$;

create or replace function public.set_notification_prefs(p_user uuid, p_prefs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_prefs is null or jsonb_typeof(p_prefs) <> 'object'
     or exists (select 1 from jsonb_each(p_prefs) e
                where e.key not in ('requests', 'matches', 'messages', 'reminders') or jsonb_typeof(e.value) <> 'boolean') then
    raise exception 'INVALID_PREFS' using errcode = '22023';
  end if;
  insert into public.user_settings (user_id, notification_prefs) values (p_user, p_prefs)
  on conflict (user_id) do update
    set notification_prefs = public.user_settings.notification_prefs || excluded.notification_prefs, updated_at = now();
  return public.member_notification_prefs(p_user);
end;
$$;

-- The member-facing notifications go through here: never to a deleted or banned account, and only if
-- the member wants that category. New messages in a conversation with an unread notice already
-- waiting bump it instead of adding another (one notice per conversation).
create or replace function public.notify_member(p_user uuid, p_type public.notification_type, p_payload jsonb default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category text := public.notification_category(p_type);
begin
  if not exists (select 1 from public.users u where u.id = p_user and u.role = 'USER' and u.status in ('ACTIVE', 'SUSPENDED', 'PENDING')) then
    return;
  end if;
  if v_category <> 'account' and not coalesce((public.member_notification_prefs(p_user) ->> v_category)::boolean, true) then
    return;
  end if;
  if p_type = 'MESSAGE_RECEIVED' then
    -- Bumped, and pushed again (the phone replaces the earlier notice for that chat).
    insert into public.notifications (user_id, type, payload) values (p_user, p_type, p_payload)
    on conflict (user_id, (payload ->> 'conversation_id')) where type = 'MESSAGE_RECEIVED' and read_at is null
    do update set created_at = now(), pushed_at = null,
                  payload = public.notifications.payload
                            || jsonb_build_object('count', coalesce((public.notifications.payload ->> 'count')::int, 1) + 1);
    return;
  end if;
  insert into public.notifications (user_id, type, payload) values (p_user, p_type, coalesce(p_payload, '{}'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers: requests, accepted requests, matches, messages
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'PENDING' then
    perform public.notify_member(new.recipient_id, 'REQUEST_RECEIVED', jsonb_build_object('request_id', new.id));
  elsif tg_op = 'UPDATE' and new.status = 'ACCEPTED' and old.status <> 'ACCEPTED' and new.conversation_id is not null then
    -- A decline is never told (Q45); only an accept is.
    perform public.notify_member(new.sender_id, 'REQUEST_ACCEPTED', jsonb_build_object('conversation_id', new.conversation_id));
  end if;
  return null;
end;
$$;
create trigger message_requests_notify after insert or update of status on public.message_requests
  for each row execute function public.notify_on_request();

create or replace function public.notify_on_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notify_member(new.user_a_id, 'MATCH_CREATED', jsonb_build_object('match_id', new.id));
  perform public.notify_member(new.user_b_id, 'MATCH_CREATED', jsonb_build_object('match_id', new.id));
  return null;
end;
$$;
create trigger matches_notify after insert on public.matches
  for each row execute function public.notify_on_match();

-- A new message notifies the other member. The request text copied into a chat when it is accepted
-- keeps its original time and is not a new message.
create or replace function public.notify_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_to uuid;
begin
  if new.sender_id is null or new.created_at < now() then
    return null;
  end if;
  for v_to in select m.user_id from public.conversation_members m
              where m.conversation_id = new.conversation_id and m.user_id <> new.sender_id loop
    perform public.notify_member(v_to, 'MESSAGE_RECEIVED', jsonb_build_object('conversation_id', new.conversation_id));
  end loop;
  return null;
end;
$$;
create trigger messages_notify after insert on public.messages
  for each row execute function public.notify_on_message();

-- Reading the conversation reads its notice too.
create or replace function public.read_message_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications set read_at = now()
  where user_id = new.user_id and type = 'MESSAGE_RECEIVED' and read_at is null
    and payload ->> 'conversation_id' = new.conversation_id::text;
  return null;
end;
$$;
create trigger conversation_members_read_notice after update of last_read_at on public.conversation_members
  for each row when (new.last_read_at is distinct from old.last_read_at)
  execute function public.read_message_notice();

-- A chat that closes (unmatch, block, a deleted account) and a request no longer waiting take their
-- unread notices with them, so the bell never points at something that is gone.
create or replace function public.read_closed_notices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'conversations' then
    update public.notifications set read_at = now()
    where read_at is null and type in ('MESSAGE_RECEIVED', 'REQUEST_ACCEPTED')
      and payload ->> 'conversation_id' = new.id::text;
  else
    update public.notifications set read_at = now()
    where read_at is null and type = 'REQUEST_RECEIVED' and payload ->> 'request_id' = new.id::text;
  end if;
  return null;
end;
$$;
create trigger conversations_read_notices after update of status on public.conversations
  for each row when (new.status = 'CLOSED' and old.status is distinct from 'CLOSED')
  execute function public.read_closed_notices();
create trigger message_requests_read_notices after update of status on public.message_requests
  for each row when (old.status = 'PENDING' and new.status <> 'PENDING')
  execute function public.read_closed_notices();

-- Review, account and payment notices (Phase 4 / 7) also skip deleted and banned accounts.
create or replace function public.notify(p_user_id uuid, p_type public.notification_type, p_payload jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, type, payload)
  select p_user_id, p_type, coalesce(p_payload, '{}'::jsonb)
  where exists (select 1 from public.users u where u.id = p_user_id and u.status not in ('DELETED', 'BANNED'));
$$;

-- ---------------------------------------------------------------------------
-- Reminders (§16): before a pass ends, and before a card plan renews. Each is sent once.
-- ---------------------------------------------------------------------------
create or replace function public.send_pass_expiry_warnings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hours integer;
  v_row   record;
  v_count integer := 0;
begin
  select (value #>> '{}')::int into v_hours from public.app_settings
  where key = 'notifications.pass_expiry_warning_hours' and value is not null;
  if v_hours is null then
    return 0;
  end if;
  -- When access really ends: the end of the last running pass in the chain (BR-28 stacking). A card
  -- plan that will renew is not ending (its renewal reminder covers it).
  for v_row in
    select s.user_id, max(s.expires_at) as ends_at
    from public.subscriptions s
    where s.status in ('ACTIVE', 'CANCELLED', 'PAYMENT_FAILED') and s.expires_at > now()
    group by s.user_id
    -- An hour of slack so a late daily run never skips a pass.
    having max(s.expires_at) <= now() + make_interval(hours => v_hours + 1)
       and min(s.starts_at) <= now()
       and not bool_or(s.source = 'CARD' and s.status = 'ACTIVE' and s.auto_renew and not s.cancel_at_period_end)
  loop
    if not exists (select 1 from public.notifications n where n.user_id = v_row.user_id and n.type = 'PASS_EXPIRING'
                   and (n.payload ->> 'ends_at')::timestamptz = v_row.ends_at) then
      perform public.notify_member(v_row.user_id, 'PASS_EXPIRING', jsonb_build_object('ends_at', v_row.ends_at));
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- Renewals due for a reminder, with an hour of slack for the daily job (was exact in Phase 7b).
create or replace function public.card_renewals_due()
returns table (subscription_id uuid, user_id uuid, renews_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.user_id, s.period_end
  from public.subscriptions s
  cross join (select (value #>> '{}')::int as hours from public.app_settings
              where key = 'card.renewal_reminder_hours' and value is not null) r
  where s.source = 'CARD' and s.status = 'ACTIVE' and s.auto_renew and not s.cancel_at_period_end
    and s.period_end > now() and s.period_end <= now() + make_interval(hours => r.hours + 1)
  order by s.period_end
  limit 500;
$$;

create or replace function public.send_card_renewal_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row   record;
  v_count integer := 0;
begin
  for v_row in select * from public.card_renewals_due() loop
    if not exists (select 1 from public.notifications n where n.user_id = v_row.user_id and n.type = 'CARD_RENEWAL_REMINDER'
                   and n.payload ->> 'subscription_id' = v_row.subscription_id::text
                   and (n.payload ->> 'renews_at')::timestamptz = v_row.renews_at) then
      perform public.notify_member(v_row.user_id, 'CARD_RENEWAL_REMINDER',
        jsonb_build_object('subscription_id', v_row.subscription_id, 'renews_at', v_row.renews_at));
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Member reads (the session user only; the server passes it)
-- ---------------------------------------------------------------------------
create or replace function public.member_notifications(p_user uuid, p_limit integer default 50)
returns table (notification_id uuid, type public.notification_type, payload jsonb, created_at timestamptz, read boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.type,
         -- Only what the screen needs to link somewhere; never reasons staff wrote or other members' ids.
         n.payload - 'sender_id' - 'reason',
         n.created_at, n.read_at is not null
  from public.notifications n
  where n.user_id = p_user
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

create or replace function public.member_unread_notifications(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.notifications where user_id = p_user and read_at is null;
$$;

create or replace function public.member_mark_notifications_read(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set read_at = now() where user_id = p_user and read_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Web push: subscriptions and the outbox
-- ---------------------------------------------------------------------------
create or replace function public.save_push_subscription(p_user uuid, p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.push_subscriptions where user_id = p_user and endpoint <> p_endpoint) >= 10 then
    raise exception 'TOO_MANY_DEVICES' using errcode = '22023';
  end if;
  -- A browser belongs to whoever signed in on it last.
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (p_user, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

create or replace function public.delete_push_subscription(p_user uuid, p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where user_id = p_user and endpoint = p_endpoint;
$$;

create or replace function public.member_push_device_count(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.push_subscriptions where user_id = p_user;
$$;

-- Notifications still to push (recent, unread, to a member with a device), oldest first, with that
-- member's devices. Claims them (pushed_at) so two runs don't send twice.
create or replace function public.claim_push_batch(p_users uuid[] default null, p_limit integer default 100)
returns table (notification_id uuid, user_id uuid, type public.notification_type, payload jsonb, devices jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    with due as (
      select n.id from public.notifications n
      join public.users u on u.id = n.user_id and u.status in ('ACTIVE', 'SUSPENDED', 'PENDING')
      where n.pushed_at is null and n.read_at is null and n.created_at > now() - interval '1 hour'
        and (p_users is null or n.user_id = any(p_users))
        and exists (select 1 from public.push_subscriptions ps where ps.user_id = n.user_id)
      order by n.created_at
      limit least(greatest(coalesce(p_limit, 100), 1), 500)
      for update of n skip locked
    ), claimed as (
      update public.notifications n set pushed_at = now() from due where n.id = due.id
      returning n.id, n.user_id, n.type, n.payload
    )
    select c.id, c.user_id, c.type, c.payload - 'sender_id' - 'reason',
           (select jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth))
            from public.push_subscriptions ps where ps.user_id = c.user_id)
    from claimed c;
end;
$$;

-- Every device failed for a passing reason: send it again on the next run (while still recent).
create or replace function public.unclaim_push(p_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set pushed_at = null where id = any(p_ids) and read_at is null;
$$;

create or replace function public.member_push_endpoint_is_mine(p_user uuid, p_endpoint text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.push_subscriptions where user_id = p_user and endpoint = p_endpoint);
$$;

-- The push service said this browser is gone (404 / 410): forget it.
create or replace function public.drop_push_endpoint(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: member functions take the session user from the server (service_role only).
-- ---------------------------------------------------------------------------
revoke all on function public.notification_category(public.notification_type) from public, anon, authenticated;
revoke all on function public.member_notification_prefs(uuid) from public, anon, authenticated;
revoke all on function public.set_notification_prefs(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.notify_member(uuid, public.notification_type, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.notify_on_request() from public, anon, authenticated, service_role;
revoke all on function public.notify_on_match() from public, anon, authenticated, service_role;
revoke all on function public.notify_on_message() from public, anon, authenticated, service_role;
revoke all on function public.read_message_notice() from public, anon, authenticated, service_role;
revoke all on function public.send_pass_expiry_warnings() from public, anon, authenticated;
revoke all on function public.send_card_renewal_reminders() from public, anon, authenticated;
revoke all on function public.member_notifications(uuid, integer) from public, anon, authenticated;
revoke all on function public.member_unread_notifications(uuid) from public, anon, authenticated;
revoke all on function public.member_mark_notifications_read(uuid) from public, anon, authenticated;
revoke all on function public.save_push_subscription(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.delete_push_subscription(uuid, text) from public, anon, authenticated;
revoke all on function public.member_push_device_count(uuid) from public, anon, authenticated;
revoke all on function public.claim_push_batch(uuid[], integer) from public, anon, authenticated;
revoke all on function public.drop_push_endpoint(text) from public, anon, authenticated;
revoke all on function public.unclaim_push(uuid[]) from public, anon, authenticated;
revoke all on function public.member_push_endpoint_is_mine(uuid, text) from public, anon, authenticated;
revoke all on function public.read_closed_notices() from public, anon, authenticated, service_role;
revoke all on function public.card_renewals_due() from public, anon, authenticated;
grant execute on function public.unclaim_push(uuid[]) to service_role;
grant execute on function public.member_push_endpoint_is_mine(uuid, text) to service_role;
grant execute on function public.card_renewals_due() to service_role;

grant execute on function public.member_notification_prefs(uuid) to service_role;
grant execute on function public.set_notification_prefs(uuid, jsonb) to service_role;
grant execute on function public.send_pass_expiry_warnings() to service_role;
grant execute on function public.send_card_renewal_reminders() to service_role;
grant execute on function public.member_notifications(uuid, integer) to service_role;
grant execute on function public.member_unread_notifications(uuid) to service_role;
grant execute on function public.member_mark_notifications_read(uuid) to service_role;
grant execute on function public.save_push_subscription(uuid, text, text, text) to service_role;
grant execute on function public.delete_push_subscription(uuid, text) to service_role;
grant execute on function public.member_push_device_count(uuid) to service_role;
grant execute on function public.claim_push_batch(uuid[], integer) to service_role;
grant execute on function public.drop_push_endpoint(text) to service_role;
