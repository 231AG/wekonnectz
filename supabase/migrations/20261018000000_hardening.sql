-- Phase 12 — Hardening. OTP code attempts limited per phone and per IP (Supabase Auth's own per-IP
-- limit only sees our server's address); abandoned sign-ups are purged like deleted accounts.

insert into public.app_settings (key, value, description, kind, min_value, max_value, super_admin_only) values
  ('otp.max_verify_per_phone_per_hour', null,
   'Sign-in / sign-up code attempts per phone number per hour (spec §22; T-19).', 'int', 1, 1000, true),
  ('otp.max_verify_per_ip_per_hour', null,
   'Sign-in / sign-up code attempts per client IP per hour (spec §22; T-19).', 'int', 1, 100000, true),
  ('account.abandoned_signup_days', null,
   'Days after the last sign-in before a sign-up that never finished (nothing waiting for review) is purged. No purge while unset.',
   'int', 7, 3650, true)
on conflict (key) do nothing;

-- Checked by the server before every code is tried. Counts attempts, right or wrong: a correct code
-- signs the member in, so only a guesser ever reaches the limit.
create or replace function public.otp_verify_allowed(p_phone text, p_ip text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select public.rate_limit_hit('otp.verify.phone', coalesce(public.normalize_phone(p_phone), 'invalid'), 3600,
                               (public.get_setting('otp.max_verify_per_phone_per_hour'))::int)
     and public.rate_limit_hit('otp.verify.ip', coalesce(p_ip, 'unknown'), 3600,
                               (public.get_setting('otp.max_verify_per_ip_per_hour'))::int);
$$;

-- Accounts due for purge (OD-7): deleted ones past the retention period (Phase 10), and sign-ups
-- that never finished — still PENDING, nothing waiting for staff to review, no sign-in for the set
-- number of days. Their photos and selfies go with them; nothing else of theirs exists to keep.
create or replace function public.accounts_due_for_purge(p_limit integer default 50)
returns table (user_id uuid, photo_paths text[], selfie_paths text[])
language sql
stable
security definer
set search_path = ''
as $$
  with due as (
    select u.id, u.deleted_at as since
    from public.users u
    cross join (select (value #>> '{}')::int as days from public.app_settings
                where key = 'account.deletion_purge_days' and value is not null) r
    -- A member who deleted and was then banned (Q54) is purged too; the phone blocklist entry stays.
    where u.status in ('DELETED', 'BANNED') and u.deleted_at is not null and u.role = 'USER'
      and u.deleted_at < now() - make_interval(days => r.days)
      -- Open reports against the member are decided first (staff may still ban the account).
      and not exists (select 1 from public.reports rp where rp.reported_user_id = u.id and rp.status = 'OPEN')
    union all
    select u.id, coalesce(au.last_sign_in_at, au.created_at)
    from public.users u
    join auth.users au on au.id = u.id
    cross join (select (value #>> '{}')::int as days from public.app_settings
                where key = 'account.abandoned_signup_days' and value is not null) a
    where u.status = 'PENDING' and u.role = 'USER' and u.deleted_at is null
      and coalesce(au.last_sign_in_at, au.created_at) < now() - make_interval(days => a.days)
      and not exists (select 1 from public.verifications v where v.user_id = u.id and v.status = 'PENDING')
      and not exists (select 1 from public.profile_photos ph where ph.user_id = u.id and ph.status = 'PENDING_REVIEW')
      and not exists (select 1 from public.reports rp where rp.reported_user_id = u.id and rp.status = 'OPEN')
  )
  select d.id,
         coalesce((select array_agg(ph.storage_path) from public.profile_photos ph
                   where ph.user_id = d.id and ph.storage_path is not null), '{}'),
         coalesce((select array_agg(v.selfie_storage_path) from public.verifications v
                   where v.user_id = d.id and v.selfie_storage_path is not null), '{}')
  from due d
  order by d.since
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- Discover (§11) as one set-based query (load check: the per-member version took ~0.7 s with 3,000
-- members). Same rules and the same daily order as before; pgTAP checks it against the per-member
-- rules (relationship_eligible, relationship_compatible, is_blocked_pair).
create or replace function public.discover_candidates(
  p_viewer uuid, p_area_id uuid default null, p_min_age integer default null, p_max_age integer default null,
  p_interest_ids uuid[] default null, p_limit integer default 1
)
returns table (card jsonb, photo_path text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cooldown integer := (public.get_setting('relationship.pass_cooldown_days'))::int;
  v_min_photos integer := (public.get_setting('photos.min_required'))::int;
  v_me public.profiles;
begin
  if not public.relationship_eligible(p_viewer) then
    raise exception 'NOT_ELIGIBLE' using errcode = '42501';
  end if;
  select * into v_me from public.profiles where user_id = p_viewer;
  return query
    with base as (
      select o.user_id
      from public.profiles o
      join public.users u on u.id = o.user_id
      where o.user_id <> p_viewer
        and u.role = 'USER' and u.hidden_reason is null
        and public.effective_account_status(u.status, u.suspended_until) = 'ACTIVE'
        and o.intent_relationship
        -- "Interested in" both ways.
        and o.gender = any (v_me.seeking_genders) and v_me.gender = any (o.seeking_genders)
        and (p_area_id is null or o.area_id = p_area_id)
        and (p_min_age is null or public.age_in_years(o.date_of_birth) >= p_min_age)
        and (p_max_age is null or public.age_in_years(o.date_of_birth) <= p_max_age)
        and (p_interest_ids is null or cardinality(p_interest_ids) = 0
             or exists (select 1 from public.user_interests ui where ui.user_id = o.user_id and ui.interest_id = any (p_interest_ids)))
        and not exists (select 1 from public.blocks b
                        where (b.blocker_id = p_viewer and b.blocked_id = o.user_id) or (b.blocker_id = o.user_id and b.blocked_id = p_viewer))
        and not exists (select 1 from public.likes l where l.sender_id = p_viewer and l.receiver_id = o.user_id)
        and not exists (select 1 from public.passes s where s.sender_id = p_viewer and s.receiver_id = o.user_id
                        and s.created_at > now() - make_interval(days => v_cooldown))
        and not exists (select 1 from public.matches m
                        where m.user_a_id = least(p_viewer, o.user_id) and m.user_b_id = greatest(p_viewer, o.user_id))
    ), photos as (
      select ph.user_id, count(*) filter (where ph.status = 'APPROVED') as approved,
             bool_or(ph.is_primary and ph.status = 'APPROVED') as has_primary
      from public.profile_photos ph where ph.user_id in (select user_id from base)
      group by ph.user_id
    ), verified as (
      -- Latest finished verification, as latest_verification_status() reads it.
      select distinct on (v.user_id) v.user_id, v.status
      from public.verifications v
      where v.user_id in (select user_id from base) and v.status <> 'AWAITING_SELFIE'
      order by v.user_id, v.created_at desc
    ), picked as (
      select b.user_id from base b
      join photos ph on ph.user_id = b.user_id and ph.approved >= v_min_photos and ph.has_primary
      join verified v on v.user_id = b.user_id and v.status = 'VERIFIED'
      -- A stable daily shuffle per viewer: the same order all day, a new one tomorrow.
      order by md5(p_viewer::text || b.user_id::text || current_date::text)
      limit least(greatest(coalesce(p_limit, 1), 1), 20)
    )
    select public.member_card(pk.user_id), public.primary_photo_path(pk.user_id)
    from picked pk
    order by md5(p_viewer::text || pk.user_id::text || current_date::text);
end;
$$;

revoke all on function public.otp_verify_allowed(text, text) from public, anon, authenticated;
grant execute on function public.otp_verify_allowed(text, text) to service_role;
