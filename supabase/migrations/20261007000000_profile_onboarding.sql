-- Phase 2 — Profile & onboarding (spec §10 steps 4–8, §11 who-sees-what groundwork, §17 detection terms)
-- Tables: areas, interests, user_interests, user_settings, legal_documents; profile columns.
-- Business rules: BR-4 (DOB already locked), BR-20 (controlled area list, no GPS), BR-31 (bios: detection
-- runs in the server action before these functions are called; see docs/SECURITY.md "Content checks").
--
-- Write pattern for onboarding: the server action authenticates the member (requireMember), validates
-- with Zod and the detection engine, then calls a service-role function below with the member's id.
-- Each function re-checks the account and every rule SQL can check. Members cannot call them directly.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
-- Mock-up "I am": Woman / Man; "Interested in": Women / Men (one or more).
create type public.gender as enum ('WOMAN', 'MAN');
-- §14: Casual message requests from "Anyone in the pool" or "Nobody".
create type public.message_permission as enum ('ANYONE', 'NOBODY');

-- ---------------------------------------------------------------------------
-- areas — controlled location list (county + community). BR-20: no GPS, no free text.
-- Content is owner-provided (T-09); local dev uses a DEV-ONLY sample from seed.sql.
-- ---------------------------------------------------------------------------
create table public.areas (
  id         uuid primary key default gen_random_uuid(),
  county     text not null check (length(county) between 2 and 60),
  name       text not null check (length(name) between 2 and 80),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (county, name)
);

alter table public.areas enable row level security;
grant select on public.areas to authenticated;

create policy areas_select_active on public.areas
  for select to authenticated
  using (active);

create trigger areas_set_updated_at
  before update on public.areas
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- interests — admin-managed list (§10 step 7). Content is owner-provided (T-10).
-- ---------------------------------------------------------------------------
create table public.interests (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(name) between 2 and 40),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.interests enable row level security;
grant select on public.interests to authenticated;

create policy interests_select_active on public.interests
  for select to authenticated
  using (active);

create trigger interests_set_updated_at
  before update on public.interests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_interests — a member's chosen interests. Read own; written only by save_interests_and_bio().
-- ---------------------------------------------------------------------------
create table public.user_interests (
  user_id     uuid not null references public.users (id) on delete cascade,
  interest_id uuid not null references public.interests (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, interest_id)
);

alter table public.user_interests enable row level security;
grant select on public.user_interests to authenticated;

create policy user_interests_select_own on public.user_interests
  for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- user_settings — one row per member (§18). Created with the users row.
