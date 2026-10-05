-- Phase 0 — Foundation
-- Tables: app_settings, audit_logs. Helpers: set_updated_at(), get_setting(), audit().
-- Rule: every table has RLS enabled and explicit policies in the same migration (spec §6 rule 2).

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
  actor_id    uuid,
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

-- Explicit deny for client roles. Read access for ADMIN/SUPER_ADMIN arrives with staff roles.
create policy audit_logs_no_client_access on public.audit_logs
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Append-only: block UPDATE, DELETE and TRUNCATE for every role, including service_role.
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
-- row commits or rolls back together with the action it records.
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
  v_id uuid;
begin
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.audit(public.audit_action, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.audit(public.audit_action, text, text, jsonb) to service_role;

-- Same rule for the trigger helpers: not callable from the API.
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.audit_logs_append_only() from public, anon, authenticated;
