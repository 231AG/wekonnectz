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

revoke all on function public.otp_verify_allowed(text, text) from public, anon, authenticated;
grant execute on function public.otp_verify_allowed(text, text) to service_role;