-- Default ANYONE matches the mock-up's preselected "Anyone in the pool"; members change it in Phase 8.
-- ---------------------------------------------------------------------------
create table public.user_settings (
  user_id                   uuid primary key references public.users (id) on delete cascade,
  casual_message_permission public.message_permission not null default 'ANYONE',
  notification_prefs        jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

alter table public.user_settings enable row level security;
grant select on public.user_settings to authenticated;

create policy user_settings_select_own on public.user_settings
  for select to authenticated
  using (user_id = auth.uid());

create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger users_create_settings
  after insert on public.users
  for each row execute function public.handle_new_user_settings();

-- Backfill members created before this migration.
insert into public.user_settings (user_id) select id from public.users on conflict do nothing;

-- ---------------------------------------------------------------------------
-- legal_documents — published versions of Terms / Privacy / Community rules (§10 step 4:
-- "Acceptance stored with document version"). One current version per document.
-- Final texts follow legal review (T-12); local dev seeds DEV-ONLY draft versions.
-- ---------------------------------------------------------------------------
create table public.legal_documents (
  document       public.consent_document not null,
  version        text not null check (length(version) between 1 and 40),
  title          text not null,
  -- The full text members see and accept. Immutable once published, so a consent always points at
  -- the exact wording; a change means a new version.
  body           text not null check (length(body) between 1 and 100000),
  content_sha256 text generated always as (encode(extensions.digest(body, 'sha256'), 'hex')) stored,
  is_current     boolean not null default false,
  published_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  primary key (document, version)
);

create or replace function public.legal_documents_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'legal documents cannot be deleted' using errcode = '42501';
  end if;
  if new.document <> old.document or new.version <> old.version or new.body <> old.body or new.title <> old.title then
    raise exception 'a published legal document cannot be edited; publish a new version' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger legal_documents_immutable
  before update or delete on public.legal_documents
  for each row execute function public.legal_documents_immutable();

create unique index legal_documents_one_current on public.legal_documents (document) where is_current;

alter table public.legal_documents enable row level security;
grant select on public.legal_documents to anon, authenticated;

create policy legal_documents_select_published on public.legal_documents
  for select to anon, authenticated
  using (true);

-- Consents now reference a real published version.
alter table public.consents
  add constraint consents_document_version_fk
  foreign key (document, version) references public.legal_documents (document, version);

-- ---------------------------------------------------------------------------
-- profiles — onboarding fields (§18). Members read their own row; writes only via functions below.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column display_name        text check (display_name is null or length(display_name) between 2 and 30),
  add column gender              public.gender,
  add column seeking_genders     public.gender[] check (seeking_genders is null or cardinality(seeking_genders) between 1 and 2),
  add column bio                 text check (bio is null or length(bio) <= 500),
  add column area_id             uuid references public.areas (id),
  add column intent_relationship boolean not null default false,
  add column intent_casual       boolean not null default false,
  add column is_profile_complete boolean not null default false;

-- ---------------------------------------------------------------------------
-- Detection terms (§17: "The term list lives in app_settings so moderators can update it").
-- PROPOSED v1, pending owner review (T-11). Spec §17 examples: "$", "USD", "LD", "momo", "per hour",
-- "short time", "transport". "LD", "momo" and "transport" are matched by context-aware patterns built
-- into lib/domain/detection.ts instead (they are also a currency abbreviation in names, a common name
-- and an ordinary word), as are phone numbers, links, handles, currency amounts and money requests.
-- Every term below is covered by false-positive tests in tests/unit/detection.test.ts.
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('detection.terms', jsonb_build_object(
     'contact', jsonb_build_array(
       'whatsapp', 'whats app', 'w/app', 'wapp', 'telegram', 'tele gram', 'viber', 'wa.me', 'call me on',
       'text me on', 'my number', 'my num', 'my phone number', 'add me on', 'dm me on', 'inbox me on', 'signal me'),
     'price', jsonb_build_array(
       '$', 'us$', 'usd', 'lrd', 'l$', 'per hour', 'per night', 'short time', 'mobile money', 'orange money',
       'lonestar money', 'lone star money', 'mtn money', 'cash app', 'airtime', 'scratch card', 'pay me',
       'transport fare', 'tp money'),
     'money_request', jsonb_build_array(
       'send me money', 'send money', 'i need money', 'lend me money', 'loan me', 'borrow money')
   ),
   'Contact, price and money-request terms for content checks (§17, OD-31). PROPOSED v1 — owner review: T-11.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Onboarding state
-- ---------------------------------------------------------------------------

-- All three current documents accepted at their current versions.
create or replace function public.has_accepted_current_documents(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
       select 1
       from public.legal_documents d
       where d.is_current
         and not exists (
           select 1 from public.consents c
           where c.user_id = p_user_id and c.document = d.document and c.version = d.version
         )
     )
     -- all three documents must have a current version
     and (select count(*) from public.legal_documents where is_current) = 3;
$$;

create or replace function public.onboarding_progress_for(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'has_dob', p.user_id is not null,
    'rules_accepted', public.has_accepted_current_documents(p_user_id),
    'basics_done', coalesce(p.display_name is not null and p.gender is not null and p.seeking_genders is not null
                            and p.area_id is not null and (p.intent_relationship or p.intent_casual), false),
    'interests_bio_done', coalesce(p.is_profile_complete, false)
  )
  from (select p_user_id as id) u
  left join public.profiles p on p.user_id = u.id;
$$;

-- The signed-in member's own progress (used to resume at the first incomplete step).
create or replace function public.onboarding_progress()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then null else public.onboarding_progress_for(auth.uid()) end;
$$;

-- Shared guard: the account exists, may act, isn't suspended, and has passed the age gate.
create or replace function public.assert_can_edit_profile(p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status public.account_status;
begin
  select public.effective_account_status(u.status, u.suspended_until) into v_status
  from public.users u where u.id = p_user_id;

  if v_status is null or v_status not in ('PENDING', 'ACTIVE') then
    raise exception 'ACCOUNT_CANNOT_EDIT' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'AGE_GATE_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

-- §10 step 4: accept the Community rules, Terms and Privacy at the versions the member was shown.
create or replace function public.accept_current_documents(p_user_id uuid, p_versions jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
begin
  perform public.assert_can_edit_profile(p_user_id);

  if (select count(*) from public.legal_documents where is_current) <> 3 then
    raise exception 'NO_CURRENT_DOCUMENTS' using errcode = 'P0001';
  end if;

  for d in select document, version from public.legal_documents where is_current loop
    if coalesce(p_versions ->> d.document::text, '') <> d.version then
      -- The member saw an older version; the page must reload the current one.
      raise exception 'DOCUMENT_VERSION_MISMATCH' using errcode = '22023';
    end if;
    insert into public.consents (user_id, document, version)
    values (p_user_id, d.document, d.version)
    on conflict (user_id, document, version) do nothing;
  end loop;
end;
$$;

-- §10 steps 5–6: basic profile and intent. BR-20: area from the controlled list only.
create or replace function public.save_profile_basics(
  p_user_id             uuid,
  p_display_name        text,
  p_gender              public.gender,
  p_seeking_genders     public.gender[],
  p_area_id             uuid,
  p_intent_relationship boolean,
  p_intent_casual       boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_can_edit_profile(p_user_id);

  if not public.has_accepted_current_documents(p_user_id) then
    raise exception 'RULES_NOT_ACCEPTED' using errcode = '42501';
  end if;
  if p_display_name is null or length(trim(p_display_name)) not between 2 and 30 then
    raise exception 'INVALID_DISPLAY_NAME' using errcode = '22023';
  end if;
  if p_gender is null or p_seeking_genders is null or cardinality(p_seeking_genders) = 0 then
    raise exception 'INVALID_GENDER' using errcode = '22023';
  end if;
  if not exists (select 1 from public.areas where id = p_area_id and active) then
    raise exception 'INVALID_AREA' using errcode = '22023';
  end if;
  if not (coalesce(p_intent_relationship, false) or coalesce(p_intent_casual, false)) then
    raise exception 'INTENT_REQUIRED' using errcode = '22023';
  end if;

  update public.profiles
     set display_name        = trim(p_display_name),
         gender              = p_gender,
         seeking_genders     = (select array_agg(distinct g order by g) from unnest(p_seeking_genders) g),
         area_id             = p_area_id,
         intent_relationship = coalesce(p_intent_relationship, false),
         intent_casual       = coalesce(p_intent_casual, false)
   where user_id = p_user_id;
end;
$$;

-- §10 steps 7–8: at least 3 interests from the active list; bio up to 500 characters.
-- BR-31: the bio has already passed the detection engine in the server action.
create or replace function public.save_interests_and_bio(p_user_id uuid, p_interest_ids uuid[], p_bio text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform public.assert_can_edit_profile(p_user_id);

  if not coalesce((public.onboarding_progress_for(p_user_id) ->> 'basics_done')::boolean, false) then
    raise exception 'BASICS_REQUIRED' using errcode = '42501';
  end if;

  select count(distinct i.id) into v_count
  from public.interests i
  where i.id = any (coalesce(p_interest_ids, '{}')) and i.active;

  if v_count < 3 or v_count <> cardinality(array(select distinct unnest(coalesce(p_interest_ids, '{}')))) then
    raise exception 'INTERESTS_INVALID' using errcode = '22023';
  end if;
  if p_bio is not null and length(p_bio) > 500 then
    raise exception 'BIO_TOO_LONG' using errcode = '22023';
  end if;

  delete from public.user_interests where user_id = p_user_id;
  insert into public.user_interests (user_id, interest_id)
  select p_user_id, x from (select distinct unnest(p_interest_ids) as x) s;

  update public.profiles
     set bio = nullif(trim(coalesce(p_bio, '')), ''),
         is_profile_complete = true
   where user_id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.handle_new_user_settings() from public, anon, authenticated, service_role;
revoke all on function public.legal_documents_immutable() from public, anon, authenticated, service_role;
revoke all on function public.has_accepted_current_documents(uuid) from public, anon, authenticated;
revoke all on function public.onboarding_progress_for(uuid) from public, anon, authenticated;
revoke all on function public.onboarding_progress() from public, anon;
revoke all on function public.assert_can_edit_profile(uuid) from public, anon, authenticated, service_role;
revoke all on function public.accept_current_documents(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.save_profile_basics(uuid, text, public.gender, public.gender[], uuid, boolean, boolean) from public, anon, authenticated;
revoke all on function public.save_interests_and_bio(uuid, uuid[], text) from public, anon, authenticated;

grant execute on function public.onboarding_progress() to authenticated;
grant execute on function public.has_accepted_current_documents(uuid) to service_role;
grant execute on function public.onboarding_progress_for(uuid) to service_role;
grant execute on function public.accept_current_documents(uuid, jsonb) to service_role;
grant execute on function public.save_profile_basics(uuid, text, public.gender, public.gender[], uuid, boolean, boolean) to service_role;
grant execute on function public.save_interests_and_bio(uuid, uuid[], text) to service_role;
