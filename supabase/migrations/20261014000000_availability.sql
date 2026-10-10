-- Phase 8 — Availability (spec §12, §17 behaviour signals; BR-15, BR-17, BR-18, BR-19, BR-20).
-- A pass-holder goes "Available now" or schedules one window; pool membership is decided at query time
-- by is_in_pool() (window + pass + eligibility + message setting), so a pass ending, a suspension or a
-- hide removes the member at once. A daily job only tidies the stored status afterwards.
-- Open values have no value here: OD-8 (window length, lead time) and the T-19 short-window signal.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('availability.max_window_hours', null, 'Longest availability window in hours (OD-8).'),
  ('availability.max_lead_days', null, 'How many days ahead a window may start (OD-8).'),
  ('availability.short_window_minutes', null, 'A window shorter than this counts as short for the behaviour signal (T-19, §17).'),
  ('availability.short_windows_per_day', null, 'Short windows in 24 hours that flag the member for review (T-19, §17).'),
  ('availability.max_changes_per_hour', null, 'Window changes one member may make in an hour (T-19); no limit while unset.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Tables (§18). BR-20: no location of any kind is stored.
-- ---------------------------------------------------------------------------
create type public.availability_status as enum ('UNAVAILABLE', 'AVAILABLE', 'PAUSED');

create table public.availability (
  user_id    uuid primary key references public.users (id) on delete cascade,
  status     public.availability_status not null default 'UNAVAILABLE',
  start_at   timestamptz,
  end_at     timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_window check (
    (status = 'UNAVAILABLE' and start_at is null and end_at is null)
    or (status <> 'UNAVAILABLE' and start_at is not null and end_at is not null and end_at > start_at)
  )
);
create index availability_pool_idx on public.availability (start_at, end_at) where status = 'AVAILABLE';

-- Window history, for the "frequent short windows" signal (§17) and staff review. Never shown to members.
create table public.availability_windows (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  start_at   timestamptz not null,
  end_at     timestamptz not null,
  ended_at   timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint availability_windows_period check (end_at > start_at)
);
create index availability_windows_user_idx on public.availability_windows (user_id, created_at desc);

-- BR-19: availability is never visible outside the pool, so no client role reads these tables at all.
alter table public.availability enable row level security;
alter table public.availability_windows enable row level security;
revoke all on public.availability, public.availability_windows from anon, authenticated, service_role;
create policy availability_no_client_access on public.availability
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy availability_windows_no_client_access on public.availability_windows
  as restrictive for all to anon, authenticated using (false) with check (false);

create trigger availability_set_updated_at
  before update on public.availability
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Eligibility (§12) and pool membership (BR-17)
-- ---------------------------------------------------------------------------

-- Why a member can't be in the pool now; empty when they can. Hidden or suspended accounts get the
-- neutral ACCOUNT reason (the member isn't told about reports).
create or replace function public.casual_ineligibility(p_user uuid, p_at timestamptz default now())
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select array_remove(array[
      case when u.role <> 'USER' or u.hidden_reason is not null
             or public.effective_account_status(u.status, u.suspended_until) <> 'ACTIVE' then 'ACCOUNT' end,
      case when public.latest_verification_status(u.id) <> 'VERIFIED' then 'NOT_VERIFIED' end, -- BR-15
      case when (select count(*) from public.profile_photos ph where ph.user_id = u.id and ph.status = 'APPROVED')
                  < (public.get_setting('photos.min_required'))::int
             or not exists (select 1 from public.profile_photos ph
                            where ph.user_id = u.id and ph.is_primary and ph.status = 'APPROVED') then 'PHOTOS' end,
      case when not coalesce(p.intent_casual, false) then 'NO_CASUAL_INTENT' end,
      case when not public.has_casual_access(u.id, p_at) then 'NO_PASS' end
    ], null)
    from public.users u
    left join public.profiles p on p.user_id = u.id
    where u.id = p_user
  ), array['ACCOUNT']);
$$;

-- BR-17: in the pool only when AVAILABLE, inside the window, with an active pass, eligible, and open to
-- requests (§13: members who accept requests from Nobody are hidden from the pool, not greyed out).
-- Computed at query time; the stored status is only tidied afterwards.
create or replace function public.is_in_pool(p_user uuid, p_at timestamptz default now())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from public.availability a
           where a.user_id = p_user and a.status = 'AVAILABLE' and a.start_at <= p_at and a.end_at > p_at
         )
     and exists (
           select 1 from public.user_settings s
           where s.user_id = p_user and s.casual_message_permission = 'ANYONE'
         )
     and cardinality(public.casual_ineligibility(p_user, p_at)) = 0;
$$;

