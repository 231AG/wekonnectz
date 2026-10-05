-- Phase 0 — Foundation
-- Tables: app_settings, audit_logs. Helpers: set_updated_at(), get_setting(), audit().
-- Rule: every table has RLS enabled and explicit policies in the same migration (spec §6 rule 2).

-- ---------------------------------------------------------------------------
-- Default privileges: deny by default.
-- Supabase grants anon/authenticated every table privilege and EXECUTE on every function by
-- default. From here on, new tables and functions in `public` grant nothing to client roles.
-- Each later migration grants exactly what a table or RPC needs (and RLS still filters rows).
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current on mutable tables (spec §18).
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- app_settings — prices, limits, flags, term lists (spec §18).
-- Keys are created WITHOUT values when a [DECISION] is open. get_setting()
-- raises until an owner-approved value is set (spec §6 rule 9).
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key         text primary key check (key ~ '^[a-z0-9_]+(\.[a-z0-9_]+)*$'),
  value       jsonb,
  description text not null,
  updated_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.app_settings is
  'Runtime configuration. value IS NULL means an owner decision is still open; get_setting() raises.';

alter table public.app_settings enable row level security;

-- Explicit deny for client roles. Members never read settings directly; server-side
-- functions read them through get_setting(). Staff policies arrive with staff roles (Phase 3).
-- Client roles get no table privileges at all; server-side functions read via get_setting().
-- service_role may read (server tooling); changes go through audited functions (Phase 10).
revoke all on public.app_settings from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.app_settings from service_role;

create policy app_settings_no_client_access on public.app_settings
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- get_setting: fail loudly on a missing key or an undecided (NULL) value.
create or replace function public.get_setting(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_value jsonb;
  v_found boolean;
begin
  select s.value, true into v_value, v_found
  from public.app_settings s
  where s.key = p_key;

  if v_found is null then
    raise exception 'app_settings key "%" does not exist', p_key
      using errcode = 'P0002';
  end if;

  if v_value is null then
    raise exception 'app_settings key "%" has no value: owner decision pending', p_key
      using errcode = 'P0001';
  end if;

  return v_value;
end;
$$;

revoke all on function public.get_setting(text) from public, anon, authenticated;
grant execute on function public.get_setting(text) to service_role;

-- ---------------------------------------------------------------------------
-- audit_logs — append-only record of sensitive staff actions (spec §18, BR-34).
-- ---------------------------------------------------------------------------
create type public.audit_action as enum (
  'USER_SUSPENDED',
  'USER_BANNED',
  'USER_RESTORED',
  'VERIFICATION_APPROVED',
  'VERIFICATION_REJECTED',
  'SELFIE_VIEWED',
  'PHOTO_APPROVED',
  'PHOTO_REJECTED',
  'DOB_CORRECTED',
  'SUBSCRIPTION_MODIFIED',
  'PAYMENT_REFUNDED',
  'PAYMENT_CLAIM_APPROVED',
  'PAYMENT_CLAIM_REJECTED',
  'PAYMENT_CLAIM_NEEDS_INFO',
  'EVIDENCE_VIEWED',
  'REPORT_RESOLVED',
  'SETTING_CHANGED',
  'ROLE_CHANGED',
  'ADMIN_CREATED'
);

create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null,
  action      public.audit_action not null,
  entity_type text not null check (length(entity_type) between 1 and 64),
  entity_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.audit_logs is
  'Append-only. Written only by audit() inside the same transaction as the staff action (BR-34). Never store phone numbers, DOB, storage paths or message text in metadata.';

create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

alter table public.audit_logs enable row level security;

-- No direct writes by anyone except through audit(). Clients get no privileges; service_role
-- may read (admin console, Phase 10). Read access for ADMIN/SUPER_ADMIN arrives with staff roles.
revoke all on public.audit_logs from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.audit_logs from service_role;

-- Explicit deny for client roles (defence in depth behind the revoked privileges).
create policy audit_logs_no_client_access on public.audit_logs
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Append-only: block UPDATE, DELETE and TRUNCATE. Applies to every API role (anon, authenticated,
-- service_role). Limitation: the database owner (`postgres`) can still disable triggers or set
-- session_replication_role. That is documented in docs/SECURITY.md; off-database audit export
-- is planned for Phase 12.
create or replace function public.audit_logs_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only (% blocked)', tg_op
    using errcode = '42501';
end;
$$;

create trigger audit_logs_no_update_delete
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_append_only();

create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function public.audit_logs_append_only();

-- audit(): the only writer. Called from inside staff database functions so the log
-- row commits or rolls back together with the action it records. Not callable from the API
-- (not even service_role), so rows can't be forged without an authenticated actor.
create or replace function public.audit(
  p_action      public.audit_action,
  p_entity_type text,
  p_entity_id   text,
  p_metadata    jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_actor uuid := auth.uid();
  v_bad   text;
begin
  if v_actor is null then
    raise exception 'audit(): no authenticated actor' using errcode = '42501';
  end if;

  -- Spec §6 rule 7: never put phone numbers, DOB, storage paths or message text in the log.
  -- Checks keys at every nesting level. Keep in sync with SENSITIVE_KEYS in lib/observability/scrub.ts.
  select k.key #>> '{}' into v_bad
  from jsonb_path_query(
         coalesce(p_metadata, '{}'::jsonb),
         'strict $.** ? (@.type() == "object").keyvalue().key'
       ) as k(key)
  where lower(k.key #>> '{}') in (
    'phone', 'phone_number', 'sender_phone', 'dob', 'date_of_birth', 'dateofbirth',
    'storage_path', 'selfie_storage_path', 'evidence_path', 'path',
    'body', 'text', 'message', 'message_text', 'bio', 'note', 'member_note',
    'ip_address', 'password', 'otp', 'token'
  )
  limit 1;
  if v_bad is not null then
    raise exception 'audit(): metadata key "%" is not allowed (PII)', v_bad using errcode = '22023';
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (v_actor, p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.audit(public.audit_action, text, text, jsonb) from public, anon, authenticated, service_role;

-- Same rule for the trigger helpers: not callable from the API.
revoke all on function public.set_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.audit_logs_append_only() from public, anon, authenticated, service_role;
