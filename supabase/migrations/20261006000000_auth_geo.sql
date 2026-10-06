-- Phase 1 — Auth, geo & age gate
-- Tables: users, profiles (DOB part), geo_checks, geo_passes, phone_blocklist, consents, rate_limit_counters.
-- Functions: phone hashing, rate limiting, begin_signup (geo pre-filter), the before-user-created
-- auth hook, set_date_of_birth, effective account status.
-- Business rules: BR-1, BR-2, BR-3, BR-4, BR-5 (suspension expiry), BR-6, BR-30.
-- Every table: RLS on + explicit policies here (spec §6 rule 2). Client grants are explicit; the
-- foundation migration made "nothing" the default.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN');
create type public.account_status as enum ('PENDING', 'ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED');
create type public.geo_result as enum ('PASS', 'BLOCKED_COUNTRY', 'BLOCKED_PHONE', 'BLOCKED_LIST', 'RATE_LIMITED');
create type public.consent_document as enum ('TERMS', 'PRIVACY', 'RULES');

-- ---------------------------------------------------------------------------
-- Settings for this phase. Values marked [DECISION] stay NULL here (spec §6 rule 9);
-- DEV-ONLY values live in supabase/seed.sql until the owner approves T-19.
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('geo.enforcement_mode', '"SIGNUP_ONLY"',
   'SIGNUP_ONLY | EVERY_SESSION (spec §3 rule 7). Owner decision: SIGNUP_ONLY.'),
  ('otp.max_per_phone_per_hour', null,
   'Max OTP SMS per phone number per hour (spec §22). [DECISION] T-19.'),
  ('otp.max_per_ip_per_hour', null,
   'Max signup/login code requests per IP per hour (spec §22). [DECISION] T-19.');

-- ---------------------------------------------------------------------------
-- Phone normalisation and hashing.
-- Phone numbers are never stored in our tables: only an HMAC-SHA256 with a secret pepper kept in
-- Supabase Vault (name: phone_hash_pepper). Spec §6 rule 7, §18 (phone_hash).
-- ---------------------------------------------------------------------------
create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_phone is null or regexp_replace(p_phone, '[^0-9]', '', 'g') = '' then null
    else '+' || regexp_replace(p_phone, '[^0-9]', '', 'g')
  end;
$$;

