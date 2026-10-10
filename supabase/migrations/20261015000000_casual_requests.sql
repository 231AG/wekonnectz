-- Phase 9 — Casual discovery & message requests (spec §13, §14, §17; BR-16, 17, 19, 21, 22, 24, 25, 31).
-- Pass-holders browse the Available Now pool; contact starts only with a request to someone AVAILABLE;
-- the recipient accepts (a CASUAL conversation opens), declines (privately) or blocks. Without an
-- active pass a CASUAL conversation is read-only. OD-9 (daily cap, decline cool-down) and the T-19
-- request signals are settings without values; OD-24: a request expires when the recipient's window ends.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('requests.daily_cap', null, 'Message requests one member may send in any 24 hours (OD-9).'),
  ('requests.decline_cooldown_days', null, 'Days after a decline before the sender may request the same member again (OD-9).'),
  ('requests.burst_count', null, 'Requests within requests.burst_minutes that flag the sender (T-19, §17).'),
  ('requests.burst_minutes', null, 'Window for the request-burst signal, in minutes (T-19, §17).'),
  ('requests.duplicate_text_recipients', null, 'Members sent the same request text in 24 hours that flag the sender (T-19, §17).')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Tables (§18)
-- ---------------------------------------------------------------------------
create type public.request_status as enum ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'BLOCKED');

create table public.message_requests (
  id              uuid primary key default gen_random_uuid(),
  sender_id       uuid not null references public.users (id) on delete cascade,
  recipient_id    uuid not null references public.users (id) on delete cascade,
  body            text not null check (length(body) between 1 and 300),
  -- Normalised text hash for the "same text to many members" signal (§17); the text itself is never
  -- put in a flag.
  body_hash       text not null,
  status          public.request_status not null default 'PENDING',
  -- OD-24: the recipient's window end when the request was sent.
  expires_at      timestamptz not null,
  responded_at    timestamptz,
  conversation_id uuid references public.conversations (id) on delete set null,
  created_at      timestamptz not null default clock_timestamp(),
  constraint message_requests_not_self check (sender_id <> recipient_id),
  constraint message_requests_answered check ((status in ('ACCEPTED', 'DECLINED', 'BLOCKED')) = (responded_at is not null))
);
-- One pending request per sender → recipient (§14 rule 4).
create unique index message_requests_one_pending on public.message_requests (sender_id, recipient_id) where status = 'PENDING';
create index message_requests_recipient_idx on public.message_requests (recipient_id, created_at desc) where status = 'PENDING';
create index message_requests_sender_idx on public.message_requests (sender_id, created_at desc);
create index message_requests_hash_idx on public.message_requests (sender_id, body_hash, created_at desc);

create table public.saved_profiles (
  user_id       uuid not null references public.users (id) on delete cascade,
  saved_user_id uuid not null references public.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, saved_user_id),
  constraint saved_profiles_not_self check (user_id <> saved_user_id)
);

alter table public.message_requests enable row level security;
alter table public.saved_profiles enable row level security;
revoke all on public.message_requests, public.saved_profiles from anon, authenticated, service_role;
create policy message_requests_no_client_access on public.message_requests
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy saved_profiles_no_client_access on public.saved_profiles
  as restrictive for all to anon, authenticated using (false) with check (false);

-- ---------------------------------------------------------------------------
-- Who a pass-holder may see in the pool (§13)
-- ---------------------------------------------------------------------------

