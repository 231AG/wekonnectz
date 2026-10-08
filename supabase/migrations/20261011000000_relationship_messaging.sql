-- Phase 6 — Relationship mode and messaging core (spec §14, §15; BR-5, 8, 13, 23, 24; OD-10, OD-26, OD-33).
-- Likes, passes, atomic matching, one-to-one text conversations delivered over private Realtime
-- broadcasts (clients never read the messages table), reports from a conversation with the recent
-- messages captured for moderators, every view of them audited.

-- ---------------------------------------------------------------------------
-- Settings. OD-10 and the pass cool-down were decided by the owner on 2026-10-08.
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('relationship.daily_like_cap', '50'::jsonb, 'Likes a member may send in any 24 hours (OD-10, owner 2026-10-08).'),
  ('relationship.pass_cooldown_days', '7'::jsonb, 'Days before a passed profile returns to Discover (owner 2026-10-08).'),
  ('messages.max_per_minute', null, 'Messages one member may send per minute (T-19).'),
  ('reports.messages_captured', null, 'Recent messages copied into a report made from a conversation (T-19).')
on conflict (key) do update set value = excluded.value
  where public.app_settings.key in ('relationship.daily_like_cap', 'relationship.pass_cooldown_days');

-- OD-33 (owner 2026-10-08): viewing the messages captured in a report is its own audited action.
alter type public.audit_action add value if not exists 'REPORTED_MESSAGES_VIEWED';

-- ---------------------------------------------------------------------------
-- Eligibility (§15): ACTIVE, VERIFIED, 3 approved photos with an approved main photo, intent includes
-- Relationship, not hidden by reports. Applies to whoever appears and whoever browses or likes.
-- ---------------------------------------------------------------------------
create or replace function public.relationship_eligible(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select u.role = 'USER'
       and public.effective_account_status(u.status, u.suspended_until) = 'ACTIVE'
       and u.hidden_reason is null
       and p.intent_relationship
       and public.latest_verification_status(u.id) = 'VERIFIED'
       and (select count(*) from public.profile_photos ph where ph.user_id = u.id and ph.status = 'APPROVED')
           >= (public.get_setting('photos.min_required'))::int
       and exists (select 1 from public.profile_photos ph where ph.user_id = u.id and ph.is_primary and ph.status = 'APPROVED')
    from public.users u
    join public.profiles p on p.user_id = u.id
    where u.id = p_user
  ), false);
$$;

-- Both people are looking for each other's gender ("interested in", §15 filter).
create or replace function public.relationship_compatible(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select a.gender = any (b.seeking_genders) and b.gender = any (a.seeking_genders)
    from public.profiles a, public.profiles b
    where a.user_id = p_a and b.user_id = p_b
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- likes, passes, matches
-- ---------------------------------------------------------------------------
create table public.likes (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid not null references public.users (id) on delete cascade,
  receiver_id uuid not null references public.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint likes_not_self check (sender_id <> receiver_id),
  constraint likes_unique_pair unique (sender_id, receiver_id)
);
create index likes_receiver_idx on public.likes (receiver_id, created_at desc);
create index likes_sender_recent_idx on public.likes (sender_id, created_at desc);

create table public.passes (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid not null references public.users (id) on delete cascade,
  receiver_id uuid not null references public.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint passes_not_self check (sender_id <> receiver_id),
  constraint passes_unique_pair unique (sender_id, receiver_id)
);

create type public.match_status as enum ('ACTIVE', 'UNMATCHED');

create table public.matches (
  id            uuid primary key default gen_random_uuid(),
  user_a_id     uuid not null references public.users (id) on delete cascade,
  user_b_id     uuid not null references public.users (id) on delete cascade,
  status        public.match_status not null default 'ACTIVE',
  unmatched_by  uuid references public.users (id) on delete set null,
  unmatched_at  timestamptz,
  created_at    timestamptz not null default now(),
  -- §15: the pair is stored once, ordered.
  constraint matches_ordered check (user_a_id < user_b_id),
  constraint matches_unique_pair unique (user_a_id, user_b_id)
);
create index matches_user_b_idx on public.matches (user_b_id);

-- ---------------------------------------------------------------------------
-- conversations, members, messages
-- ---------------------------------------------------------------------------
create type public.conversation_type as enum ('RELATIONSHIP', 'CASUAL');
create type public.conversation_status as enum ('OPEN', 'CLOSED');

create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  type            public.conversation_type not null,
  match_id        uuid unique references public.matches (id) on delete cascade,
  status          public.conversation_status not null default 'OPEN',
  closed_reason   text check (closed_reason in ('UNMATCHED', 'BLOCKED')),
  closed_at       timestamptz,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  constraint conversations_closed_has_reason check ((status = 'CLOSED') = (closed_reason is not null)),
  constraint conversations_relationship_has_match check (type <> 'RELATIONSHIP' or match_id is not null)
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz,
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid references public.users (id) on delete set null,
  -- §14: text only. Length is a build limit (T-19 lists it).
  body            text not null check (length(body) between 1 and 1000),
  flagged         boolean not null default false,
  -- clock_timestamp(): messages sent in one transaction keep their order.
  created_at      timestamptz not null default clock_timestamp(),
  read_at         timestamptz
);
create index messages_conversation_idx on public.messages (conversation_id, created_at desc);

