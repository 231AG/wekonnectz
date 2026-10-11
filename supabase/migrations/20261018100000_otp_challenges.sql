-- Phase 12 audit — sign-in codes are checked by our server only.
--
-- Anyone can call Supabase Auth's public /verify endpoint with the anon key, so a limit in our server
-- action alone can be skipped. Two changes close that:
-- 1. The code in the SMS is our own (U), not the one Supabase Auth made (C). The Send-SMS hook keeps C
--    and a keyed hash of U. Our server checks U (with the per-phone / per-IP limits) and only then
--    calls verifyOtp with C. A member never sees C, so guessing at /verify can't be turned into a
--    working code for our sign-in screen.
-- 2. The custom access token hook refuses to open a member session unless our server checked the
--    code in the last minute (a single-use ticket). A correct guess of C at /verify gets no session.

create table public.otp_challenges (
  phone_hash        text primary key,
  -- Supabase Auth's code, handed back to Auth by our server once U is right. Short-lived; cleared on use.
  auth_code         text not null check (auth_code ~ '^[0-9]{4,10}$'),
  -- hmac_with_pepper('otp:' || phone || ':' || U)
  code_hash         text not null,
  sent_at           timestamptz not null default now(),
  ticket_expires_at timestamptz
);
alter table public.otp_challenges enable row level security;
revoke all on public.otp_challenges from anon, authenticated, service_role;
create policy otp_challenges_no_client_access on public.otp_challenges
  as restrictive for all to anon, authenticated using (false) with check (false);