-- BR-2: a Liberian number is +231 followed by 7–9 digits.
create or replace function public.is_liberian_phone(p_phone text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(public.normalize_phone(p_phone) ~ '^\+231[0-9]{7,9}$', false);
$$;

create or replace function public.hmac_with_pepper(p_value text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pepper text;
begin
  select decrypted_secret into v_pepper
  from vault.decrypted_secrets
  where name = 'phone_hash_pepper'
  limit 1;

  if v_pepper is null or length(v_pepper) < 32 then
    raise exception 'Vault secret "phone_hash_pepper" is missing or too short' using errcode = 'P0001';
  end if;

  return encode(extensions.hmac(p_value, v_pepper, 'sha256'), 'hex');
end;
$$;

create or replace function public.phone_hash(p_phone text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.hmac_with_pepper('phone:' || public.normalize_phone(p_phone));
$$;

-- ---------------------------------------------------------------------------
-- users — one row per auth user (spec §18). Role and status are never writable by the member.
-- ---------------------------------------------------------------------------
create table public.users (
  id              uuid primary key references auth.users (id) on delete cascade,
  role            public.user_role not null default 'USER',
  status          public.account_status not null default 'PENDING',
  suspended_until timestamptz,
  last_seen_at    timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint users_suspension_has_end check (status <> 'SUSPENDED' or suspended_until is not null),
  constraint users_deleted_has_time check (status <> 'DELETED' or deleted_at is not null)
);

alter table public.users enable row level security;

grant select on public.users to authenticated;

create policy users_select_own on public.users
  for select to authenticated
  using (id = auth.uid());

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- Every new auth user gets a users row (PENDING, USER). Staff roles are set by SUPER_ADMIN (Phase 3).
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- BR-6 / BR-7: BANNED and DELETED accounts cannot authenticate. Mirror the status into Supabase Auth
-- (banned_until) so Auth itself refuses sign-in and token refresh, not just our app code.
create or replace function public.sync_auth_ban()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('BANNED', 'DELETED') then
    -- A finite date: Supabase Auth (Go) cannot read 'infinity' and its admin API fails on it.
    update auth.users set banned_until = now() + interval '100 years' where id = new.id;
  elsif old.status in ('BANNED', 'DELETED') then
    update auth.users set banned_until = null where id = new.id;
  end if;
  return new;
end;
$$;

create trigger users_sync_auth_ban
  after update of status on public.users
  for each row
  when (old.status is distinct from new.status)
  execute function public.sync_auth_ban();

-- BR-5 / §8: a suspension lifts by itself when suspended_until has passed. Computed at read time.
create or replace function public.effective_account_status(p_status public.account_status, p_suspended_until timestamptz)
returns public.account_status
language sql
stable
set search_path = ''
as $$
  select case
    when p_status = 'SUSPENDED' and p_suspended_until is not null and p_suspended_until <= now() then 'ACTIVE'::public.account_status
    else p_status
  end;
$$;

-- The caller's own effective status (null if no users row). Used by server code and later RLS.
create or replace function public.current_user_status()
returns public.account_status
language sql
stable
security definer
set search_path = ''
as $$
  select public.effective_account_status(u.status, u.suspended_until)
  from public.users u
  where u.id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- profiles — Phase 1 holds only the date of birth (rest arrives in Phase 2).
-- BR-4: 18+ only; DOB locked after entry; only an admin can correct it (Phase 10, audited).
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id       uuid primary key references public.users (id) on delete cascade,
  date_of_birth date not null,
  dob_locked    boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

grant select on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = auth.uid());

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.age_in_years(p_dob date, p_on date default current_date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select extract(year from age(p_on, p_dob))::integer;
$$;

create or replace function public.profiles_guard_dob()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.date_of_birth is distinct from old.date_of_birth then
    -- BR-4: under 18 is never stored.
    if new.date_of_birth > current_date or public.age_in_years(new.date_of_birth) < 18 then
      raise exception 'UNDER_18' using errcode = '22023';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.date_of_birth is distinct from old.date_of_birth and old.dob_locked
     and coalesce(current_setting('app.dob_correction', true), '') <> 'on' then
    -- BR-4: locked. The Phase 10 admin correction function sets app.dob_correction and audits.
    raise exception 'DOB_LOCKED' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_dob
  before insert or update on public.profiles
  for each row execute function public.profiles_guard_dob();

-- The member records their DOB once (age gate). Callable by the signed-in member only.
create or replace function public.set_date_of_birth(p_dob date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if not exists (select 1 from public.users where id = v_uid) then
    raise exception 'NO_ACCOUNT' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles where user_id = v_uid) then
    raise exception 'DOB_LOCKED' using errcode = '42501';
  end if;

  insert into public.profiles (user_id, date_of_birth) values (v_uid, p_dob);
end;
$$;

-- ---------------------------------------------------------------------------
-- geo_checks — one row per signup attempt (spec §3 rule 5). Country codes only, never the raw IP (OD-12).
-- ---------------------------------------------------------------------------
create table public.geo_checks (
  id            uuid primary key default gen_random_uuid(),
  phone_hash    text,
  ip_country    text check (ip_country ~ '^[A-Z]{2}$'),
  phone_country text check (phone_country ~ '^[A-Z]{2}$'),
  result        public.geo_result not null,
  created_at    timestamptz not null default now()
);

create index geo_checks_created_at_idx on public.geo_checks (created_at desc);

alter table public.geo_checks enable row level security;

create policy geo_checks_no_client_access on public.geo_checks
  as restrictive for all to anon, authenticated
  using (false) with check (false);

-- ---------------------------------------------------------------------------
-- geo_passes — single-use proof that a phone passed the server-side signup pre-filter in the last
-- few minutes. The before-user-created hook consumes it (plan §1.5).
-- ---------------------------------------------------------------------------
create table public.geo_passes (
  phone_hash text primary key,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

alter table public.geo_passes enable row level security;

create policy geo_passes_no_client_access on public.geo_passes
  as restrictive for all to anon, authenticated
  using (false) with check (false);

-- ---------------------------------------------------------------------------
-- phone_blocklist — banned numbers (BR-3). Written by the ban function in Phase 5.
-- ---------------------------------------------------------------------------
create table public.phone_blocklist (
  phone_hash text primary key,
  reason     text not null check (length(reason) between 1 and 500),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.phone_blocklist enable row level security;

create policy phone_blocklist_no_client_access on public.phone_blocklist
  as restrictive for all to anon, authenticated
  using (false) with check (false);

-- ---------------------------------------------------------------------------
-- consents — acceptance of Terms / Privacy / Community rules with document version (§10 step 4).
-- Written in Phase 2. Members may read and add their own; never change or delete them.
-- ---------------------------------------------------------------------------
create table public.consents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  document    public.consent_document not null,
  version     text not null check (length(version) between 1 and 40),
  accepted_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (user_id, document, version)
);

alter table public.consents enable row level security;

grant select, insert on public.consents to authenticated;

create policy consents_select_own on public.consents
  for select to authenticated
  using (user_id = auth.uid());

create policy consents_insert_own on public.consents
  for insert to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- rate_limit_counters — fixed-window counters (spec §5: Postgres counters). Subjects are hashed.
-- ---------------------------------------------------------------------------
create table public.rate_limit_counters (
  bucket       text not null check (bucket ~ '^[a-z0-9_.]+$'),
  subject_hash text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (bucket, subject_hash, window_start)
);

alter table public.rate_limit_counters enable row level security;

create policy rate_limit_counters_no_client_access on public.rate_limit_counters
  as restrictive for all to anon, authenticated
  using (false) with check (false);

-- Returns true when the action is allowed (count within max), false when the limit is exceeded.
create or replace function public.rate_limit_hit(
  p_bucket         text,
  p_subject        text,
  p_window_seconds integer,
  p_max            integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count  integer;
begin
  if p_window_seconds <= 0 or p_max < 0 then
    raise exception 'rate_limit_hit: bad window or max' using errcode = '22023';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limit_counters as c (bucket, subject_hash, window_start, count)
  values (p_bucket, public.hmac_with_pepper('rl:' || p_bucket || ':' || coalesce(p_subject, '')), v_window, 1)
  on conflict (bucket, subject_hash, window_start)
  do update set count = c.count + 1
  returning c.count into v_count;

  return v_count <= p_max;
end;
$$;

-- Per-IP OTP request limit (spec §22), shared by signup (begin_signup) and login.
create or replace function public.otp_ip_allowed(p_ip text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select public.rate_limit_hit('otp.ip', coalesce(p_ip, 'unknown'), 3600,
                               (public.get_setting('otp.max_per_ip_per_hour'))::int);
$$;

-- ---------------------------------------------------------------------------
-- begin_signup — the server-side Liberia pre-filter (spec §3, BR-1, BR-2, BR-3).
-- Called by the registration server action BEFORE any OTP is requested (§3 rule 3).
-- The country comes from the hosting edge header, read only in that server action.
-- ---------------------------------------------------------------------------
create or replace function public.begin_signup(p_phone text, p_ip_country text, p_ip text)
returns public.geo_result
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_country text := upper(nullif(trim(p_ip_country), ''));
  v_hash    text := case when public.normalize_phone(p_phone) is null then null else public.phone_hash(p_phone) end;
  v_phone_country text := case when public.is_liberian_phone(p_phone) then 'LR' else null end;
  v_result  public.geo_result;
begin
  if v_country !~ '^[A-Z]{2}$' then
    v_country := null;
  end if;

  if not public.otp_ip_allowed(p_ip) then
    v_result := 'RATE_LIMITED';
  elsif v_country is distinct from 'LR' then
    v_result := 'BLOCKED_COUNTRY';           -- BR-1 (checked before anything else is revealed)
  elsif v_phone_country is null then
    v_result := 'BLOCKED_PHONE';             -- BR-2
  elsif exists (select 1 from public.phone_blocklist b where b.phone_hash = v_hash) then
    v_result := 'BLOCKED_LIST';              -- BR-3
  else
    v_result := 'PASS';
    insert into public.geo_passes as g (phone_hash, expires_at)
    values (v_hash, now() + interval '10 minutes')
    on conflict (phone_hash) do update set expires_at = excluded.expires_at, used_at = null, created_at = now();
  end if;

  insert into public.geo_checks (phone_hash, ip_country, phone_country, result)
  values (v_hash, v_country, v_phone_country, v_result);

  return v_result;
end;
$$;

-- Per-phone OTP limit (spec §22), checked by the Send-SMS hook route before any SMS goes out.
create or replace function public.otp_send_allowed(p_phone text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select public.rate_limit_hit('otp.phone', public.normalize_phone(p_phone), 3600,
                               (public.get_setting('otp.max_per_phone_per_hour'))::int);
$$;

-- ---------------------------------------------------------------------------
-- Supabase Auth "before user created" hook (plan §1.5). Runs inside Auth for every new user,
-- including direct API calls with the public anon key that skip our server action.
-- ---------------------------------------------------------------------------
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := nullif(event -> 'user' ->> 'phone', '');
  v_email text := nullif(event -> 'user' ->> 'email', '');
  v_hash  text;
  v_pass  text;
begin
  if v_phone is null then
    -- Public email signup is disabled in Auth config; an email-only user can only come from the
    -- admin API (staff accounts, created by SUPER_ADMIN in Phase 3).
    if v_email is not null then
      return '{}'::jsonb;
    end if;
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Sign up with a Liberian phone number.'));
  end if;

  if not public.is_liberian_phone(v_phone) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Only Liberian (+231) numbers can sign up.'));
  end if;

  v_hash := public.phone_hash(v_phone);

  if exists (select 1 from public.phone_blocklist b where b.phone_hash = v_hash) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'This number can''t be used to sign up.'));
  end if;

  update public.geo_passes
     set used_at = now()
   where phone_hash = v_hash and used_at is null and expires_at > now()
  returning phone_hash into v_pass;

  if v_pass is null then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Please sign up through the WeKonnectz app.'));
  end if;

  return '{}'::jsonb;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges. Nothing is callable by clients unless listed here (guard test allow-list).
-- ---------------------------------------------------------------------------
revoke all on function public.normalize_phone(text) from public, anon, authenticated;
revoke all on function public.is_liberian_phone(text) from public, anon, authenticated;
revoke all on function public.hmac_with_pepper(text) from public, anon, authenticated, service_role;
revoke all on function public.phone_hash(text) from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated, service_role;
revoke all on function public.sync_auth_ban() from public, anon, authenticated, service_role;
revoke all on function public.effective_account_status(public.account_status, timestamptz) from public, anon;
revoke all on function public.current_user_status() from public, anon;
revoke all on function public.age_in_years(date, date) from public, anon, authenticated;
revoke all on function public.profiles_guard_dob() from public, anon, authenticated, service_role;
revoke all on function public.set_date_of_birth(date) from public, anon;
revoke all on function public.rate_limit_hit(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.begin_signup(text, text, text) from public, anon, authenticated;
revoke all on function public.otp_send_allowed(text) from public, anon, authenticated;
revoke all on function public.otp_ip_allowed(text) from public, anon, authenticated;
revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated, service_role;

-- Members (signed in): their own status, their own DOB once.
grant execute on function public.effective_account_status(public.account_status, timestamptz) to authenticated;
grant execute on function public.current_user_status() to authenticated;
grant execute on function public.set_date_of_birth(date) to authenticated;

-- Server (service role) only.
grant execute on function public.phone_hash(text) to service_role;
grant execute on function public.rate_limit_hit(text, text, integer, integer) to service_role;
grant execute on function public.begin_signup(text, text, text) to service_role;
grant execute on function public.otp_send_allowed(text) to service_role;
grant execute on function public.otp_ip_allowed(text) to service_role;

-- Supabase Auth runs the hook as supabase_auth_admin.
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