-- A report made from a conversation keeps a copy of its recent messages (OD-26): only these are ever
-- shown to staff, and each view is audited (OD-33).
alter table public.reports add column conversation_id uuid references public.conversations (id) on delete set null;

create table public.report_messages (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.reports (id) on delete cascade,
  message_id uuid references public.messages (id) on delete set null,
  sender_id  uuid references public.users (id) on delete set null,
  body       text not null,
  sent_at    timestamptz not null
);
create index report_messages_report_idx on public.report_messages (report_id, sent_at);

-- No client reads or writes any of these: members go through the server, which calls the functions
-- below with the member id from the session; new messages reach members as private broadcasts.
alter table public.likes enable row level security;
alter table public.passes enable row level security;
alter table public.matches enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.report_messages enable row level security;
revoke all on public.likes, public.passes, public.matches, public.conversations, public.conversation_members,
  public.messages, public.report_messages from anon, authenticated;
create policy likes_no_client_access on public.likes
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy passes_no_client_access on public.passes
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy matches_no_client_access on public.matches
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy conversations_no_client_access on public.conversations
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy conversation_members_no_client_access on public.conversation_members
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy messages_no_client_access on public.messages
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy report_messages_no_client_access on public.report_messages
  as restrictive for all to anon, authenticated using (false) with check (false);

-- ---------------------------------------------------------------------------
-- Realtime: private channel "conversation:<id>" per conversation. A member may join only their own
-- open conversation; nobody can broadcast into it from a client (no insert policy).
-- ---------------------------------------------------------------------------
create or replace function public.can_join_conversation_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_topic is null or p_topic !~ '^conversation:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_id := substr(p_topic, 14)::uuid;
  return exists (
    select 1
    from public.conversation_members m
    join public.conversations c on c.id = m.conversation_id
    join public.users u on u.id = m.user_id
    where m.conversation_id = v_id and m.user_id = auth.uid() and c.status = 'OPEN'
      and u.role = 'USER' and u.status not in ('BANNED', 'DELETED')
  );
end;
$$;

create policy wk_conversation_members_receive on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public.can_join_conversation_topic(realtime.topic()));

-- New messages and read receipts are pushed to the conversation's channel. The payload carries only
-- what members see (never the moderation flag).
create or replace function public.messages_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('id', new.id, 'sender_id', new.sender_id, 'body', new.body, 'created_at', new.created_at),
    'message', 'conversation:' || new.conversation_id, true);
  return new;
end;
$$;

create trigger messages_broadcast
  after insert on public.messages
  for each row execute function public.messages_broadcast();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Card fields for a member shown to another member (no DOB, phone, status or storage path; the main
-- photo path goes to the server only, which signs it).
create or replace function public.member_card(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', p.user_id,
    'display_name', p.display_name,
    'age', public.age_in_years(p.date_of_birth),
    'area', a.name,
    'bio', p.bio,
    'verified', public.latest_verification_status(p.user_id) = 'VERIFIED',
    'interests', coalesce((select jsonb_agg(i.name order by i.name) from public.user_interests ui
                           join public.interests i on i.id = ui.interest_id where ui.user_id = p.user_id), '[]'::jsonb))
  from public.profiles p
  left join public.areas a on a.id = p.area_id
  where p.user_id = p_user;
$$;

create or replace function public.primary_photo_path(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select storage_path from public.profile_photos
  where user_id = p_user and is_primary and status = 'APPROVED';
$$;

-- Closes every open conversation between two members and ends their match (BR-24: blocking closes
-- the conversation for both).
create or replace function public.close_pair(p_a uuid, p_b uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.matches
     set status = 'UNMATCHED', unmatched_by = p_a, unmatched_at = now()
   where user_a_id = least(p_a, p_b) and user_b_id = greatest(p_a, p_b) and status = 'ACTIVE';
  update public.conversations c
     set status = 'CLOSED', closed_reason = p_reason, closed_at = now()
   where c.status = 'OPEN'
     and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = p_a)
     and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = p_b);
end;
$$;