-- §17 behaviour signal: many short windows in 24 hours, by the time actually spent in the pool. Leaving
-- or replacing a started window early counts; a schedule changed before it starts doesn't; changing the
-- end of a live window keeps one window. Skipped while T-19 has no values.
create or replace function public.check_short_windows(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_minutes integer;
  v_limit   integer;
  v_count   integer;
begin
  select (value #>> '{}')::int into v_minutes from public.app_settings
  where key = 'availability.short_window_minutes' and value is not null;
  select (value #>> '{}')::int into v_limit from public.app_settings
  where key = 'availability.short_windows_per_day' and value is not null;
  if v_minutes is null or v_limit is null then
    return;
  end if;
  select count(*) into v_count from public.availability_windows w
  where w.user_id = p_user and w.created_at > now() - interval '24 hours'
    and (w.ended_at is null or w.ended_at > w.start_at)              -- a schedule changed before it began isn't a window
    and least(coalesce(w.ended_at, w.end_at), w.end_at) - w.start_at < make_interval(mins => v_minutes);
  if v_count >= v_limit then
    perform public.raise_flag('USER', p_user, 'SHORT_WINDOWS', jsonb_build_object('count', v_count, 'hours', 24));
  end if;
end;
$$;

-- Ends the open history row (left the pool, replaced, or tidied).
create or replace function public.close_availability_window(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.availability_windows set ended_at = now()
  where user_id = p_user and ended_at is null and end_at > now();
$$;

-- ---------------------------------------------------------------------------
-- Member functions (service_role; the member id comes from the session)
-- ---------------------------------------------------------------------------

-- "Available now" (p_start null) or "Schedule". One active-or-scheduled window per member: a new
-- window replaces the old one.
create or replace function public.set_availability(p_user uuid, p_start timestamptz, p_end timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start   timestamptz := coalesce(p_start, now());
  v_reasons text[];
  v_hours   integer;
  v_days    integer;
  v_limit   integer;
  v_current public.availability;
begin
  perform 1 from public.users where id = p_user for update;
  v_reasons := public.casual_ineligibility(p_user);
  if cardinality(v_reasons) > 0 then
    raise exception 'NOT_ELIGIBLE:%', v_reasons[1] using errcode = '22023';
  end if;
  v_hours := (public.get_setting('availability.max_window_hours'))::int; -- OD-8
  v_days := (public.get_setting('availability.max_lead_days'))::int;     -- OD-8
  if p_end is null then
    raise exception 'END_REQUIRED' using errcode = '22023';
  end if;
  -- A start a moment in the past (the form was open a while) means now.
  if v_start < now() - interval '5 minutes' then
    raise exception 'START_IN_PAST' using errcode = '22023';
  end if;
  v_start := greatest(v_start, now());
  if p_end <= v_start then
    raise exception 'END_BEFORE_START' using errcode = '22023';
  end if;
  if p_end - v_start > make_interval(hours => v_hours) then
    raise exception 'WINDOW_TOO_LONG' using errcode = '22023';
  end if;
  if v_start > now() + make_interval(days => v_days) then
    raise exception 'TOO_FAR_AHEAD' using errcode = '22023';
  end if;
  -- BR-17: a window that would start after the pass ends would never be in the pool.
  if v_start >= public.casual_access_until(p_user) then
    raise exception 'PASS_ENDS_FIRST' using errcode = '22023';
  end if;
  select * into v_current from public.availability where user_id = p_user;
  if v_start = now() and v_current.status in ('AVAILABLE', 'PAUSED') and v_current.start_at <= now()
     and v_current.end_at > now() then
    -- Changing the end of a live window: still the same window (history row extended, start kept, a
    -- paused window stays paused).
    v_start := v_current.start_at;
    if p_end - v_start > make_interval(hours => v_hours) then
      raise exception 'WINDOW_TOO_LONG' using errcode = '22023';
    end if;
    update public.availability set end_at = p_end where user_id = p_user;
    update public.availability_windows set end_at = p_end
    where user_id = p_user and ended_at is null and start_at = v_current.start_at;
  else
    select (value #>> '{}')::int into v_limit from public.app_settings
    where key = 'availability.max_changes_per_hour' and value is not null;
    if v_limit is not null and (select count(*) from public.availability_windows
                                where user_id = p_user and created_at > now() - interval '1 hour') >= v_limit then
      raise exception 'TOO_MANY_CHANGES' using errcode = '22023';
    end if;
    perform public.close_availability_window(p_user);
    insert into public.availability (user_id, status, start_at, end_at)
    values (p_user, 'AVAILABLE', v_start, p_end)
    on conflict (user_id) do update set status = 'AVAILABLE', start_at = excluded.start_at, end_at = excluded.end_at;
    insert into public.availability_windows (user_id, start_at, end_at) values (p_user, v_start, p_end);
  end if;
  perform public.check_short_windows(p_user);
  return jsonb_build_object('start_at', v_start, 'end_at', p_end);
end;
$$;

-- Pause: hidden from the pool, window kept (§12 PAUSED). Resume: back in, if the window hasn't ended.
create or replace function public.pause_availability(p_user uuid, p_paused boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.availability;
begin
  perform 1 from public.users where id = p_user for update;
  select * into v_row from public.availability where user_id = p_user for update;
  if not found or v_row.status = 'UNAVAILABLE' or v_row.end_at <= now() then
    raise exception 'NO_WINDOW' using errcode = '22023';
  end if;
  if p_paused then
    update public.availability set status = 'PAUSED' where user_id = p_user;
  else
    if cardinality(public.casual_ineligibility(p_user)) > 0 then
      raise exception 'NOT_ELIGIBLE:%', (public.casual_ineligibility(p_user))[1] using errcode = '22023';
    end if;
    update public.availability set status = 'AVAILABLE' where user_id = p_user;
  end if;
end;
$$;

-- BR-18: members can leave the pool at any time.
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
  perform public.check_short_windows(p_user); -- leaving early counts toward the §17 signal
end;
$$;

-- "Who can send you requests" (§14: Anyone in the pool | Nobody).
create or replace function public.set_casual_message_permission(p_user uuid, p_permission public.message_permission)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_permission is null then
    raise exception 'BAD_PERMISSION' using errcode = '22023';
  end if;
  insert into public.user_settings (user_id, casual_message_permission) values (p_user, p_permission)
  on conflict (user_id) do update set casual_message_permission = excluded.casual_message_permission;
end;
$$;

-- The member's own availability screen and Home card. Caps are read directly: unset caps show as null
-- (the screen says the limit isn't set yet) instead of failing.
create or replace function public.member_availability(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', coalesce(a.status, 'UNAVAILABLE'),
    'start_at', case when a.end_at > now() then a.start_at end,
    'end_at', case when a.end_at > now() then a.end_at end,
    'in_pool', public.is_in_pool(p_user),
    'reasons', to_jsonb(public.casual_ineligibility(p_user)),
    'permission', coalesce((select s.casual_message_permission from public.user_settings s where s.user_id = p_user), 'ANYONE'),
    'pass_until', public.casual_access_until(p_user),
    'max_window_hours', (select (value #>> '{}')::int from public.app_settings
                         where key = 'availability.max_window_hours' and value is not null),
    'max_lead_days', (select (value #>> '{}')::int from public.app_settings
                      where key = 'availability.max_lead_days' and value is not null)
  )
  from (select 1) one
  left join public.availability a on a.user_id = p_user;
$$;

-- Tidy job (daily): records windows that have ended, and clears windows of accounts that can never be
-- in the pool again (banned, deleted, staff). A member who is only briefly ineligible (pass about to be
-- renewed, short suspension, photo back in review) keeps their window: is_in_pool() already keeps them
-- out meanwhile.
create or replace function public.tidy_availability()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.availability_windows w set ended_at = now()
  from public.availability a
  join public.users u on u.id = a.user_id
  where a.user_id = w.user_id and w.ended_at is null and w.end_at > now() and a.status <> 'UNAVAILABLE'
    and (u.status in ('BANNED', 'DELETED') or u.role <> 'USER');
  update public.availability a set status = 'UNAVAILABLE', start_at = null, end_at = null
  from public.users u
  where u.id = a.user_id and a.status <> 'UNAVAILABLE'
    and (a.end_at <= now() or u.status in ('BANNED', 'DELETED') or u.role <> 'USER');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: server only.
-- ---------------------------------------------------------------------------
revoke all on function public.casual_ineligibility(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.is_in_pool(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.check_short_windows(uuid) from public, anon, authenticated, service_role;
revoke all on function public.close_availability_window(uuid) from public, anon, authenticated, service_role;
revoke all on function public.set_availability(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.pause_availability(uuid, boolean) from public, anon, authenticated;
revoke all on function public.leave_pool(uuid) from public, anon, authenticated;
revoke all on function public.set_casual_message_permission(uuid, public.message_permission) from public, anon, authenticated;
revoke all on function public.member_availability(uuid) from public, anon, authenticated;
revoke all on function public.tidy_availability() from public, anon, authenticated;

grant execute on function public.set_availability(uuid, timestamptz, timestamptz) to service_role;
grant execute on function public.pause_availability(uuid, boolean) to service_role;
grant execute on function public.leave_pool(uuid) to service_role;
grant execute on function public.set_casual_message_permission(uuid, public.message_permission) to service_role;
grant execute on function public.member_availability(uuid) to service_role;
grant execute on function public.tidy_availability() to service_role;