-- Called by the Send-SMS hook route for each code Supabase Auth sends. The newest code replaces the
-- old one (Auth also accepts only its newest code).
create or replace function public.record_otp_challenge(p_phone text, p_auth_code text, p_member_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := public.normalize_phone(p_phone);
begin
  if v_phone is null or p_member_code !~ '^[0-9]{6}$' then
    raise exception 'BAD_CHALLENGE' using errcode = '22023';
  end if;
  insert into public.otp_challenges (phone_hash, auth_code, code_hash, sent_at, ticket_expires_at)
  values (public.phone_hash(v_phone), p_auth_code,
          public.hmac_with_pepper('otp:' || v_phone || ':' || p_member_code), now(), null)
  on conflict (phone_hash) do update
    set auth_code = excluded.auth_code, code_hash = excluded.code_hash, sent_at = now(), ticket_expires_at = null;
end;
$$;

-- Checks the code a member typed. Every attempt counts against the per-phone and per-IP limits (a
-- correct code signs the member in, so only a guesser reaches them). On a match: a one-minute ticket
-- for the token hook, and Supabase Auth's code to verify with. Codes older than 10 minutes are refused
-- (Auth's own expiry may be shorter).
create or replace function public.otp_check_code(p_phone text, p_ip text, p_code text)
returns table (outcome text, auth_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := public.normalize_phone(p_phone);
  v_row public.otp_challenges;
begin
  if not public.rate_limit_hit('otp.verify.phone', coalesce(v_phone, 'invalid'), 3600,
                               (public.get_setting('otp.max_verify_per_phone_per_hour'))::int) then
    return query select 'LIMITED'::text, null::text;
    return;
  end if;
  if not public.rate_limit_hit('otp.verify.ip', coalesce(p_ip, 'unknown'), 3600,
                               (public.get_setting('otp.max_verify_per_ip_per_hour'))::int) then
    return query select 'LIMITED'::text, null::text;
    return;
  end if;
  if v_phone is null or coalesce(p_code, '') !~ '^[0-9]{6}$' then
    return query select 'WRONG'::text, null::text;
    return;
  end if;
  select * into v_row from public.otp_challenges c where c.phone_hash = public.phone_hash(v_phone) for update;
  if v_row.phone_hash is null or v_row.sent_at < now() - interval '10 minutes'
     or v_row.code_hash <> public.hmac_with_pepper('otp:' || v_phone || ':' || p_code) then
    return query select 'WRONG'::text, null::text;
    return;
  end if;
  update public.otp_challenges c set ticket_expires_at = now() + interval '1 minute'
  where c.phone_hash = v_row.phone_hash;
  return query select 'OK'::text, v_row.auth_code;
end;
$$;

-- Replaced by otp_check_code.
drop function public.otp_verify_allowed(text, text);

-- Supabase Auth "custom access token" hook. A member session (role USER) is opened only with a ticket
-- from otp_check_code, used once. Refreshing an existing session is unaffected; staff sign in with
-- email + password + TOTP and are unaffected.
create or replace function public.hook_custom_access_token(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (event ->> 'user_id')::uuid;
  v_method text := event ->> 'authentication_method';
  v_phone text;
  v_role public.user_role;
begin
  if v_method = 'token_refresh' then
    return jsonb_build_object('claims', event -> 'claims');
  end if;
  select u.role into v_role from public.users u where u.id = v_user;
  if v_role is not null and v_role <> 'USER' then
    return jsonb_build_object('claims', event -> 'claims');
  end if;
  select public.normalize_phone(au.phone) into v_phone from auth.users au where au.id = v_user;
  delete from public.otp_challenges c
  where c.phone_hash = public.phone_hash(v_phone) and c.ticket_expires_at > now();
  if v_phone is not null and found then
    return jsonb_build_object('claims', event -> 'claims');
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403, 'message', 'Sign in through the WeKonnectz app.'));
end;
$$;

revoke all on function public.record_otp_challenge(text, text, text) from public, anon, authenticated;
revoke all on function public.otp_check_code(text, text, text) from public, anon, authenticated;
revoke all on function public.hook_custom_access_token(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.record_otp_challenge(text, text, text) to service_role;
grant execute on function public.otp_check_code(text, text, text) to service_role;
grant execute on function public.hook_custom_access_token(jsonb) to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- Staff passwords: the per-account limit moves into the password hook, so it also covers sign-ins
-- sent straight to Supabase Auth (the server action still limits per client IP). Only failures count;
-- once an account reaches the limit, even the right password is refused until the hour passes.
-- ---------------------------------------------------------------------------
create or replace function public.hook_password_verification_attempt(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (event ->> 'user_id')::uuid;
  v_role public.user_role;
  v_email text;
begin
  select u.role into v_role from public.users u where u.id = v_user;
  if v_role is null or v_role = 'USER' then
    return jsonb_build_object('decision', 'reject', 'message', 'Sign in with your phone number.', 'should_logout_user', true);
  end if;
  select lower(au.email) into v_email from auth.users au where au.id = v_user;
  if not coalesce((event ->> 'valid')::boolean, false) then
    perform public.rate_limit_hit('staff_login.account', coalesce(v_email, v_user::text), 3600, 2147483647);
  end if;
  if public.rate_limit_count('staff_login.account', coalesce(v_email, v_user::text), 3600)
       >= (public.get_setting('staff_login.max_per_account_all_ips_per_hour'))::int then
    return jsonb_build_object('decision', 'reject', 'message', 'Too many attempts. Try again later.');
  end if;
  return jsonb_build_object('decision', 'continue');
end;
$$;

-- The account-wide count is now kept by the hook; the server action records the per-IP ones.
create or replace function public.record_staff_sign_in_failure(p_ip text, p_account text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.rate_limit_hit('staff_login.ip', coalesce(p_ip, 'unknown'), 3600, 2147483647);
  perform public.rate_limit_hit('staff_login.account_ip', lower(coalesce(p_account, '')) || '|' || coalesce(p_ip, 'unknown'), 3600, 2147483647);
end;
$$;

-- ---------------------------------------------------------------------------
-- Abandoned sign-ups (Phase 12 audit): only accounts that never went live and have no history worth
-- keeping. A lifted ban, a past pass, a match or a staff action on the account rules it out, and the
-- idle clock counts any recent activity (session refresh, profile, photos, selfie), not only sign-ins.
-- ---------------------------------------------------------------------------
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
    select a.id, a.last_active
    from (
      select u.id,
             greatest(au.created_at, au.last_sign_in_at, u.updated_at, p.updated_at,
                      (select max(s.updated_at) from auth.sessions s where s.user_id = u.id),
                      (select max(ph.created_at) from public.profile_photos ph where ph.user_id = u.id),
                      (select max(v.created_at) from public.verifications v where v.user_id = u.id)) as last_active
      from public.users u
      join auth.users au on au.id = u.id
      left join public.profiles p on p.user_id = u.id
      where u.status = 'PENDING' and u.role = 'USER' and u.deleted_at is null
        -- Never live, never acted on by staff, nothing bought, no one met.
        and not exists (select 1 from public.notifications n where n.user_id = u.id and n.type = 'ACCOUNT_ACTIVE')
        and not exists (select 1 from public.audit_logs al where al.entity_id = u.id::text)
        and not exists (select 1 from public.subscriptions sb where sb.user_id = u.id)
        and not exists (select 1 from public.payments py where py.user_id = u.id)
        and not exists (select 1 from public.payment_claims pc where pc.user_id = u.id)
        and not exists (select 1 from public.conversation_members cm where cm.user_id = u.id)
        and not exists (select 1 from public.moderation_flags mf where mf.entity_type = 'USER' and mf.entity_id = u.id and mf.status = 'OPEN')
        and not exists (select 1 from public.verifications v where v.user_id = u.id and v.status = 'PENDING')
        and not exists (select 1 from public.profile_photos ph where ph.user_id = u.id and ph.status = 'PENDING_REVIEW')
        and not exists (select 1 from public.reports rp where rp.reported_user_id = u.id and rp.status = 'OPEN')
    ) a
    cross join (select (value #>> '{}')::int as days from public.app_settings
                where key = 'account.abandoned_signup_days' and value is not null) s
    where a.last_active < now() - make_interval(days => s.days)
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