-- A decline hides the pair from the sender for the cool-down (§14 rule 4), so the decline itself stays
-- private: the member just isn't in the sender's pool. While OD-9 has no value, a decline hides them
-- (no request can be sent again until the owner decides the cool-down).
create or replace function public.declined_recently(p_sender uuid, p_recipient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.message_requests r
    where r.sender_id = p_sender and r.recipient_id = p_recipient and r.status = 'DECLINED'
      and r.responded_at > now() - coalesce(
        (select make_interval(days => (value #>> '{}')::int) from public.app_settings
         where key = 'requests.decline_cooldown_days' and value is not null),
        interval '1000 years')
  );
$$;

-- BR-16 / BR-17 / BR-24 / §13: the viewer is an eligible pass-holder, the member is in the pool right
-- now (window, pass, eligibility, requests from Anyone), both are looking for each other's gender, they
-- can see each other (no block, no hide, no unmatch) and the member hasn't recently declined the viewer.
create or replace function public.pool_visible(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer is not null and p_owner is not null and p_viewer <> p_owner
     and cardinality(public.casual_ineligibility(p_viewer)) = 0
     and public.is_in_pool(p_owner)
     and public.relationship_compatible(p_viewer, p_owner)
     and public.can_view_profile(p_viewer, p_owner)
     and not public.declined_recently(p_viewer, p_owner);
$$;

-- The open CASUAL conversation between two members, if any.
create or replace function public.casual_conversation_between(p_a uuid, p_b uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.conversations c
  where c.type = 'CASUAL' and c.status = 'OPEN'
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = p_a)
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = p_b)
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Available Now (§13): filters, fair rotation, cursor pagination of 20.
-- Rotation: members who became available most recently first (by the hour), shuffled within each hour
-- by a per-viewer daily hash, so the same few profiles don't always lead.
-- ---------------------------------------------------------------------------
create or replace function public.pool_candidates(
  p_viewer       uuid,
  p_area_id      uuid default null,
  p_min_age      integer default null,
  p_max_age      integer default null,
  p_interest_ids uuid[] default null,
  p_until        timestamptz default null,
  p_after_bucket bigint default null,
  p_after_hash   text default null,
  p_limit        integer default 20
)
returns table (card jsonb, photo_path text, available_until timestamptz, saved boolean, bucket bigint, sort_hash text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- BR-16: no pass (or not eligible), no pool data at all.
  if p_viewer is null or cardinality(public.casual_ineligibility(p_viewer)) > 0 then
    raise exception 'NOT_ELIGIBLE' using errcode = '42501';
  end if;
  return query
    select * from (
      select public.member_card(o.user_id), public.primary_photo_path(o.user_id), a.end_at,
             exists (select 1 from public.saved_profiles s where s.user_id = p_viewer and s.saved_user_id = o.user_id),
             floor(extract(epoch from a.start_at) / 3600)::bigint as b,
             md5(p_viewer::text || o.user_id::text || current_date::text) as h
      from public.availability a
      join public.profiles o on o.user_id = a.user_id
      where a.status = 'AVAILABLE' and a.start_at <= now() and a.end_at > now()
        and public.pool_visible(p_viewer, o.user_id)
        and (p_area_id is null or o.area_id = p_area_id)
        and (p_min_age is null or public.age_in_years(o.date_of_birth) >= p_min_age)
        and (p_max_age is null or public.age_in_years(o.date_of_birth) <= p_max_age)
        and (p_interest_ids is null or cardinality(p_interest_ids) = 0
             or exists (select 1 from public.user_interests ui where ui.user_id = o.user_id and ui.interest_id = any (p_interest_ids)))
        and (p_until is null or a.end_at >= p_until)
    ) x
    where p_after_bucket is null or x.b < p_after_bucket or (x.b = p_after_bucket and x.h > p_after_hash)
    order by x.b desc, x.h
    limit least(greatest(coalesce(p_limit, 20), 1), 20);
end;
$$;

-- A Casual member profile (member mock-up 04). Visible when the member is in the viewer's pool, or when
-- they sent the viewer a request that is still open (the recipient may look before answering).
create or replace function public.casual_profile(p_viewer uuid, p_owner uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.pool_visible(p_viewer, p_owner)
      or (public.can_view_profile(p_viewer, p_owner)
          and exists (select 1 from public.message_requests r
                      where r.sender_id = p_owner and r.recipient_id = p_viewer and r.status = 'PENDING' and r.expires_at > now()))
    then jsonb_build_object(
      'card', public.member_card(p_owner),
      -- BR-19: the window end only while the member is in the pool.
      'available_until', case when public.is_in_pool(p_owner) then (select a.end_at from public.availability a where a.user_id = p_owner) end,
      'in_pool', public.pool_visible(p_viewer, p_owner),
      -- Server-only paths: signed before anything reaches the member (BR-11).
      'photos', coalesce((select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path)
                                           order by ph.is_primary desc, ph.sort_order)
                               from public.profile_photos ph where ph.user_id = p_owner and ph.status = 'APPROVED'), '[]'::jsonb),
      'saved', exists (select 1 from public.saved_profiles s where s.user_id = p_viewer and s.saved_user_id = p_owner),
      'request_sent', exists (select 1 from public.message_requests r where r.sender_id = p_viewer and r.recipient_id = p_owner
                              and r.status = 'PENDING' and r.expires_at > now()),
      'request_received', (select r.id from public.message_requests r where r.sender_id = p_owner and r.recipient_id = p_viewer
                           and r.status = 'PENDING' and r.expires_at > now() limit 1),
      'conversation_id', public.casual_conversation_between(p_viewer, p_owner))
  end;
$$;

-- ---------------------------------------------------------------------------
-- Message requests (§14 Casual)
-- ---------------------------------------------------------------------------

-- §17 signals: many requests in a short time; the same text sent to many members. Skipped while T-19
-- has no values. Flags never contain the text.
create or replace function public.check_request_signals(p_sender uuid, p_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_burst   integer;
  v_minutes integer;
  v_dupes   integer;
  v_count   integer;
begin
  select (value #>> '{}')::int into v_burst from public.app_settings where key = 'requests.burst_count' and value is not null;
  select (value #>> '{}')::int into v_minutes from public.app_settings where key = 'requests.burst_minutes' and value is not null;
  select (value #>> '{}')::int into v_dupes from public.app_settings where key = 'requests.duplicate_text_recipients' and value is not null;
  if v_burst is not null and v_minutes is not null then
    select count(*) into v_count from public.message_requests
    where sender_id = p_sender and created_at > now() - make_interval(mins => v_minutes);
    if v_count >= v_burst then
      perform public.raise_flag('USER', p_sender, 'REQUEST_BURST', jsonb_build_object('count', v_count, 'minutes', v_minutes));
    end if;
  end if;
  if v_dupes is not null then
    select count(distinct recipient_id) into v_count from public.message_requests
    where sender_id = p_sender and body_hash = p_hash and created_at > now() - interval '24 hours';
    if v_count >= v_dupes then
      perform public.raise_flag('USER', p_sender, 'DUPLICATE_REQUEST_TEXT', jsonb_build_object('recipients', v_count, 'hours', 24));
    end if;
  end if;
end;
$$;

-- BR-21: a verified pass-holder sends a request to a member AVAILABLE now. The server has already run
-- the detection engine in "profile" mode (BR-31: contact details and prices are rejected).
create or replace function public.send_message_request(p_viewer uuid, p_recipient uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_hash text;
  v_end  timestamptz;
  v_id   uuid;
begin
  perform 1 from public.users where id = p_viewer for update;
  if cardinality(public.casual_ineligibility(p_viewer)) > 0 then
    raise exception 'NOT_ELIGIBLE' using errcode = '42501';
  end if;
  if not public.pool_visible(p_viewer, p_recipient) then
    raise exception 'MEMBER_NOT_AVAILABLE' using errcode = 'P0002';
  end if;
  if length(v_body) < 1 or length(v_body) > 300 then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;
  if public.casual_conversation_between(p_viewer, p_recipient) is not null then
    raise exception 'ALREADY_CONNECTED' using errcode = '22023';
  end if;
  if exists (select 1 from public.message_requests where sender_id = p_viewer and recipient_id = p_recipient
             and status = 'PENDING' and expires_at > now()) then
    raise exception 'REQUEST_PENDING' using errcode = '22023';
  end if;
  -- A request the other member already sent: answer it instead of crossing requests.
  if exists (select 1 from public.message_requests where sender_id = p_recipient and recipient_id = p_viewer
             and status = 'PENDING' and expires_at > now()) then
    raise exception 'REQUEST_RECEIVED' using errcode = '22023';
  end if;
  -- OD-9: requests sent in any 24 hours.
  if (select count(*) from public.message_requests where sender_id = p_viewer and created_at > now() - interval '24 hours')
     >= (public.get_setting('requests.daily_cap'))::int then
    raise exception 'REQUEST_LIMIT' using errcode = '22023';
  end if;

  -- A pending request that has passed its expiry makes way for the new one.
  update public.message_requests set status = 'EXPIRED'
  where sender_id = p_viewer and recipient_id = p_recipient and status = 'PENDING' and expires_at <= now();

  select a.end_at into v_end from public.availability a where a.user_id = p_recipient;
  v_hash := md5(lower(regexp_replace(v_body, '\s+', ' ', 'g')));
  insert into public.message_requests (sender_id, recipient_id, body, body_hash, expires_at)
  values (p_viewer, p_recipient, v_body, v_hash, v_end)
  returning id into v_id;
  perform public.check_request_signals(p_viewer, v_hash);
  return v_id;
end;
$$;

-- BR-22: accept (a CASUAL conversation opens, starting with the request text), decline (private) or
-- block. Returns the conversation id on accept.
create or replace function public.respond_to_request(p_viewer uuid, p_request uuid, p_action text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req  public.message_requests;
  v_conv uuid;
begin
  perform 1 from public.users where id = p_viewer for update;
  select * into v_req from public.message_requests where id = p_request and recipient_id = p_viewer for update;
  if not found or v_req.status <> 'PENDING' or v_req.expires_at <= now()
     or not public.can_view_profile(p_viewer, v_req.sender_id) then
    raise exception 'REQUEST_NOT_OPEN' using errcode = '22023';
  end if;

  if p_action = 'DECLINE' then
    update public.message_requests set status = 'DECLINED', responded_at = now() where id = v_req.id;
    return null;
  end if;
  if p_action = 'BLOCK' then
    perform public.block_user(p_viewer, v_req.sender_id); -- BR-24: also closes anything between them
    update public.message_requests set status = 'BLOCKED', responded_at = now() where id = v_req.id;
    return null;
  end if;
  if p_action <> 'ACCEPT' then
    raise exception 'BAD_ACTION' using errcode = '22023';
  end if;

  -- Accepting needs the recipient's own pass (BR-25: no pass, no Casual messaging) and an account that
  -- can act.
  if cardinality(public.casual_ineligibility(p_viewer)) > 0 then
    raise exception 'NOT_ELIGIBLE' using errcode = '42501';
  end if;
  v_conv := public.casual_conversation_between(p_viewer, v_req.sender_id);
  if v_conv is null then
    insert into public.conversations (type, last_message_at) values ('CASUAL', null) returning id into v_conv;
    insert into public.conversation_members (conversation_id, user_id)
    values (v_conv, v_req.sender_id), (v_conv, p_viewer);
    insert into public.messages (conversation_id, sender_id, body, created_at)
    values (v_conv, v_req.sender_id, v_req.body, v_req.created_at);
    update public.conversations set last_message_at = now() where id = v_conv;
  end if;
  update public.message_requests set status = 'ACCEPTED', responded_at = now(), conversation_id = v_conv where id = v_req.id;
  return v_conv;
end;
$$;

-- The Requests tab (member mock-up 05): open requests to the viewer, newest first.
create or replace function public.requests_received(p_viewer uuid)
returns table (request_id uuid, card jsonb, photo_path text, body text, created_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, public.member_card(r.sender_id), public.primary_photo_path(r.sender_id), r.body, r.created_at, r.expires_at
  from public.message_requests r
  join public.users s on s.id = r.sender_id
  where r.recipient_id = p_viewer and r.status = 'PENDING' and r.expires_at > now()
    and public.can_view_profile(p_viewer, r.sender_id)
  order by r.created_at desc
  limit 100;
$$;

-- ---------------------------------------------------------------------------
-- Saved profiles (§13): only members the viewer may still see in the pool are listed.
-- ---------------------------------------------------------------------------
create or replace function public.save_profile(p_viewer uuid, p_owner uuid, p_saved boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(p_saved, false) then
    delete from public.saved_profiles where user_id = p_viewer and saved_user_id = p_owner;
    return;
  end if;
  if not public.pool_visible(p_viewer, p_owner) then
    raise exception 'MEMBER_NOT_AVAILABLE' using errcode = 'P0002';
  end if;
  insert into public.saved_profiles (user_id, saved_user_id) values (p_viewer, p_owner) on conflict do nothing;
end;
$$;

create or replace function public.saved_list(p_viewer uuid)
returns table (card jsonb, photo_path text, available_until timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select public.member_card(s.saved_user_id), public.primary_photo_path(s.saved_user_id), a.end_at
  from public.saved_profiles s
  join public.availability a on a.user_id = s.saved_user_id
  where s.user_id = p_viewer and public.pool_visible(p_viewer, s.saved_user_id)
  order by s.created_at desc
  limit 100;
$$;

-- ---------------------------------------------------------------------------
-- BR-25: without an active pass, a CASUAL conversation is read-only (history kept).
-- ---------------------------------------------------------------------------
create or replace function public.can_send_in(p_viewer uuid, p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.status = 'OPEN'
       and public.effective_account_status(me.status, me.suspended_until) = 'ACTIVE'
       and me.hidden_reason is null
       and o.status not in ('BANNED', 'DELETED')
       -- Q29: nobody keeps messaging a member reported as possibly under 18 while staff review it.
       and o.hidden_reason is distinct from 'UNDER_18_REPORT'
       and not public.is_blocked_pair(p_viewer, o.id)
       -- BR-23: a Relationship conversation needs its match to be active.
       and (c.type <> 'RELATIONSHIP'
            or exists (select 1 from public.matches m where m.id = c.match_id and m.status = 'ACTIVE'))
       -- BR-25: Casual needs the sender's own active pass.
       and (c.type <> 'CASUAL' or public.has_casual_access(p_viewer))
    from public.conversations c
    join public.users me on me.id = p_viewer
    join public.users o on o.id = public.conversation_other(p_viewer, p_conversation)
    where c.id = p_conversation
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- OD-24: a pending request expires when the recipient's window ends — by time, at query time, and when
-- the recipient leaves the pool. The tidy job records it.
-- ---------------------------------------------------------------------------
create or replace function public.leave_pool(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.users where id = p_user for update;
  perform public.close_availability_window(p_user);
  update public.availability set status = 'UNAVAILABLE', start_at = null, end_at = null
  where user_id = p_user and status <> 'UNAVAILABLE';
  update public.message_requests set status = 'EXPIRED'
  where recipient_id = p_user and status = 'PENDING';
  perform public.check_short_windows(p_user); -- leaving early counts toward the §17 signal
end;
$$;

create or replace function public.tidy_requests()
returns integer
language sql
security definer
set search_path = ''
as $$
  with done as (
    update public.message_requests set status = 'EXPIRED'
    where status = 'PENDING' and expires_at <= now()
    returning 1
  )
  select count(*)::int from done;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: server only.
-- ---------------------------------------------------------------------------
revoke all on function public.declined_recently(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.pool_visible(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.casual_conversation_between(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.check_request_signals(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.can_send_in(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.pool_candidates(uuid, uuid, integer, integer, uuid[], timestamptz, bigint, text, integer) from public, anon, authenticated;
revoke all on function public.casual_profile(uuid, uuid) from public, anon, authenticated;
revoke all on function public.send_message_request(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.respond_to_request(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.requests_received(uuid) from public, anon, authenticated;
revoke all on function public.save_profile(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.saved_list(uuid) from public, anon, authenticated;
revoke all on function public.leave_pool(uuid) from public, anon, authenticated;
revoke all on function public.tidy_requests() from public, anon, authenticated;

grant execute on function public.pool_candidates(uuid, uuid, integer, integer, uuid[], timestamptz, bigint, text, integer) to service_role;
grant execute on function public.casual_profile(uuid, uuid) to service_role;
grant execute on function public.send_message_request(uuid, uuid, text) to service_role;
grant execute on function public.respond_to_request(uuid, uuid, text) to service_role;
grant execute on function public.requests_received(uuid) to service_role;
grant execute on function public.save_profile(uuid, uuid, boolean) to service_role;
grant execute on function public.saved_list(uuid) to service_role;
grant execute on function public.leave_pool(uuid) to service_role;
grant execute on function public.tidy_requests() to service_role;