-- BR-24 (Phase 5 rules kept): blocking now also closes conversations and ends the match.
create or replace function public.block_user(p_user_id uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_member_can_act(p_user_id);
  if p_target is null or p_target = p_user_id
     or not exists (select 1 from public.users where id = p_target and role = 'USER') then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.blocks (blocker_id, blocked_id, target_visible)
  values (p_user_id, p_target, public.can_view_profile(p_user_id, p_target))
  on conflict (blocker_id, blocked_id) do nothing;
  perform public.close_pair(p_user_id, p_target, 'BLOCKED');
end;
$$;

-- ---------------------------------------------------------------------------
-- Discover, likes, passes, matches (service_role; the member id comes from the session)
-- ---------------------------------------------------------------------------
create or replace function public.discover_candidates(
  p_viewer       uuid,
  p_area_id      uuid default null,
  p_min_age      integer default null,
  p_max_age      integer default null,
  p_interest_ids uuid[] default null,
  p_limit        integer default 1
)
returns table (card jsonb, photo_path text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cooldown integer := (public.get_setting('relationship.pass_cooldown_days'))::int;
begin
  if not public.relationship_eligible(p_viewer) then
    raise exception 'NOT_ELIGIBLE' using errcode = '42501';
  end if;
  return query
    select public.member_card(o.user_id), public.primary_photo_path(o.user_id)
    from public.profiles o
    where o.user_id <> p_viewer
      and public.relationship_eligible(o.user_id)
      and public.relationship_compatible(p_viewer, o.user_id)
      and not public.is_blocked_pair(p_viewer, o.user_id)
      and not exists (select 1 from public.likes l where l.sender_id = p_viewer and l.receiver_id = o.user_id)
      and not exists (select 1 from public.passes s where s.sender_id = p_viewer and s.receiver_id = o.user_id
                      and s.created_at > now() - make_interval(days => v_cooldown))
      and not exists (select 1 from public.matches m
                      where m.user_a_id = least(p_viewer, o.user_id) and m.user_b_id = greatest(p_viewer, o.user_id))
      and (p_area_id is null or o.area_id = p_area_id)
      and (p_min_age is null or public.age_in_years(o.date_of_birth) >= p_min_age)
      and (p_max_age is null or public.age_in_years(o.date_of_birth) <= p_max_age)
      and (p_interest_ids is null or cardinality(p_interest_ids) = 0
           or exists (select 1 from public.user_interests ui where ui.user_id = o.user_id and ui.interest_id = any (p_interest_ids)))
    -- A stable daily shuffle per viewer: the same order all day, a new one tomorrow.
    order by md5(p_viewer::text || o.user_id::text || current_date::text)
    limit least(greatest(coalesce(p_limit, 1), 1), 20);
end;
$$;

-- Like (§15). Atomic: likes of one pair are serialised, so two simultaneous mutual likes make exactly
-- one match. Returns {matched, conversation_id}.
create or replace function public.like_user(p_viewer uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a      uuid := least(p_viewer, p_target);
  v_b      uuid := greatest(p_viewer, p_target);
  v_match  uuid;
  v_conv   uuid;
begin
  if not public.relationship_eligible(p_viewer) then
    raise exception 'NOT_ELIGIBLE' using errcode = '42501';
  end if;
  if p_target is null or p_target = p_viewer
     or not public.relationship_eligible(p_target)
     or not public.relationship_compatible(p_viewer, p_target)
     or public.is_blocked_pair(p_viewer, p_target) then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('like:' || v_a::text || ':' || v_b::text, 0));

  if exists (select 1 from public.matches where user_a_id = v_a and user_b_id = v_b) then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.likes where sender_id = p_viewer and receiver_id = p_target) then
    -- OD-10: likes sent in any 24 hours.
    if (select count(*) from public.likes where sender_id = p_viewer and created_at > now() - interval '24 hours')
       >= (public.get_setting('relationship.daily_like_cap'))::int then
      raise exception 'LIKE_LIMIT' using errcode = '22023';
    end if;
    insert into public.likes (sender_id, receiver_id) values (p_viewer, p_target);
  end if;

  if exists (select 1 from public.likes where sender_id = p_target and receiver_id = p_viewer) then
    insert into public.matches (user_a_id, user_b_id) values (v_a, v_b) returning id into v_match;
    insert into public.conversations (type, match_id) values ('RELATIONSHIP', v_match) returning id into v_conv;
    insert into public.conversation_members (conversation_id, user_id) values (v_conv, v_a), (v_conv, v_b);
    return jsonb_build_object('matched', true, 'conversation_id', v_conv);
  end if;
  return jsonb_build_object('matched', false);
end;
$$;

create or replace function public.pass_user(p_viewer uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.relationship_eligible(p_viewer) then
    raise exception 'NOT_ELIGIBLE' using errcode = '42501';
  end if;
  if p_target is null or p_target = p_viewer or not exists (select 1 from public.users where id = p_target and role = 'USER') then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.passes (sender_id, receiver_id) values (p_viewer, p_target)
  on conflict (sender_id, receiver_id) do update set created_at = now();
end;
$$;

-- People who liked the member and are waiting for an answer (Likes received).
create or replace function public.likes_received(p_viewer uuid)
returns table (card jsonb, photo_path text, liked_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cooldown integer := (public.get_setting('relationship.pass_cooldown_days'))::int;
begin
  if not public.relationship_eligible(p_viewer) then
    raise exception 'NOT_ELIGIBLE' using errcode = '42501';
  end if;
  return query
    select public.member_card(l.sender_id), public.primary_photo_path(l.sender_id), l.created_at
    from public.likes l
    where l.receiver_id = p_viewer
      and public.relationship_eligible(l.sender_id)
      and public.relationship_compatible(p_viewer, l.sender_id)
      and not public.is_blocked_pair(p_viewer, l.sender_id)
      and not exists (select 1 from public.likes r where r.sender_id = p_viewer and r.receiver_id = l.sender_id)
      and not exists (select 1 from public.passes s where s.sender_id = p_viewer and s.receiver_id = l.sender_id
                      and s.created_at > now() - make_interval(days => v_cooldown))
      and not exists (select 1 from public.matches m
                      where m.user_a_id = least(p_viewer, l.sender_id) and m.user_b_id = greatest(p_viewer, l.sender_id))
    order by l.created_at desc
    limit 100;
end;
$$;

-- The member's active matches with their conversation. The photo is included only while the other
-- member is visible to them (not hidden by reports, suspended or blocked).
create or replace function public.matches_list(p_viewer uuid)
returns table (match_id uuid, conversation_id uuid, card jsonb, photo_path text, matched_at timestamptz, has_messages boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, c.id, public.member_card(o.id),
         case when public.can_view_profile(p_viewer, o.id) then public.primary_photo_path(o.id) end,
         m.created_at, c.last_message_at is not null
  from public.matches m
  join public.conversations c on c.match_id = m.id
  join public.users o on o.id = case when m.user_a_id = p_viewer then m.user_b_id else m.user_a_id end
  where p_viewer in (m.user_a_id, m.user_b_id) and m.status = 'ACTIVE' and c.status = 'OPEN'
    and o.status not in ('BANNED', 'DELETED')
  order by m.created_at desc;
$$;

-- Unmatching closes the conversation for both (§14, §15).
create or replace function public.unmatch(p_viewer uuid, p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a uuid;
  v_b uuid;
begin
  select user_a_id, user_b_id into v_a, v_b from public.matches
  where id = p_match_id and p_viewer in (user_a_id, user_b_id) and status = 'ACTIVE'
  for update;
  if v_a is null then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public.close_pair(p_viewer, case when v_a = p_viewer then v_b else v_a end, 'UNMATCHED');
end;
$$;

-- Home screen counts.
create or replace function public.relationship_summary(p_viewer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return jsonb_build_object(
    'eligible', public.relationship_eligible(p_viewer),
    'intent_relationship', coalesce((select intent_relationship from public.profiles where user_id = p_viewer), false),
    'likes_received', case when public.relationship_eligible(p_viewer)
                           then (select count(*) from public.likes_received(p_viewer)) else 0 end,
    'new_matches', (select count(*) from public.matches_list(p_viewer) x where not x.has_messages),
    'unread', (select count(*) from public.messages msg
               join public.conversation_members me on me.conversation_id = msg.conversation_id and me.user_id = p_viewer
               join public.conversations c on c.id = msg.conversation_id and c.status = 'OPEN'
               where msg.sender_id is distinct from p_viewer
                 and msg.created_at > coalesce(me.last_read_at, '-infinity'::timestamptz))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Conversations (service_role)
-- ---------------------------------------------------------------------------

-- The other member of a one-to-one conversation the viewer belongs to (null if not a member).
create or replace function public.conversation_other(p_viewer uuid, p_conversation uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.user_id from public.conversation_members me
  join public.conversation_members o on o.conversation_id = me.conversation_id and o.user_id <> me.user_id
  where me.conversation_id = p_conversation and me.user_id = p_viewer;
$$;

-- BR-5, BR-23, BR-24: the viewer may send only in an open conversation, while ACTIVE and not hidden
-- by reports, to a member who isn't banned or deleted, with no block either way.
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
       and not public.is_blocked_pair(p_viewer, o.id)
    from public.conversations c
    join public.users me on me.id = p_viewer
    join public.users o on o.id = public.conversation_other(p_viewer, p_conversation)
    where c.id = p_conversation
  ), false);
$$;

create or replace function public.conversations_list(p_viewer uuid)
returns table (conversation_id uuid, type public.conversation_type, card jsonb, photo_path text,
               last_body text, last_mine boolean, last_message_at timestamptz, unread bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.type, public.member_card(o.id),
         case when public.can_view_profile(p_viewer, o.id) then public.primary_photo_path(o.id) end,
         last.body, last.sender_id = p_viewer, c.last_message_at,
         (select count(*) from public.messages x
          where x.conversation_id = c.id and x.sender_id is distinct from p_viewer
            and x.created_at > coalesce(me.last_read_at, '-infinity'::timestamptz))
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id and c.status = 'OPEN'
  join public.users o on o.id = public.conversation_other(p_viewer, c.id)
  left join lateral (select x.body, x.sender_id from public.messages x where x.conversation_id = c.id
                     order by x.created_at desc limit 1) last on true
  where me.user_id = p_viewer and o.status not in ('BANNED', 'DELETED') and c.last_message_at is not null
  order by c.last_message_at desc;
$$;

-- One conversation for the viewer: header, whether they can send, and the latest messages (oldest
-- first). A closed conversation is gone for both (§15).
create or replace function public.conversation_view(p_viewer uuid, p_conversation uuid, p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_other uuid := public.conversation_other(p_viewer, p_conversation);
  v_type  public.conversation_type;
  v_match uuid;
begin
  select type, match_id into v_type, v_match from public.conversations where id = p_conversation and status = 'OPEN';
  if v_other is null or v_type is null
     or exists (select 1 from public.users where id = v_other and status in ('BANNED', 'DELETED')) then
    raise exception 'CONVERSATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'conversation_id', p_conversation,
    'type', v_type,
    'match_id', v_match,
    'other', public.member_card(v_other),
    -- Server-only: signed before anything reaches the member, and only while the other member is visible.
    'photo_path', case when public.can_view_profile(p_viewer, v_other) then public.primary_photo_path(v_other) end,
    'can_send', public.can_send_in(p_viewer, p_conversation),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'mine', x.sender_id = p_viewer, 'body', x.body,
                                          'created_at', x.created_at, 'read_at', x.read_at) order by x.created_at)
      from (select * from public.messages where conversation_id = p_conversation
            order by created_at desc limit least(greatest(coalesce(p_limit, 200), 1), 500)) x
    ), '[]'::jsonb)
  );
end;
$$;

-- Send a text message (§14). The server runs the detection engine first (OD-31: in conversations
-- only prices, payment terms and money requests are flagged; the message is still delivered) and
-- refuses links. Flagged messages go to the Flags queue without their text (OD-26).
create or replace function public.send_message(
  p_viewer       uuid,
  p_conversation uuid,
  p_body         text,
  p_flagged      boolean default false,
  p_categories   text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_msg  public.messages;
begin
  if public.conversation_other(p_viewer, p_conversation) is null then
    raise exception 'CONVERSATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform 1 from public.conversations where id = p_conversation for update;
  if not public.can_send_in(p_viewer, p_conversation) then
    raise exception 'CANNOT_SEND' using errcode = '42501';
  end if;
  if length(v_body) < 1 or length(v_body) > 1000 then
    raise exception 'INVALID_MESSAGE' using errcode = '22023';
  end if;
  if not public.rate_limit_hit('message', p_viewer::text, 60, (public.get_setting('messages.max_per_minute'))::int) then
    raise exception 'RATE_LIMITED' using errcode = '22023';
  end if;

  insert into public.messages (conversation_id, sender_id, body, flagged)
  values (p_conversation, p_viewer, v_body, coalesce(p_flagged, false))
  returning * into v_msg;
  update public.conversations set last_message_at = v_msg.created_at where id = p_conversation;
  -- The sender has read everything up to their own message.
  update public.conversation_members set last_read_at = v_msg.created_at
  where conversation_id = p_conversation and user_id = p_viewer;

  if v_msg.flagged then
    perform public.raise_flag('MESSAGE', v_msg.id, 'MONEY_TERMS',
      jsonb_build_object('sender_id', p_viewer, 'conversation_id', p_conversation,
                         'categories', to_jsonb(coalesce(p_categories, array[]::text[]))));
  end if;
  return jsonb_build_object('id', v_msg.id, 'mine', true, 'body', v_msg.body, 'created_at', v_msg.created_at, 'read_at', null);
end;
$$;

-- Read receipts (§14: read_at). Tells the other member over the channel.
create or replace function public.mark_conversation_read(p_viewer uuid, p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if public.conversation_other(p_viewer, p_conversation) is null
     or not exists (select 1 from public.conversations where id = p_conversation and status = 'OPEN') then
    raise exception 'CONVERSATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  -- clock_timestamp(): message times use it too, so "read up to now" covers every message so far.
  update public.conversation_members set last_read_at = clock_timestamp()
  where conversation_id = p_conversation and user_id = p_viewer;
  update public.messages set read_at = now()
  where conversation_id = p_conversation and sender_id is distinct from p_viewer and read_at is null;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    perform realtime.send(jsonb_build_object('reader_id', p_viewer, 'read_at', now()),
                          'read', 'conversation:' || p_conversation, true);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports (Phase 5 rules kept), now also from a conversation (§17: report from every conversation).
-- ---------------------------------------------------------------------------
drop function public.submit_report(uuid, uuid, public.report_category, text, uuid);

-- Shared by both entry points once the reporter and target are established.
create or replace function public.file_report(
  p_reporter     uuid,
  p_target       uuid,
  p_category     public.report_category,
  p_description  text,
  p_photo_id     uuid,
  p_conversation uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id        uuid;
  v_threshold integer;
  v_high      integer;
  v_any       integer;
begin
  if p_category = 'INAPPROPRIATE_PHOTO' and (
       p_photo_id is null
       or not exists (select 1 from public.profile_photos where id = p_photo_id and user_id = p_target and status = 'APPROVED')
     ) then
    raise exception 'PHOTO_REQUIRED' using errcode = '22023';
  end if;
  if p_description is not null and length(p_description) > 500 then
    raise exception 'DESCRIPTION_TOO_LONG' using errcode = '22023';
  end if;
  if not public.rate_limit_hit('report', p_reporter::text, 86400, (public.get_setting('reports.per_user_per_day'))::int) then
    raise exception 'RATE_LIMITED' using errcode = '22023';
  end if;

  -- Serialise reports about the same member so the threshold count is exact.
  perform 1 from public.users where id = p_target for update;

  if exists (select 1 from public.reports where reporter_id = p_reporter and reported_user_id = p_target
             and category = p_category and status = 'OPEN') then
    raise exception 'ALREADY_REPORTED' using errcode = '22023';
  end if;

  insert into public.reports (reporter_id, reported_user_id, category, priority, description, photo_id, conversation_id)
  values (p_reporter, p_target, p_category, public.report_priority_for(p_category),
          nullif(btrim(coalesce(p_description, '')), ''),
          case when p_category = 'INAPPROPRIATE_PHOTO' then p_photo_id end,
          p_conversation)
  returning id into v_id;

  if p_conversation is not null then
    insert into public.report_messages (report_id, message_id, sender_id, body, sent_at)
    select v_id, x.id, x.sender_id, x.body, x.created_at
    from (select * from public.messages where conversation_id = p_conversation
          order by created_at desc limit (public.get_setting('reports.messages_captured'))::int) x;
  end if;

  if p_category = 'UNDER_18' then
    update public.users set hidden_reason = 'UNDER_18_REPORT', hidden_at = now()
    where id = p_target and (hidden_reason is null or hidden_reason <> 'UNDER_18_REPORT');
  end if;

  if p_category = 'INAPPROPRIATE_PHOTO' then
    update public.profile_photos set status = 'HIDDEN' where id = p_photo_id and status = 'APPROVED';
  end if;

  v_threshold := (public.get_setting('reports.auto_hide_threshold'))::int;
  select count(distinct reporter_id) filter (where priority = 'HIGH'), count(distinct reporter_id)
    into v_high, v_any
  from public.reports
  where reported_user_id = p_target and status = 'OPEN' and created_at > now() - interval '24 hours';

  if public.report_priority_for(p_category) = 'HIGH' and v_high >= v_threshold then
    update public.users set hidden_reason = 'REPORT_THRESHOLD', hidden_at = now()
    where id = p_target and hidden_reason is null;
  end if;
  if v_any >= v_threshold then
    perform public.raise_flag('USER', p_target, 'MANY_REPORTS', jsonb_build_object('reporters_24h', v_any));
  end if;

  return v_id;
end;
$$;

create or replace function public.assert_can_report(p_reporter uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.users u where u.id = p_reporter and u.role = 'USER'
                 and public.effective_account_status(u.status, u.suspended_until) = 'ACTIVE') then
    raise exception 'ACCOUNT_CANNOT_ACT' using errcode = '42501';
  end if;
end;
$$;

-- From a profile (Phase 5 rules).
create or replace function public.submit_report(
  p_reporter    uuid,
  p_target      uuid,
  p_category    public.report_category,
  p_description text default null,
  p_photo_id    uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_can_report(p_reporter);
  if p_target is null or p_target = p_reporter
     or not exists (select 1 from public.users where id = p_target and role = 'USER') then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;
  -- Only someone who could see the member, or who blocked them while they could, can report them.
  if not (public.can_view_profile(p_reporter, p_target)
          or exists (select 1 from public.blocks where blocker_id = p_reporter and blocked_id = p_target
                     and target_visible)) then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;
  return public.file_report(p_reporter, p_target, p_category, p_description, p_photo_id, null);
end;
$$;

-- From a conversation the reporter belongs to (open, or closed by their own block or unmatch): the
-- recent messages are captured for the moderator. Photo reports are made from the profile.
create or replace function public.submit_conversation_report(
  p_reporter     uuid,
  p_conversation uuid,
  p_category     public.report_category,
  p_description  text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid := public.conversation_other(p_reporter, p_conversation);
begin
  perform public.assert_can_report(p_reporter);
  if v_target is null or not exists (select 1 from public.users where id = v_target and role = 'USER') then
    raise exception 'CONVERSATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_category = 'INAPPROPRIATE_PHOTO' then
    raise exception 'PHOTO_REQUIRED' using errcode = '22023';
  end if;
  return public.file_report(p_reporter, v_target, p_category, p_description, null, p_conversation);
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: captured messages (OD-26, OD-33) and message flags
-- ---------------------------------------------------------------------------

-- Returns the messages captured in a report, writing a REPORTED_MESSAGES_VIEWED audit row first in the
-- same transaction (BR-34). Never returns messages that weren't captured.
create or replace function public.staff_report_messages(p_report_id uuid)
returns table (from_reported boolean, body text, sent_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
  v_count  integer;
begin
  if not public.is_staff('MODERATOR') then
    raise exception 'NOT_STAFF' using errcode = '42501';
  end if;
  select reported_user_id into v_target from public.reports where id = p_report_id;
  if v_target is null then
    raise exception 'REPORT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_target = auth.uid() then
    raise exception 'OWN_CONTENT' using errcode = '42501';
  end if;
  select count(*) into v_count from public.report_messages where report_id = p_report_id;
  perform public.audit('REPORTED_MESSAGES_VIEWED', 'report', p_report_id::text,
    jsonb_build_object('user_id', v_target, 'messages', v_count));
  return query
    select rm.sender_id = v_target, rm.body, rm.sent_at
    from public.report_messages rm where rm.report_id = p_report_id
    order by rm.sent_at;
end;
$$;

-- Report detail gains whether it came from a conversation and how many messages were captured.
create or replace function public.staff_report_detail(p_report_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not public.is_staff('MODERATOR') then
    raise exception 'NOT_STAFF' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'report_id', r.id,
    'category', r.category,
    'priority', r.priority,
    'status', r.status,
    'description', r.description,
    'photo_id', r.photo_id,
    'created_at', r.created_at,
    'from_conversation', r.conversation_id is not null,
    'captured_messages', (select count(*) from public.report_messages rm where rm.report_id = r.id),
    'reported_user_id', r.reported_user_id,
    'display_name', p.display_name,
    'age', public.age_in_years(p.date_of_birth),
    'account_status', public.effective_account_status(u.status, u.suspended_until),
    'stored_status', u.status,
    'suspended_until', case when u.suspended_until > now() then u.suspended_until end,
    'hidden_reason', u.hidden_reason,
    'verification', public.latest_verification_status(u.id),
    'reporters_24h', (select count(distinct x.reporter_id) from public.reports x
                      where x.reported_user_id = r.reported_user_id and x.status = 'OPEN'
                        and x.created_at > now() - interval '24 hours'),
    'other_reports', coalesce((select jsonb_agg(jsonb_build_object('category', o.category, 'status', o.status, 'created_at', o.created_at)
                                                order by o.created_at desc)
                               from public.reports o where o.reported_user_id = r.reported_user_id and o.id <> r.id), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('note', n.note, 'created_at', n.created_at,
                                                           'mine', n.author_id = auth.uid()) order by n.created_at)
                       from public.report_notes n where n.report_id = r.id), '[]'::jsonb)
  ) into v
  from public.reports r
  join public.users u on u.id = r.reported_user_id
  left join public.profiles p on p.user_id = r.reported_user_id
  where r.id = p_report_id;
  return v;
end;
$$;

-- Flags queue: the account a flag is about (a USER flag's member, a MESSAGE flag's sender). Message
-- text is never shown here (OD-26).
drop function public.staff_flags_queue(integer);
create or replace function public.staff_flags_queue(p_limit integer default 100)
returns table (flag_id uuid, entity_type text, entity_id uuid, reason text, created_at timestamptz,
               account_id uuid, display_name text, account_status public.account_status, hidden_reason text,
               stored_status public.account_status, suspended_until timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff('MODERATOR') then
    raise exception 'NOT_STAFF' using errcode = '42501';
  end if;
  return query
    select f.id, f.entity_type, f.entity_id, f.reason, f.created_at, u.id, p.display_name,
           public.effective_account_status(u.status, u.suspended_until), u.hidden_reason,
           u.status, case when u.suspended_until > now() then u.suspended_until end
    from public.moderation_flags f
    left join public.users u on u.id = case f.entity_type
                                         when 'USER' then f.entity_id
                                         when 'MESSAGE' then (f.details ->> 'sender_id')::uuid
                                       end
    left join public.profiles p on p.user_id = u.id
    where f.status = 'OPEN'
    order by f.created_at
    limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

-- Staff can't resolve a flag about their own messages either.
create or replace function public.resolve_flag(p_flag_id uuid, p_dismiss boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity  uuid;
  v_type    text;
  v_details jsonb;
begin
  if not public.is_staff('MODERATOR') then
    raise exception 'NOT_STAFF' using errcode = '42501';
  end if;
  select entity_id, entity_type, details into v_entity, v_type, v_details from public.moderation_flags
  where id = p_flag_id and status = 'OPEN' for update;
  if v_entity is null then
    raise exception 'FLAG_NOT_OPEN' using errcode = 'P0002';
  end if;
  if (v_type = 'USER' and v_entity = auth.uid())
     or (v_type = 'MESSAGE' and (v_details ->> 'sender_id')::uuid = auth.uid()) then
    raise exception 'OWN_CONTENT' using errcode = '42501';
  end if;
  update public.moderation_flags
     set status = case when p_dismiss then 'DISMISSED'::public.flag_status else 'RESOLVED'::public.flag_status end,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_flag_id;
  perform public.audit('REPORT_RESOLVED', 'moderation_flag', p_flag_id::text,
    jsonb_build_object('outcome', case when p_dismiss then 'DISMISSED' else 'RESOLVED' end, 'entity_type', v_type));
end;
$$;

-- The profile view gains the open conversation with a match (a "Message" button).
create or replace function public.member_profile_for_viewer(p_viewer uuid, p_owner uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_viewer <> p_owner and public.can_view_profile(p_viewer, p_owner) then
    (select jsonb_build_object(
       'user_id', p.user_id,
       'display_name', p.display_name,
       'age', public.age_in_years(p.date_of_birth),
       'area', a.name,
       'bio', p.bio,
       'intent_relationship', p.intent_relationship,
       'intent_casual', p.intent_casual,
       'verified', public.latest_verification_status(p.user_id) = 'VERIFIED',
       'interests', coalesce((select jsonb_agg(i.name order by i.name) from public.user_interests ui
                              join public.interests i on i.id = ui.interest_id where ui.user_id = p.user_id), '[]'::jsonb),
       'conversation_id', (select c.id from public.matches m join public.conversations c on c.match_id = m.id
                           where m.user_a_id = least(p_viewer, p_owner) and m.user_b_id = greatest(p_viewer, p_owner)
                             and m.status = 'ACTIVE' and c.status = 'OPEN'))
     from public.profiles p
     left join public.areas a on a.id = p.area_id
     where p.user_id = p_owner)
  end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.relationship_eligible(uuid) from public, anon, authenticated, service_role;
revoke all on function public.relationship_compatible(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.member_card(uuid) from public, anon, authenticated, service_role;
revoke all on function public.primary_photo_path(uuid) from public, anon, authenticated, service_role;
revoke all on function public.close_pair(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.messages_broadcast() from public, anon, authenticated, service_role;
revoke all on function public.conversation_other(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.can_send_in(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.file_report(uuid, uuid, public.report_category, text, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.assert_can_report(uuid) from public, anon, authenticated, service_role;
revoke all on function public.can_join_conversation_topic(text) from public, anon;

revoke all on function public.discover_candidates(uuid, uuid, integer, integer, uuid[], integer) from public, anon, authenticated;
revoke all on function public.like_user(uuid, uuid) from public, anon, authenticated;
revoke all on function public.pass_user(uuid, uuid) from public, anon, authenticated;
revoke all on function public.likes_received(uuid) from public, anon, authenticated;
revoke all on function public.matches_list(uuid) from public, anon, authenticated;
revoke all on function public.unmatch(uuid, uuid) from public, anon, authenticated;
revoke all on function public.relationship_summary(uuid) from public, anon, authenticated;
revoke all on function public.conversations_list(uuid) from public, anon, authenticated;
revoke all on function public.conversation_view(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.send_message(uuid, uuid, text, boolean, text[]) from public, anon, authenticated;
revoke all on function public.mark_conversation_read(uuid, uuid) from public, anon, authenticated;
revoke all on function public.submit_report(uuid, uuid, public.report_category, text, uuid) from public, anon, authenticated;
revoke all on function public.submit_conversation_report(uuid, uuid, public.report_category, text) from public, anon, authenticated;
revoke all on function public.staff_report_messages(uuid) from public, anon;
revoke all on function public.staff_flags_queue(integer) from public, anon;

grant execute on function public.discover_candidates(uuid, uuid, integer, integer, uuid[], integer) to service_role;
grant execute on function public.like_user(uuid, uuid) to service_role;
grant execute on function public.pass_user(uuid, uuid) to service_role;
grant execute on function public.likes_received(uuid) to service_role;
grant execute on function public.matches_list(uuid) to service_role;
grant execute on function public.unmatch(uuid, uuid) to service_role;
grant execute on function public.relationship_summary(uuid) to service_role;
grant execute on function public.conversations_list(uuid) to service_role;
grant execute on function public.conversation_view(uuid, uuid, integer) to service_role;
grant execute on function public.send_message(uuid, uuid, text, boolean, text[]) to service_role;
grant execute on function public.mark_conversation_read(uuid, uuid) to service_role;
grant execute on function public.submit_report(uuid, uuid, public.report_category, text, uuid) to service_role;
grant execute on function public.submit_conversation_report(uuid, uuid, public.report_category, text) to service_role;

-- Client-callable: the Realtime join check (only answers for the caller) and staff functions.
grant execute on function public.can_join_conversation_topic(text) to authenticated;
grant execute on function public.staff_report_messages(uuid) to authenticated;
grant execute on function public.staff_flags_queue(integer) to authenticated;
