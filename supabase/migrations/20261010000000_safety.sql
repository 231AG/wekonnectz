-- Phase 5 — Safety core (spec §8, §17, §21 Reports / Flags; BR-5, 6, 7, 24, 32, 33, 34).
-- Blocks, reports with categories and automatic actions, moderation flags, suspend / ban / restore.

-- ---------------------------------------------------------------------------
-- Settings: owner values (T-19). No defaults; DEV-ONLY values in seed.sql.
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('reports.auto_hide_threshold', null, 'Distinct reporters within 24 h (high-priority categories) that auto-hide a member (§17, BR-33). Spec recommends 3.'),
  ('reports.per_user_per_day', null, 'Reports a member may send per day (T-19).')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Suspensions become an overlay (Phase 4 audit). A suspension sets suspended_until on a PENDING or
-- ACTIVE account without changing its stored status, so when it ends the member is exactly where
-- they were — a never-verified account can't come back as ACTIVE. Rows stored as SUSPENDED (legacy)
-- keep their Phase 1 meaning.
-- ---------------------------------------------------------------------------
create or replace function public.effective_account_status(p_status public.account_status, p_suspended_until timestamptz)
returns public.account_status
language sql
stable
set search_path = ''
as $$
  select case
    when p_status in ('PENDING', 'ACTIVE') and p_suspended_until is not null and p_suspended_until > now()
      then 'SUSPENDED'::public.account_status
    when p_status = 'SUSPENDED' and p_suspended_until is not null and p_suspended_until <= now()
      then 'ACTIVE'::public.account_status
    else p_status
  end;
$$;

-- Removal from discovery pending review (BR-32 under-18 report, BR-33 report threshold). Not a ban.
alter table public.users
  add column hidden_reason text check (hidden_reason in ('UNDER_18_REPORT', 'REPORT_THRESHOLD')),
  add column hidden_at timestamptz,
  add constraint users_hidden_has_time check ((hidden_reason is null) = (hidden_at is null));

-- ---------------------------------------------------------------------------
-- blocks (spec §17, BR-24): silent, either direction hides everything.
-- ---------------------------------------------------------------------------
create table public.blocks (
  id         uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.users (id) on delete cascade,
  blocked_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocks_not_self check (blocker_id <> blocked_id),
  constraint blocks_unique_pair unique (blocker_id, blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;
revoke all on public.blocks from anon, authenticated;
-- The blocked person must never learn of the block: no client reads at all; the member's own list is
-- served by member_blocked_list().
create policy blocks_no_client_access on public.blocks
  as restrictive for all to anon, authenticated using (false) with check (false);

create or replace function public.is_blocked_pair(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

-- Who may see whose profile and photos (spec §11 "Who sees what"): the owner; otherwise two ACTIVE
-- members (not suspended, BR-5), neither blocking the other (BR-24), the owner not hidden by reports
-- (BR-32, BR-33). Every profile and photo read goes through this check.
create or replace function public.can_view_profile(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_viewer is null or p_owner is null then false
    when p_viewer = p_owner then true
    else coalesce((
      select public.effective_account_status(v.status, v.suspended_until) = 'ACTIVE'
         and public.effective_account_status(o.status, o.suspended_until) = 'ACTIVE'
         and v.role = 'USER' and o.role = 'USER'
         and o.hidden_reason is null
         and not public.is_blocked_pair(p_viewer, p_owner)
      from public.users v, public.users o
      where v.id = p_viewer and o.id = p_owner
    ), false)
  end;
$$;

-- ---------------------------------------------------------------------------
-- reports (spec §17 categories and priority) and internal notes
-- ---------------------------------------------------------------------------
create type public.report_category as enum (
  'UNDER_18', 'SELLING_SEX', 'MONEY_SCAM', 'THREATS_HARASSMENT', 'FAKE_PROFILE', 'INAPPROPRIATE_PHOTO', 'SPAM', 'OTHER'
);
create type public.report_priority as enum ('HIGH', 'MEDIUM', 'LOW');
create type public.report_status as enum ('OPEN', 'RESOLVED', 'DISMISSED');

create or replace function public.report_priority_for(p_category public.report_category)
returns public.report_priority
language sql
immutable
set search_path = ''
as $$
  select case
    when p_category in ('UNDER_18', 'SELLING_SEX', 'MONEY_SCAM', 'THREATS_HARASSMENT') then 'HIGH'::public.report_priority
    when p_category in ('FAKE_PROFILE', 'INAPPROPRIATE_PHOTO') then 'MEDIUM'::public.report_priority
    else 'LOW'::public.report_priority
  end;
$$;

create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references public.users (id) on delete cascade,
  reported_user_id uuid not null references public.users (id) on delete cascade,
  category         public.report_category not null,
  priority         public.report_priority not null,
  description      text check (description is null or length(description) <= 500),
  photo_id         uuid references public.profile_photos (id) on delete set null,
  status           public.report_status not null default 'OPEN',
  reviewed_by      uuid references public.users (id) on delete set null,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  constraint reports_not_self check (reporter_id <> reported_user_id),
  constraint reports_reviewed_when_closed check ((status = 'OPEN') = (reviewed_at is null))
);
create index reports_queue_idx on public.reports (priority, created_at) where status = 'OPEN';
create index reports_target_idx on public.reports (reported_user_id, created_at desc);
create index reports_reporter_idx on public.reports (reporter_id, created_at desc);

alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
create policy reports_no_client_access on public.reports
  as restrictive for all to anon, authenticated using (false) with check (false);

create table public.report_notes (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.reports (id) on delete cascade,
  author_id  uuid not null references public.users (id) on delete cascade,
  note       text not null check (length(btrim(note)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index report_notes_report_idx on public.report_notes (report_id, created_at);

alter table public.report_notes enable row level security;
revoke all on public.report_notes from anon, authenticated;
create policy report_notes_no_client_access on public.report_notes
  as restrictive for all to anon, authenticated using (false) with check (false);

-- ---------------------------------------------------------------------------
-- moderation_flags (spec §17 detection and behaviour signals; §21 Flags queue). Phase 5 writes
-- MANY_REPORTS and AGE_DOUBT; Phases 6–9 add message, request, availability and claim signals.
-- ---------------------------------------------------------------------------
create type public.flag_status as enum ('OPEN', 'RESOLVED', 'DISMISSED');

create table public.moderation_flags (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('USER', 'PHOTO', 'BIO', 'MESSAGE', 'REQUEST', 'CLAIM')),
  entity_id   uuid not null,
  reason      text not null check (reason ~ '^[A-Z0-9_]{2,40}$'),
  details     jsonb not null default '{}'::jsonb,
  status      public.flag_status not null default 'OPEN',
  reviewed_by uuid references public.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index moderation_flags_queue_idx on public.moderation_flags (created_at) where status = 'OPEN';
-- One open flag per thing and reason: repeated signals don't flood the queue.
create unique index moderation_flags_one_open on public.moderation_flags (entity_type, entity_id, reason)
  where status = 'OPEN';

alter table public.moderation_flags enable row level security;
revoke all on public.moderation_flags from anon, authenticated;
create policy moderation_flags_no_client_access on public.moderation_flags
  as restrictive for all to anon, authenticated using (false) with check (false);

create or replace function public.raise_flag(p_entity_type text, p_entity_id uuid, p_reason text, p_details jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.moderation_flags (entity_type, entity_id, reason, details)
  values (p_entity_type, p_entity_id, p_reason, coalesce(p_details, '{}'::jsonb))
  on conflict (entity_type, entity_id, reason) where status = 'OPEN' do nothing;
$$;

-- Q23: "doubt about age → reject and escalate" (§9). The rejection also raises a flag at once, so an
-- admin looks at the account without waiting for a new selfie.
create or replace function public.verifications_age_doubt_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.raise_flag('USER', new.user_id, 'AGE_DOUBT', jsonb_build_object('verification_id', new.id));
  return new;
end;
$$;

create trigger verifications_age_doubt_flag
  after update of status on public.verifications
  for each row
  when (new.status = 'REJECTED' and new.rejection_reason = 'AGE_DOUBT' and old.status is distinct from new.status)
  execute function public.verifications_age_doubt_flag();

-- ---------------------------------------------------------------------------
-- Member actions (service_role, with the member id from the session)
-- ---------------------------------------------------------------------------

-- Members who may use safety tools: a member account that may act (not banned or deleted).
create or replace function public.assert_member_can_act(p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.users u
    where u.id = p_user_id and u.role = 'USER'
      and public.effective_account_status(u.status, u.suspended_until) not in ('BANNED', 'DELETED')
  ) then
    raise exception 'ACCOUNT_CANNOT_ACT' using errcode = '42501';
  end if;
end;
$$;

-- BR-24: block silently. Works whether or not the blocker can currently see the other profile.
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
  insert into public.blocks (blocker_id, blocked_id) values (p_user_id, p_target)
  on conflict (blocker_id, blocked_id) do nothing;
end;
$$;

create or replace function public.unblock_user(p_user_id uuid, p_target uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.blocks where blocker_id = p_user_id and blocked_id = p_target;
$$;

-- The member's own block list (first name only; no photos: a blocked profile is never shown).
create or replace function public.member_blocked_list(p_user_id uuid)
returns table (user_id uuid, display_name text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.blocked_id, p.display_name, b.created_at
  from public.blocks b
  left join public.profiles p on p.user_id = b.blocked_id
  where b.blocker_id = p_user_id
  order by b.created_at desc;
$$;

-- Report a member (spec §17). Automatic actions:
--   UNDER_18             → hidden at once, pending review (BR-32)
--   HIGH categories      → hidden when distinct reporters within 24 h reach the threshold (BR-33)
--   INAPPROPRIATE_PHOTO  → that photo hidden pending review
--   any category         → MANY_REPORTS flag at the same threshold (behaviour signal)
-- The reporter may report a member they have blocked (block first, report after).
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
declare
  v_id        uuid;
  v_threshold integer;
  v_high      integer;
  v_any       integer;
begin
  perform public.assert_member_can_act(p_reporter);
  if p_target is null or p_target = p_reporter
     or not exists (select 1 from public.users where id = p_target and role = 'USER') then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;
  -- Only someone who could see the member, or who blocked them, can report them.
  if not (public.can_view_profile(p_reporter, p_target)
          or exists (select 1 from public.blocks where blocker_id = p_reporter and blocked_id = p_target)) then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;
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

  insert into public.reports (reporter_id, reported_user_id, category, priority, description, photo_id)
  values (p_reporter, p_target, p_category, public.report_priority_for(p_category),
          nullif(btrim(coalesce(p_description, '')), ''),
          case when p_category = 'INAPPROPRIATE_PHOTO' then p_photo_id end)
  returning id into v_id;

  if p_category = 'UNDER_18' then
    update public.users set hidden_reason = 'UNDER_18_REPORT', hidden_at = now()
    where id = p_target and (hidden_reason is null or hidden_reason <> 'UNDER_18_REPORT');
  end if;

  if p_category = 'INAPPROPRIATE_PHOTO' then
    update public.profile_photos set status = 'HIDDEN' where id = p_photo_id and status = 'APPROVED';
    perform public.renumber_photos(p_target);
  end if;

  v_threshold := (public.get_setting('reports.auto_hide_threshold'))::int;
  select count(distinct reporter_id) filter (where priority = 'HIGH'), count(distinct reporter_id)
    into v_high, v_any
  from public.reports
  where reported_user_id = p_target and created_at > now() - interval '24 hours';

  if v_high >= v_threshold then
    update public.users set hidden_reason = 'REPORT_THRESHOLD', hidden_at = now()
    where id = p_target and hidden_reason is null;
  end if;
  if v_any >= v_threshold then
    perform public.raise_flag('USER', p_target, 'MANY_REPORTS', jsonb_build_object('reporters_24h', v_any));
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: Reports queue (spec §21: priority-sorted; investigate, notes, suspend, ban, dismiss, resolve)
-- ---------------------------------------------------------------------------
create or replace function public.assert_staff_target(p_target uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Staff act only on member accounts, never on their own or another staff account (§7).
  if p_target = auth.uid() then
    raise exception 'OWN_CONTENT' using errcode = '42501';
  end if;
  if not exists (select 1 from public.users where id = p_target and role = 'USER') then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.staff_reports_queue(p_include_closed boolean default false, p_limit integer default 100)
returns table (
  report_id        uuid,
  reported_user_id uuid,
  category         public.report_category,
  priority         public.report_priority,
  status           public.report_status,
  created_at       timestamptz,
  target_hidden    text,
  reporters_24h    bigint
)
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
    select r.id, r.reported_user_id, r.category, r.priority, r.status, r.created_at, u.hidden_reason,
           (select count(distinct x.reporter_id) from public.reports x
            where x.reported_user_id = r.reported_user_id and x.created_at > now() - interval '24 hours')
    from public.reports r
    join public.users u on u.id = r.reported_user_id
    where p_include_closed or r.status = 'OPEN'
    order by (r.status = 'OPEN') desc, r.priority, r.created_at
    limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

-- One report with the reported member's account summary, other reports and internal notes. The
-- description is member text: shown to staff, never logged or audited.
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
    'reported_user_id', r.reported_user_id,
    'display_name', p.display_name,
    'age', public.age_in_years(p.date_of_birth),
    'account_status', public.effective_account_status(u.status, u.suspended_until),
    'stored_status', u.status,
    'suspended_until', case when u.suspended_until > now() then u.suspended_until end,
    'hidden_reason', u.hidden_reason,
    'verification', public.latest_verification_status(u.id),
    'reporters_24h', (select count(distinct x.reporter_id) from public.reports x
                      where x.reported_user_id = r.reported_user_id and x.created_at > now() - interval '24 hours'),
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

-- Server-only: photo paths of the reported member (including a photo hidden by this report), signed
-- after requireStaff().
create or replace function public.report_review_paths(p_report_id uuid)
returns table (id uuid, storage_path text, status public.photo_status, is_reported boolean, sort_order integer)
language sql
stable
security definer
set search_path = ''
as $$
  select ph.id, ph.storage_path, ph.status, ph.id = r.photo_id, ph.sort_order
  from public.reports r
  join public.profile_photos ph on ph.user_id = r.reported_user_id
  where r.id = p_report_id and ph.status in ('APPROVED', 'PENDING_REVIEW', 'HIDDEN')
  order by ph.sort_order;
$$;

create or replace function public.add_report_note(p_report_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff('MODERATOR') then
    raise exception 'NOT_STAFF' using errcode = '42501';
  end if;
  if not exists (select 1 from public.reports where id = p_report_id) then
    raise exception 'REPORT_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.report_notes (report_id, author_id, note) values (p_report_id, auth.uid(), btrim(p_note));
end;
$$;

-- Close a report (spec §21: dismiss / resolve). Optionally restores visibility (when no other HIGH
-- report is open about the member) and decides a photo the report hid. Audited (BR-34).
create or replace function public.resolve_report(
  p_report_id         uuid,
  p_dismiss           boolean,
  p_restore_visibility boolean default false,
  p_photo_reason      public.photo_rejection_reason default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
  v_photo  uuid;
  v_unhid  boolean := false;
begin
  if not public.is_staff('MODERATOR') then
    raise exception 'NOT_STAFF' using errcode = '42501';
  end if;
  select reported_user_id, photo_id into v_target, v_photo from public.reports where id = p_report_id;
  if v_target is null then
    raise exception 'REPORT_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public.assert_staff_target(v_target);
  perform 1 from public.users where id = v_target for update;
  perform 1 from public.reports where id = p_report_id and status = 'OPEN' for update;
  if not found then
    raise exception 'REPORT_NOT_OPEN' using errcode = 'P0002';
  end if;

  update public.reports
     set status = case when p_dismiss then 'DISMISSED'::public.report_status else 'RESOLVED'::public.report_status end,
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_report_id;

  -- A photo hidden by this report: back to approved, or rejected with a reason.
  if v_photo is not null and exists (select 1 from public.profile_photos where id = v_photo and status = 'HIDDEN') then
    if p_photo_reason is not null then
      update public.profile_photos
         set status = 'REJECTED', rejection_reason = p_photo_reason, reviewed_by = auth.uid(), reviewed_at = now()
       where id = v_photo;
    else
      update public.profile_photos set status = 'APPROVED' where id = v_photo;
    end if;
    perform public.renumber_photos(v_target);
  end if;

  if p_restore_visibility then
    if exists (select 1 from public.reports where reported_user_id = v_target and status = 'OPEN' and priority = 'HIGH') then
      raise exception 'HIGH_REPORTS_OPEN' using errcode = '22023';
    end if;
    update public.users set hidden_reason = null, hidden_at = null where id = v_target and hidden_reason is not null;
    v_unhid := found;
  end if;

  perform public.audit('REPORT_RESOLVED', 'report', p_report_id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'user_id', v_target,
      'outcome', case when p_dismiss then 'DISMISSED' else 'RESOLVED' end,
      'visibility_restored', case when v_unhid then true end,
      'photo_rejected', p_photo_reason)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: suspend (MODERATOR, time-limited), ban and restore (ADMIN) — spec §7, §8; audited.
-- ---------------------------------------------------------------------------
create or replace function public.suspend_user(p_target uuid, p_until timestamptz, p_report_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff('MODERATOR') then
    raise exception 'NOT_STAFF' using errcode = '42501';
  end if;
  perform public.assert_staff_target(p_target);
  if p_until is null or p_until <= now() or p_until > now() + interval '366 days' then
    raise exception 'INVALID_SUSPENSION_END' using errcode = '22023';
  end if;
  update public.users set suspended_until = p_until
  where id = p_target and status in ('PENDING', 'ACTIVE');
  if not found then
    raise exception 'ACCOUNT_NOT_SUSPENDABLE' using errcode = '22023';
  end if;
  perform public.audit('USER_SUSPENDED', 'user', p_target::text,
    jsonb_strip_nulls(jsonb_build_object('until', p_until, 'report_id', p_report_id)));
end;
$$;

-- BR-6: banned accounts can't authenticate (Phase 1 trigger ends their sessions) and the phone can't
-- register again (BR-3: phone_blocklist).
create or replace function public.ban_user(p_target uuid, p_reason text, p_report_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
begin
  if not public.is_staff('ADMIN') then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  perform public.assert_staff_target(p_target);
  if p_reason is null or p_reason !~ '^[A-Z_]{3,40}$' then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  update public.users set status = 'BANNED', suspended_until = null, hidden_reason = null, hidden_at = null
  where id = p_target and status <> 'BANNED';
  if not found then
    raise exception 'ALREADY_BANNED' using errcode = '22023';
  end if;
  select nullif(phone, '') into v_phone from auth.users where id = p_target;
  if v_phone is not null then
    insert into public.phone_blocklist (phone_hash, reason, created_by)
    values (public.phone_hash(v_phone), p_reason, auth.uid())
    on conflict (phone_hash) do nothing;
  end if;
  perform public.audit('USER_BANNED', 'user', p_target::text,
    jsonb_strip_nulls(jsonb_build_object('reason', p_reason, 'report_id', p_report_id)));
end;
$$;

-- Lifts a ban or a current suspension. A banned account returns to PENDING and is promoted again only
-- if it is still verified with 3 approved photos; the phone leaves the blocklist.
create or replace function public.restore_user(p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was  public.account_status;
  v_phone text;
begin
  if not public.is_staff('ADMIN') then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  perform public.assert_staff_target(p_target);
  select status into v_was from public.users where id = p_target for update;
  if v_was = 'BANNED' then
    update public.users set status = 'PENDING', suspended_until = null where id = p_target;
    select nullif(phone, '') into v_phone from auth.users where id = p_target;
    if v_phone is not null then
      delete from public.phone_blocklist where phone_hash = public.phone_hash(v_phone);
    end if;
    perform public.recompute_account_state(p_target);
  elsif exists (select 1 from public.users where id = p_target and suspended_until > now()) then
    update public.users set suspended_until = null,
                            status = case when status = 'SUSPENDED' then 'ACTIVE' else status end
    where id = p_target;
  else
    raise exception 'NOTHING_TO_RESTORE' using errcode = '22023';
  end if;
  perform public.audit('USER_RESTORED', 'user', p_target::text, jsonb_build_object('from', v_was));
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: Flags queue (spec §21)
-- ---------------------------------------------------------------------------
create or replace function public.staff_flags_queue(p_limit integer default 100)
returns table (flag_id uuid, entity_type text, entity_id uuid, reason text, details jsonb, created_at timestamptz,
               display_name text, account_status public.account_status, hidden_reason text)
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
    select f.id, f.entity_type, f.entity_id, f.reason, f.details, f.created_at, p.display_name,
           public.effective_account_status(u.status, u.suspended_until), u.hidden_reason
    from public.moderation_flags f
    left join public.users u on f.entity_type = 'USER' and u.id = f.entity_id
    left join public.profiles p on f.entity_type = 'USER' and p.user_id = f.entity_id
    where f.status = 'OPEN'
    order by f.created_at
    limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

create or replace function public.resolve_flag(p_flag_id uuid, p_dismiss boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity uuid;
  v_type   text;
begin
  if not public.is_staff('MODERATOR') then
    raise exception 'NOT_STAFF' using errcode = '42501';
  end if;
  select entity_id, entity_type into v_entity, v_type from public.moderation_flags
  where id = p_flag_id and status = 'OPEN' for update;
  if v_entity is null then
    raise exception 'FLAG_NOT_OPEN' using errcode = 'P0002';
  end if;
  if v_type = 'USER' and v_entity = auth.uid() then
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

-- Dashboard counts gain reports and flags.
create or replace function public.staff_queue_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff('MODERATOR') then
    raise exception 'NOT_STAFF' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'photos_pending', (select count(*) from public.profile_photos where status = 'PENDING_REVIEW'),
    'photos_oldest', (select min(submitted_at) from public.profile_photos where status = 'PENDING_REVIEW'),
    'verifications_pending', (select count(*) from public.verifications where status = 'PENDING'),
    'verifications_escalated', (select count(*) from public.verifications where status = 'PENDING' and escalated),
    'verifications_oldest', (select min(submitted_at) from public.verifications where status = 'PENDING'),
    'reports_open', (select count(*) from public.reports where status = 'OPEN'),
    'reports_high', (select count(*) from public.reports where status = 'OPEN' and priority = 'HIGH'),
    'flags_open', (select count(*) from public.moderation_flags where status = 'OPEN')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Member profile view (spec §17: report and block from every profile). Server-only; the server
-- signs photo URLs with photos_for_viewer(), which applies the same can_view_profile() check.
-- ---------------------------------------------------------------------------
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
                              join public.interests i on i.id = ui.interest_id where ui.user_id = p.user_id), '[]'::jsonb))
     from public.profiles p
     left join public.areas a on a.id = p.area_id
     where p.user_id = p_owner)
  end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.is_blocked_pair(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.report_priority_for(public.report_category) from public, anon, authenticated, service_role;
revoke all on function public.raise_flag(text, uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.verifications_age_doubt_flag() from public, anon, authenticated, service_role;
revoke all on function public.assert_member_can_act(uuid) from public, anon, authenticated, service_role;
revoke all on function public.assert_staff_target(uuid) from public, anon, authenticated, service_role;
revoke all on function public.block_user(uuid, uuid) from public, anon, authenticated;
revoke all on function public.unblock_user(uuid, uuid) from public, anon, authenticated;
revoke all on function public.member_blocked_list(uuid) from public, anon, authenticated;
revoke all on function public.submit_report(uuid, uuid, public.report_category, text, uuid) from public, anon, authenticated;
revoke all on function public.member_profile_for_viewer(uuid, uuid) from public, anon, authenticated;
revoke all on function public.report_review_paths(uuid) from public, anon, authenticated;
revoke all on function public.staff_reports_queue(boolean, integer) from public, anon;
revoke all on function public.staff_report_detail(uuid) from public, anon;
revoke all on function public.add_report_note(uuid, text) from public, anon;
revoke all on function public.resolve_report(uuid, boolean, boolean, public.photo_rejection_reason) from public, anon;
revoke all on function public.suspend_user(uuid, timestamptz, uuid) from public, anon;
revoke all on function public.ban_user(uuid, text, uuid) from public, anon;
revoke all on function public.restore_user(uuid) from public, anon;
revoke all on function public.staff_flags_queue(integer) from public, anon;
revoke all on function public.resolve_flag(uuid, boolean) from public, anon;

grant execute on function public.block_user(uuid, uuid) to service_role;
grant execute on function public.unblock_user(uuid, uuid) to service_role;
grant execute on function public.member_blocked_list(uuid) to service_role;
grant execute on function public.submit_report(uuid, uuid, public.report_category, text, uuid) to service_role;
grant execute on function public.member_profile_for_viewer(uuid, uuid) to service_role;
grant execute on function public.report_review_paths(uuid) to service_role;

-- Staff functions check is_staff() (role + password + TOTP) and, where it matters, ADMIN.
grant execute on function public.staff_reports_queue(boolean, integer) to authenticated;
grant execute on function public.staff_report_detail(uuid) to authenticated;
grant execute on function public.add_report_note(uuid, text) to authenticated;
grant execute on function public.resolve_report(uuid, boolean, boolean, public.photo_rejection_reason) to authenticated;
grant execute on function public.suspend_user(uuid, timestamptz, uuid) to authenticated;
grant execute on function public.ban_user(uuid, text, uuid) to authenticated;
grant execute on function public.restore_user(uuid) to authenticated;
grant execute on function public.staff_flags_queue(integer) to authenticated;
grant execute on function public.resolve_flag(uuid, boolean) to authenticated;
