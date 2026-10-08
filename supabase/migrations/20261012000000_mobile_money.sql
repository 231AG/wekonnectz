-- Phase 7 — Mobile money access (spec §16; BR-26, 27, 28, 29, 30, 35, 36, 37, 38, 39, 41).
-- A member pays Orange Money / MTN outside the app and submits a claim with a screenshot; an admin
-- finds the transaction in the merchant wallet's own records and approves it. approve_payment_claim()
-- is the only code path that creates mobile money access (§6 rule 11).
-- Owner decisions 2026-10-08: OD-2 USD only, OD-17 wrong amount → reject and refund manually,
-- OD-21 two claims waiting at once, OD-16 "within 24 hours" (copy in the app).

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('claims.max_pending', '2'::jsonb, 'Claims one member may have waiting for review at once (OD-21, owner 2026-10-08).'),
  ('claims.transaction_id_patterns', null, 'Regex per provider for transaction IDs, e.g. {"ORANGE_MONEY": "...", "MTN_MOMO": "..."} (T-14).'),
  ('claims.rejections_before_flag', null, 'Rejected claims from one member that raise a flag for review (T-19, §17).'),
  ('claims.evidence_retention_days', null, 'Days after a decision before a payment screenshot is deleted (OD-18).')
on conflict (key) do update set value = excluded.value where public.app_settings.key = 'claims.max_pending';

alter type public.notification_type add value if not exists 'PAYMENT_APPROVED';
alter type public.notification_type add value if not exists 'PAYMENT_REJECTED';
alter type public.notification_type add value if not exists 'PAYMENT_NEEDS_INFO';

-- ---------------------------------------------------------------------------
-- Types and tables (§18)
-- ---------------------------------------------------------------------------
create type public.payment_source as enum ('MOBILE_MONEY', 'CARD');
create type public.payment_provider as enum ('ORANGE_MONEY', 'MTN_MOMO', 'CARD');
create type public.subscription_status as enum ('PENDING', 'ACTIVE', 'CANCELLED', 'PAYMENT_FAILED', 'EXPIRED', 'SUSPENDED', 'REFUNDED');
create type public.payment_status as enum ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');
create type public.claim_status as enum ('PENDING_REVIEW', 'NEEDS_INFO', 'APPROVED', 'REJECTED', 'CANCELLED');
create type public.claim_rejection_reason as enum (
  'TRANSACTION_NOT_FOUND', 'AMOUNT_MISMATCH', 'ALREADY_USED', 'DETAILS_DO_NOT_MATCH', 'EVIDENCE_UNCLEAR'
);

create table public.subscription_plans (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique check (code ~ '^[A-Z0-9_]{2,40}$'),
  name               text not null check (length(name) between 2 and 60),
  source             public.payment_source not null,
  duration_hours     integer not null check (duration_hours > 0),
  price              numeric(10, 2) not null check (price > 0),
  -- OD-2 (owner 2026-10-08): USD only.
  currency           text not null default 'USD' check (currency = 'USD'),
  renews             boolean not null default false,
  processor_price_id text,
  active             boolean not null default true,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Mobile money never renews (§24: no recurring mobile money).
  constraint subscription_plans_mobile_money_one_off check (source <> 'MOBILE_MONEY' or not renews)
);

create table public.merchant_accounts (
  id             uuid primary key default gen_random_uuid(),
  provider       public.payment_provider not null check (provider in ('ORANGE_MONEY', 'MTN_MOMO')),
  display_name   text not null check (length(display_name) between 2 and 80),
  number_or_code text not null check (length(number_or_code) between 3 and 40),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- One active wallet per provider, so instructions are never ambiguous.
create unique index merchant_accounts_one_active on public.merchant_accounts (provider) where active;

create table public.payment_claims (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references public.users (id) on delete set null,
  plan_id             uuid not null references public.subscription_plans (id),
  provider            public.payment_provider not null check (provider in ('ORANGE_MONEY', 'MTN_MOMO')),
  merchant_account_id uuid not null references public.merchant_accounts (id),
  reference_code      text not null check (reference_code ~ '^WK-[A-Z0-9]{4}$'),
  transaction_id      text not null check (length(transaction_id) between 4 and 40),
  sender_phone        text not null check (sender_phone ~ '^\+231[0-9]{7,9}$'),
  amount              numeric(10, 2) not null,
  currency            text not null check (currency = 'USD'),
  paid_at             timestamptz not null,
  evidence_path       text check (evidence_path is null or evidence_path ~ '^[0-9a-f-]{36}\.webp$'),
  evidence_sha256     text not null check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_deleted_at timestamptz,
  status              public.claim_status not null default 'PENDING_REVIEW',
  rejection_reason    public.claim_rejection_reason,
  staff_question      text check (staff_question is null or length(staff_question) between 1 and 300),
  member_note         text check (member_note is null or length(member_note) between 1 and 500),
  reviewed_by         uuid references public.users (id) on delete set null,
  reviewed_at         timestamptz,
  created_at          timestamptz not null default clock_timestamp(),
  updated_at          timestamptz not null default now(),
  constraint payment_claims_reason_when_rejected check ((status = 'REJECTED') = (rejection_reason is not null)),
  constraint payment_claims_evidence check (evidence_path is not null or evidence_deleted_at is not null)
);
-- BR-35 / §18: a transaction ID can be live on one claim only per provider.
create unique index payment_claims_one_live_transaction on public.payment_claims (provider, transaction_id)
  where status in ('PENDING_REVIEW', 'NEEDS_INFO', 'APPROVED');
create index payment_claims_queue_idx on public.payment_claims (created_at) where status in ('PENDING_REVIEW', 'NEEDS_INFO');
create index payment_claims_user_idx on public.payment_claims (user_id, created_at desc);
create index payment_claims_sha_idx on public.payment_claims (evidence_sha256);

create table public.payments (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references public.users (id) on delete set null,
  plan_id                 uuid not null references public.subscription_plans (id),
  source                  public.payment_source not null,
  provider                public.payment_provider not null,
  provider_transaction_id text not null,
  claim_id                uuid unique references public.payment_claims (id),
  amount                  numeric(10, 2) not null check (amount > 0),
  currency                text not null check (currency = 'USD'),
  status                  public.payment_status not null,
  paid_at                 timestamptz,
  created_at              timestamptz not null default now(),
  -- BR-35: once per provider.
  constraint payments_unique_transaction unique (provider, provider_transaction_id)
);

create table public.payment_events (
  id              uuid primary key default gen_random_uuid(),
  payment_id      uuid references public.payments (id),
  claim_id        uuid references public.payment_claims (id),
  type            text not null check (type ~ '^[A-Z_]{3,40}$'),
  raw_payload     jsonb not null default '{}'::jsonb,
  signature_valid boolean,
  actor_id        uuid references public.users (id) on delete set null,
  received_at     timestamptz not null default clock_timestamp()
);
create index payment_events_payment_idx on public.payment_events (payment_id, received_at);

create table public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.users (id) on delete cascade,
  plan_id                   uuid not null references public.subscription_plans (id),
  source                    public.payment_source not null,
  status                    public.subscription_status not null,
  starts_at                 timestamptz not null,
  expires_at                timestamptz not null,
  auto_renew                boolean not null default false,
  cancel_at_period_end      boolean not null default false,
  processor_subscription_id text,
  source_payment_id         uuid unique references public.payments (id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint subscriptions_period check (expires_at > starts_at),
  constraint subscriptions_mobile_money_has_payment check (source <> 'MOBILE_MONEY' or source_payment_id is not null)
);
create index subscriptions_user_idx on public.subscriptions (user_id, expires_at desc);

-- Card customers (Phase 7b); table only.
create table public.card_customers (
  user_id      uuid primary key references public.users (id) on delete cascade,
  processor    text not null check (processor ~ '^[a-z0-9_]{2,30}$'),
  customer_ref text not null,
  created_at   timestamptz not null default now()
);

-- No client access to any of these. The server reads plans and wallets through the functions below;
-- service_role may read the money tables (support and tests) but never write them directly.
alter table public.subscription_plans enable row level security;
alter table public.merchant_accounts enable row level security;
alter table public.payment_claims enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.subscriptions enable row level security;
alter table public.card_customers enable row level security;
revoke all on public.subscription_plans, public.merchant_accounts, public.payment_claims, public.payments,
  public.payment_events, public.subscriptions, public.card_customers from anon, authenticated, service_role;
grant select on public.subscription_plans, public.merchant_accounts, public.payment_claims, public.payments,
  public.payment_events, public.subscriptions to service_role;
create policy subscription_plans_no_client_access on public.subscription_plans
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy merchant_accounts_no_client_access on public.merchant_accounts
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy payment_claims_no_client_access on public.payment_claims
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy payments_no_client_access on public.payments
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy payment_events_no_client_access on public.payment_events
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy subscriptions_no_client_access on public.subscriptions
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy card_customers_no_client_access on public.card_customers
  as restrictive for all to anon, authenticated using (false) with check (false);

-- ---------------------------------------------------------------------------
-- Integrity triggers (BR-29, §6 rule 11)
-- ---------------------------------------------------------------------------

-- Money fields never change. A status change is appended to payment_events. Only the account link may
-- be cleared, when the member's data is purged (OD-7).
create or replace function public.payments_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'PAYMENT_IMMUTABLE' using errcode = '42501';
  end if;
  if new.amount is distinct from old.amount or new.currency is distinct from old.currency
     or new.provider is distinct from old.provider or new.plan_id is distinct from old.plan_id
     or new.source is distinct from old.source or new.provider_transaction_id is distinct from old.provider_transaction_id
     or new.claim_id is distinct from old.claim_id or new.paid_at is distinct from old.paid_at
     or new.created_at is distinct from old.created_at
     or (new.user_id is distinct from old.user_id and new.user_id is not null) then
    raise exception 'PAYMENT_IMMUTABLE' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    insert into public.payment_events (payment_id, claim_id, type, raw_payload, actor_id)
    values (new.id, new.claim_id, 'STATUS_CHANGED', jsonb_build_object('from', old.status, 'to', new.status), auth.uid());
  end if;
  return new;
end;
$$;

create trigger payments_guard
  before update or delete on public.payments
  for each row execute function public.payments_guard();

create or replace function public.payment_events_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.actor_id is null and old.actor_id is not null
     and (new.id, new.payment_id, new.claim_id, new.type, new.raw_payload, new.signature_valid, new.received_at)
         is not distinct from (old.id, old.payment_id, old.claim_id, old.type, old.raw_payload, old.signature_valid, old.received_at) then
    return new; -- the actor's account was purged (on delete set null)
  end if;
  raise exception 'APPEND_ONLY' using errcode = '42501';
end;
$$;

create trigger payment_events_append_only
  before update or delete on public.payment_events
  for each row execute function public.payment_events_append_only();

-- §6 rule 11: mobile money access is created only inside approve_payment_claim(), which sets this
-- transaction-local flag around its single insert.
create or replace function public.subscriptions_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source = 'MOBILE_MONEY' and coalesce(current_setting('wk.claim_approval', true), '') <> 'on' then
    raise exception 'ACCESS_ONLY_BY_CLAIM_APPROVAL' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger subscriptions_insert_guard
  before insert on public.subscriptions
  for each row execute function public.subscriptions_insert_guard();

-- ---------------------------------------------------------------------------
-- Access (BR-27, BR-30): decided only from server-side state, by time comparison.
-- ---------------------------------------------------------------------------
create or replace function public.has_casual_access(p_user uuid, p_at timestamptz default now())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user and s.status in ('ACTIVE', 'CANCELLED')
      and s.starts_at <= p_at and s.expires_at > p_at
  );
$$;

-- When the member's access (all stacked passes) ends; null when they have none.
create or replace function public.casual_access_until(p_user uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.has_casual_access(p_user)
    then (select max(s.expires_at) from public.subscriptions s
          where s.user_id = p_user and s.status in ('ACTIVE', 'CANCELLED') and s.expires_at > now())
  end;
$$;

-- BR-41: an active card subscription blocks mobile money purchases.
create or replace function public.has_active_card_subscription(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user and s.source = 'CARD' and s.status in ('ACTIVE', 'PAYMENT_FAILED', 'CANCELLED')
      and s.expires_at > now()
  );
$$;

-- Short code the member may add to the payment note (§16 step 2; OD-22 [VERIFY]). Stable per member.
create or replace function public.member_reference_code(p_user uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'WK-' || upper(substr(md5('wk-reference:' || p_user::text), 1, 4));
$$;

-- ---------------------------------------------------------------------------
-- Member side (service_role; the member id comes from the session)
-- ---------------------------------------------------------------------------

-- Who may buy: a verified ACTIVE member account, not hidden by reports (§16 validation).
create or replace function public.assert_can_pay(p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.users u
    where u.id = p_user and u.role = 'USER' and u.hidden_reason is null
      and public.effective_account_status(u.status, u.suspended_until) = 'ACTIVE'
      and public.latest_verification_status(u.id) = 'VERIFIED'
  ) then
    raise exception 'ACCOUNT_CANNOT_PAY' using errcode = '42501';
  end if;
end;
$$;

-- Everything the Get access screens show: plans, wallets, the member's reference code and access.
create or replace function public.member_payment_options(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name,
                                                           'duration_hours', p.duration_hours, 'price', p.price,
                                                           'currency', p.currency) order by p.sort_order, p.price)
                       from public.subscription_plans p where p.active and p.source = 'MOBILE_MONEY'), '[]'::jsonb),
    'wallets', coalesce((select jsonb_agg(jsonb_build_object('provider', m.provider, 'display_name', m.display_name,
                                                             'number_or_code', m.number_or_code) order by m.provider)
                         from public.merchant_accounts m where m.active), '[]'::jsonb),
    'reference_code', public.member_reference_code(p_user),
    'access_until', public.casual_access_until(p_user),
    'card_active', public.has_active_card_subscription(p_user),
    'pending_claims', (select count(*) from public.payment_claims c
                       where c.user_id = p_user and c.status in ('PENDING_REVIEW', 'NEEDS_INFO'))
  );
$$;

-- Public pricing (§20 Pricing page): active plans only.
create or replace function public.public_plans()
returns table (code text, name text, source public.payment_source, duration_hours integer, price numeric, currency text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.code, p.name, p.source, p.duration_hours, p.price, p.currency
  from public.subscription_plans p where p.active
  order by p.source, p.sort_order, p.price;
$$;

-- Submit a claim (§16 steps 4–5). The server has already processed the screenshot into the private
-- payment-evidence bucket; this checks everything else and creates the claim PENDING_REVIEW.
create or replace function public.submit_payment_claim(
  p_user            uuid,
  p_plan_id         uuid,
  p_provider        public.payment_provider,
  p_transaction_id  text,
  p_sender_phone    text,
  p_paid_at         timestamptz,
  p_evidence_path   text,
  p_evidence_sha256 text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan     public.subscription_plans;
  v_wallet   uuid;
  v_txn      text := upper(regexp_replace(coalesce(p_transaction_id, ''), '\s', '', 'g'));
  v_pattern  text;
  v_id       uuid;
begin
  perform public.assert_can_pay(p_user);
  perform 1 from public.users where id = p_user for update;

  select * into v_plan from public.subscription_plans where id = p_plan_id and active and source = 'MOBILE_MONEY';
  if v_plan.id is null then
    raise exception 'PLAN_NOT_AVAILABLE' using errcode = '22023';
  end if;
  select id into v_wallet from public.merchant_accounts where provider = p_provider and active;
  if v_wallet is null then
    raise exception 'PROVIDER_NOT_AVAILABLE' using errcode = '22023';
  end if;
  -- BR-41
  if public.has_active_card_subscription(p_user) then
    raise exception 'CARD_SUBSCRIPTION_ACTIVE' using errcode = '22023';
  end if;
  -- BR-39 / OD-21
  if (select count(*) from public.payment_claims where user_id = p_user and status in ('PENDING_REVIEW', 'NEEDS_INFO'))
     >= (public.get_setting('claims.max_pending'))::int then
    raise exception 'TOO_MANY_PENDING' using errcode = '22023';
  end if;
  -- T-14: the expected format per provider (no guessing: the setting must exist).
  v_pattern := public.get_setting('claims.transaction_id_patterns') ->> p_provider::text;
  if v_pattern is null then
    raise exception 'setting claims.transaction_id_patterns has no pattern for %', p_provider using errcode = '22023';
  end if;
  if v_txn !~ v_pattern then
    raise exception 'INVALID_TRANSACTION_ID' using errcode = '22023';
  end if;
  if p_sender_phone is null or p_sender_phone !~ '^\+231[0-9]{7,9}$' then
    raise exception 'INVALID_SENDER' using errcode = '22023';
  end if;
  if p_paid_at is null or p_paid_at > now() + interval '10 minutes' then
    raise exception 'INVALID_PAID_AT' using errcode = '22023';
  end if;
  if p_evidence_path is null or p_evidence_path !~ '^[0-9a-f-]{36}\.webp$'
     or p_evidence_sha256 is null or p_evidence_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'EVIDENCE_REQUIRED' using errcode = '22023';
  end if;

  begin
    insert into public.payment_claims (user_id, plan_id, provider, merchant_account_id, reference_code, transaction_id,
                                       sender_phone, amount, currency, paid_at, evidence_path, evidence_sha256)
    values (p_user, v_plan.id, p_provider, v_wallet, public.member_reference_code(p_user), v_txn,
            p_sender_phone, v_plan.price, v_plan.currency, p_paid_at, p_evidence_path, p_evidence_sha256)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'TRANSACTION_ALREADY_CLAIMED' using errcode = '22023';
  end;

  -- §17 payment fraud signals: the same screenshot or a rejected transaction ID used again.
  if exists (select 1 from public.payment_claims where evidence_sha256 = p_evidence_sha256 and id <> v_id) then
    perform public.raise_flag('CLAIM', v_id, 'DUPLICATE_EVIDENCE', jsonb_build_object('user_id', p_user));
  end if;
  if exists (select 1 from public.payment_claims where provider = p_provider and transaction_id = v_txn and id <> v_id) then
    perform public.raise_flag('CLAIM', v_id, 'REUSED_TRANSACTION', jsonb_build_object('user_id', p_user));
  end if;
  return v_id;
end;
$$;

create or replace function public.cancel_payment_claim(p_user uuid, p_claim uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payment_claims set status = 'CANCELLED', updated_at = now()
  where id = p_claim and user_id = p_user and status in ('PENDING_REVIEW', 'NEEDS_INFO');
  if not found then
    raise exception 'CLAIM_NOT_OPEN' using errcode = 'P0002';
  end if;
end;
$$;

-- Answer an admin's question (NEEDS_INFO → PENDING_REVIEW), optionally with a new screenshot. Returns
-- the replaced screenshot's path so the server can delete it.
create or replace function public.reply_payment_claim(
  p_user            uuid,
  p_claim           uuid,
  p_note            text,
  p_evidence_path   text default null,
  p_evidence_sha256 text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old  text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select evidence_path into v_old from public.payment_claims
  where id = p_claim and user_id = p_user and status = 'NEEDS_INFO' for update;
  if not found then
    raise exception 'CLAIM_NOT_OPEN' using errcode = 'P0002';
  end if;
  if v_note is null and p_evidence_path is null then
    raise exception 'REPLY_REQUIRED' using errcode = '22023';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'NOTE_TOO_LONG' using errcode = '22023';
  end if;
  if p_evidence_path is not null and (p_evidence_path !~ '^[0-9a-f-]{36}\.webp$' or coalesce(p_evidence_sha256, '') !~ '^[0-9a-f]{64}$') then
    raise exception 'EVIDENCE_REQUIRED' using errcode = '22023';
  end if;
  update public.payment_claims
     set status = 'PENDING_REVIEW', member_note = coalesce(v_note, member_note),
         evidence_path = coalesce(p_evidence_path, evidence_path),
         evidence_sha256 = coalesce(p_evidence_sha256, evidence_sha256),
         updated_at = now()
   where id = p_claim;
  if p_evidence_path is not null
     and exists (select 1 from public.payment_claims where evidence_sha256 = p_evidence_sha256 and id <> p_claim) then
    perform public.raise_flag('CLAIM', p_claim, 'DUPLICATE_EVIDENCE', jsonb_build_object('user_id', p_user));
  end if;
  return case when p_evidence_path is not null then v_old end;
end;
$$;

-- The member's claims (Subscription & payments). Rejection reasons are shown neutrally by the app.
create or replace function public.member_claims(p_user uuid)
returns table (claim_id uuid, plan_name text, provider public.payment_provider, amount numeric, currency text,
               transaction_id text, status public.claim_status, rejection_reason public.claim_rejection_reason,
               staff_question text, created_at timestamptz, reviewed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, p.name, c.provider, c.amount, c.currency, c.transaction_id, c.status, c.rejection_reason,
         case when c.status = 'NEEDS_INFO' then c.staff_question end, c.created_at, c.reviewed_at
  from public.payment_claims c
  join public.subscription_plans p on p.id = c.plan_id
  where c.user_id = p_user
  order by c.created_at desc
  limit 50;
$$;

-- The member's passes (receipts).
create or replace function public.member_passes(p_user uuid)
returns table (plan_name text, source public.payment_source, starts_at timestamptz, expires_at timestamptz,
               amount numeric, currency text, provider public.payment_provider, transaction_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.name, s.source, s.starts_at, s.expires_at, pay.amount, pay.currency, pay.provider, pay.provider_transaction_id
  from public.subscriptions s
  join public.subscription_plans p on p.id = s.plan_id
  left join public.payments pay on pay.id = s.source_payment_id
  where s.user_id = p_user
  order by s.starts_at desc
  limit 50;
$$;

-- ---------------------------------------------------------------------------
-- Staff: Payment claims queue (§21). ADMIN and above only (BR-37; Q9: hidden from moderators).
-- ---------------------------------------------------------------------------
create or replace function public.assert_claim_reviewer()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff('ADMIN') then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.staff_claims_queue(p_limit integer default 100)
returns table (claim_id uuid, user_id uuid, plan_name text, provider public.payment_provider, amount numeric,
               currency text, status public.claim_status, created_at timestamptz, flags bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_claim_reviewer();
  return query
    select c.id, c.user_id, p.name, c.provider, c.amount, c.currency, c.status, c.created_at,
           (select count(*) from public.moderation_flags f where f.entity_type = 'CLAIM' and f.entity_id = c.id and f.status = 'OPEN')
    from public.payment_claims c
    join public.subscription_plans p on p.id = c.plan_id
    where c.status in ('PENDING_REVIEW', 'NEEDS_INFO')
    order by (c.status = 'PENDING_REVIEW') desc, c.created_at
    limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

create or replace function public.staff_claim_detail(p_claim uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform public.assert_claim_reviewer();
  select jsonb_build_object(
    'claim_id', c.id,
    'user_id', c.user_id,
    'display_name', pr.display_name,
    'own_claim', c.user_id = auth.uid(),
    'plan_name', p.name,
    'plan_price', p.price,
    'duration_hours', p.duration_hours,
    'provider', c.provider,
    'wallet', m.display_name || ' · ' || m.number_or_code,
    'reference_code', c.reference_code,
    'transaction_id', c.transaction_id,
    'sender_phone', c.sender_phone,
    'amount', c.amount,
    'currency', c.currency,
    'paid_at', c.paid_at,
    'status', c.status,
    'staff_question', c.staff_question,
    'member_note', c.member_note,
    'has_evidence', c.evidence_path is not null,
    'evidence_viewed', exists (select 1 from public.audit_logs a where a.action = 'EVIDENCE_VIEWED'
                               and a.entity_id = c.id::text and a.actor_id = auth.uid()),
    'created_at', c.created_at,
    'access_until', case when c.user_id is not null then public.casual_access_until(c.user_id) end,
    'flags', coalesce((select jsonb_agg(f.reason order by f.created_at) from public.moderation_flags f
                       where f.entity_type = 'CLAIM' and f.entity_id = c.id and f.status = 'OPEN'), '[]'::jsonb),
    'earlier_claims', coalesce((select jsonb_agg(jsonb_build_object('status', o.status, 'amount', o.amount,
                                                                    'rejection_reason', o.rejection_reason,
                                                                    'created_at', o.created_at) order by o.created_at desc)
                                from public.payment_claims o where o.user_id = c.user_id and o.id <> c.id), '[]'::jsonb)
  ) into v
  from public.payment_claims c
  join public.subscription_plans p on p.id = c.plan_id
  join public.merchant_accounts m on m.id = c.merchant_account_id
  left join public.profiles pr on pr.user_id = c.user_id
  where c.id = p_claim;
  return v;
end;
$$;

-- Every view of a screenshot is audited before it is signed (§16, BR-34).
create or replace function public.log_evidence_view(p_claim uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  perform public.assert_claim_reviewer();
  select user_id into v_user from public.payment_claims where id = p_claim and evidence_path is not null;
  if not found then
    raise exception 'CLAIM_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_user = auth.uid() then
    raise exception 'OWN_CONTENT' using errcode = '42501';
  end if;
  perform public.audit('EVIDENCE_VIEWED', 'payment_claim', p_claim::text, jsonb_build_object('user_id', v_user));
end;
$$;

-- Server-only: the screenshot path, signed after requireStaff('ADMIN') and log_evidence_view().
create or replace function public.claim_evidence_path(p_claim uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select evidence_path from public.payment_claims where id = p_claim;
$$;

-- Locks a claim for a decision: ADMIN+, never the reviewer's own account (BR-37).
create or replace function public.lock_claim_for_decision(p_claim uuid, p_statuses public.claim_status[])
returns public.payment_claims
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.payment_claims;
begin
  perform public.assert_claim_reviewer();
  select * into v from public.payment_claims where id = p_claim for update;
  if v.id is null then
    raise exception 'CLAIM_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v.user_id = auth.uid() then
    raise exception 'OWN_CONTENT' using errcode = '42501';
  end if;
  if not (v.status = any (p_statuses)) then
    raise exception 'CLAIM_NOT_PENDING' using errcode = 'P0002';
  end if;
  return v;
end;
$$;

-- §16 step 8: the ONLY way mobile money access is created (§6 rule 11). One transaction: claim
-- APPROVED, payment SUCCEEDED (+ event), access created or extended from the current expiry (BR-28),
-- audit row, member notified.
create or replace function public.approve_payment_claim(p_claim uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim   public.payment_claims;
  v_plan    public.subscription_plans;
  v_start   timestamptz;
  v_expires timestamptz;
  v_payment uuid;
begin
  v_claim := public.lock_claim_for_decision(p_claim, array['PENDING_REVIEW']::public.claim_status[]);
  if v_claim.user_id is null
     or not exists (select 1 from public.users where id = v_claim.user_id and status not in ('BANNED', 'DELETED')) then
    raise exception 'MEMBER_NOT_AVAILABLE' using errcode = '22023';
  end if;
  -- BR-38: the reviewer looked at the evidence (and the checklist in the console covers the wallet record).
  if v_claim.evidence_path is not null and not exists (
       select 1 from public.audit_logs a where a.action = 'EVIDENCE_VIEWED'
       and a.entity_id = v_claim.id::text and a.actor_id = auth.uid()) then
    raise exception 'EVIDENCE_NOT_VIEWED' using errcode = '22023';
  end if;
  select * into v_plan from public.subscription_plans where id = v_claim.plan_id;
  -- BR-36: amount equals the plan price exactly (OD-17: otherwise reject and refund manually).
  if v_plan.source <> 'MOBILE_MONEY' or v_claim.amount <> v_plan.price or v_claim.currency <> v_plan.currency then
    raise exception 'AMOUNT_MISMATCH' using errcode = '22023';
  end if;
  -- BR-35: a transaction is approved once per provider.
  if exists (select 1 from public.payments where provider = v_claim.provider
             and provider_transaction_id = v_claim.transaction_id) then
    raise exception 'TRANSACTION_ALREADY_APPROVED' using errcode = '22023';
  end if;
  -- BR-41
  if public.has_active_card_subscription(v_claim.user_id) then
    raise exception 'CARD_SUBSCRIPTION_ACTIVE' using errcode = '22023';
  end if;

  perform 1 from public.users where id = v_claim.user_id for update;
  -- BR-28: a pass bought during an active pass starts when the current one ends.
  v_start := greatest(now(), coalesce((select max(s.expires_at) from public.subscriptions s
                                       where s.user_id = v_claim.user_id and s.source = 'MOBILE_MONEY'
                                         and s.status = 'ACTIVE' and s.expires_at > now()), now()));
  v_expires := v_start + make_interval(hours => v_plan.duration_hours);

  insert into public.payments (user_id, plan_id, source, provider, provider_transaction_id, claim_id, amount, currency,
                               status, paid_at)
  values (v_claim.user_id, v_plan.id, 'MOBILE_MONEY', v_claim.provider, v_claim.transaction_id, v_claim.id,
          v_claim.amount, v_claim.currency, 'SUCCEEDED', v_claim.paid_at)
  returning id into v_payment;
  insert into public.payment_events (payment_id, claim_id, type, raw_payload, actor_id)
  values (v_payment, v_claim.id, 'CLAIM_APPROVED',
          jsonb_build_object('plan', v_plan.code, 'amount', v_claim.amount, 'currency', v_claim.currency), auth.uid());

  perform set_config('wk.claim_approval', 'on', true);
  insert into public.subscriptions (user_id, plan_id, source, status, starts_at, expires_at, source_payment_id)
  values (v_claim.user_id, v_plan.id, 'MOBILE_MONEY', 'ACTIVE', v_start, v_expires, v_payment);
  perform set_config('wk.claim_approval', 'off', true);

  update public.payment_claims
     set status = 'APPROVED', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   where id = v_claim.id;

  perform public.audit('PAYMENT_CLAIM_APPROVED', 'payment_claim', v_claim.id::text,
    jsonb_build_object('user_id', v_claim.user_id, 'payment_id', v_payment, 'plan', v_plan.code,
                       'amount', v_claim.amount, 'currency', v_claim.currency, 'provider', v_claim.provider,
                       'starts_at', v_start, 'expires_at', v_expires));
  perform public.notify(v_claim.user_id, 'PAYMENT_APPROVED',
    jsonb_build_object('claim_id', v_claim.id, 'plan', v_plan.name, 'expires_at', v_expires));
  return jsonb_build_object('payment_id', v_payment, 'starts_at', v_start, 'expires_at', v_expires);
end;
$$;

create or replace function public.reject_payment_claim(p_claim uuid, p_reason public.claim_rejection_reason)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.payment_claims;
  v_count integer;
begin
  v_claim := public.lock_claim_for_decision(p_claim, array['PENDING_REVIEW', 'NEEDS_INFO']::public.claim_status[]);
  if p_reason is null then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  update public.payment_claims
     set status = 'REJECTED', rejection_reason = p_reason, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   where id = v_claim.id;
  perform public.audit('PAYMENT_CLAIM_REJECTED', 'payment_claim', v_claim.id::text,
    jsonb_build_object('user_id', v_claim.user_id, 'reason', p_reason));
  if v_claim.user_id is not null then
    perform public.notify(v_claim.user_id, 'PAYMENT_REJECTED', jsonb_build_object('claim_id', v_claim.id, 'reason', p_reason));
    -- §17: repeated rejected claims flag the member for review (Payments-only flag, admins see it).
    select count(*) into v_count from public.payment_claims where user_id = v_claim.user_id and status = 'REJECTED';
    if v_count >= (public.get_setting('claims.rejections_before_flag'))::int then
      perform public.raise_flag('CLAIM', v_claim.id, 'REPEATED_REJECTED_CLAIMS',
        jsonb_build_object('user_id', v_claim.user_id, 'rejected', v_count));
    end if;
  end if;
end;
$$;

create or replace function public.request_claim_info(p_claim uuid, p_question text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.payment_claims;
  v_q     text := btrim(coalesce(p_question, ''));
begin
  v_claim := public.lock_claim_for_decision(p_claim, array['PENDING_REVIEW']::public.claim_status[]);
  if length(v_q) < 1 or length(v_q) > 300 then
    raise exception 'QUESTION_REQUIRED' using errcode = '22023';
  end if;
  update public.payment_claims
     set status = 'NEEDS_INFO', staff_question = v_q, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   where id = v_claim.id;
  -- The question is staff text, but it may quote member details: never copied into the audit row.
  perform public.audit('PAYMENT_CLAIM_NEEDS_INFO', 'payment_claim', v_claim.id::text,
    jsonb_build_object('user_id', v_claim.user_id));
  if v_claim.user_id is not null then
    perform public.notify(v_claim.user_id, 'PAYMENT_NEEDS_INFO', jsonb_build_object('claim_id', v_claim.id));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Flags, counts, jobs
-- ---------------------------------------------------------------------------

-- Payment flags (entity CLAIM) are for admins only (Q9: payments hidden from moderators).
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
declare
  v_admin boolean := public.is_staff('ADMIN');
begin
  if not public.is_staff('MODERATOR') then
    raise exception 'NOT_STAFF' using errcode = '42501';
  end if;
  return query
    select f.id, f.entity_type, f.entity_id, f.reason, f.created_at, u.id, p.display_name,
           public.effective_account_status(u.status, u.suspended_until), u.hidden_reason,
           u.status, case when u.suspended_until > now() then u.suspended_until end
    from public.moderation_flags f
    left join public.payment_claims c on f.entity_type = 'CLAIM' and c.id = f.entity_id
    left join public.users u on u.id = case f.entity_type
                                         when 'USER' then f.entity_id
                                         when 'MESSAGE' then (f.details ->> 'sender_id')::uuid
                                         when 'CLAIM' then c.user_id
                                       end
    left join public.profiles p on p.user_id = u.id
    where f.status = 'OPEN' and (f.entity_type <> 'CLAIM' or v_admin)
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
  if v_type = 'CLAIM' and not public.is_staff('ADMIN') then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if (v_type = 'USER' and v_entity = auth.uid())
     or (v_type = 'MESSAGE' and (v_details ->> 'sender_id')::uuid = auth.uid())
     or (v_type = 'CLAIM' and exists (select 1 from public.payment_claims where id = v_entity and user_id = auth.uid())) then
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

-- Dashboard: claims for admins only (§21: count and age of the oldest pending claim).
create or replace function public.staff_queue_counts()
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
  v := jsonb_build_object(
    'photos_pending', (select count(*) from public.profile_photos where status = 'PENDING_REVIEW'),
    'photos_oldest', (select min(submitted_at) from public.profile_photos where status = 'PENDING_REVIEW'),
    'verifications_pending', (select count(*) from public.verifications where status = 'PENDING'),
    'verifications_escalated', (select count(*) from public.verifications where status = 'PENDING' and escalated),
    'verifications_oldest', (select min(submitted_at) from public.verifications where status = 'PENDING'),
    'reports_open', (select count(*) from public.reports where status = 'OPEN'),
    'reports_high', (select count(*) from public.reports where status = 'OPEN' and priority = 'HIGH'),
    'flags_open', (select count(*) from public.moderation_flags where status = 'OPEN'
                   and (entity_type <> 'CLAIM' or public.is_staff('ADMIN')))
  );
  if public.is_staff('ADMIN') then
    v := v || jsonb_build_object(
      'claims_pending', (select count(*) from public.payment_claims where status = 'PENDING_REVIEW'),
      'claims_oldest', (select min(created_at) from public.payment_claims where status = 'PENDING_REVIEW'));
  end if;
  return v;
end;
$$;

-- Tidy job: access already ends by time comparison (BR-27); this records it.
create or replace function public.expire_subscriptions()
returns integer
language sql
security definer
set search_path = ''
as $$
  with done as (
    update public.subscriptions set status = 'EXPIRED', updated_at = now()
    where status in ('ACTIVE', 'CANCELLED') and expires_at <= now()
    returning 1
  )
  select count(*)::int from done;
$$;

-- OD-18 retention: screenshots of decided claims past the retention period. Records stay.
create or replace function public.evidence_due_for_deletion(p_limit integer default 200)
returns table (claim_id uuid, evidence_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.evidence_path from public.payment_claims c
  where c.evidence_path is not null and c.status in ('APPROVED', 'REJECTED', 'CANCELLED')
    and coalesce(c.reviewed_at, c.updated_at)
        < now() - make_interval(days => (public.get_setting('claims.evidence_retention_days'))::int)
  order by c.updated_at
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;

create or replace function public.mark_evidence_deleted(p_claim_ids uuid[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with done as (
    update public.payment_claims set evidence_path = null, evidence_deleted_at = now()
    where id = any (p_claim_ids) and evidence_path is not null and status in ('APPROVED', 'REJECTED', 'CANCELLED')
    returning 1
  )
  select count(*)::int from done;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.payments_guard() from public, anon, authenticated, service_role;
revoke all on function public.payment_events_append_only() from public, anon, authenticated, service_role;
revoke all on function public.subscriptions_insert_guard() from public, anon, authenticated, service_role;
revoke all on function public.casual_access_until(uuid) from public, anon, authenticated, service_role;
revoke all on function public.has_casual_access(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.has_active_card_subscription(uuid) from public, anon, authenticated, service_role;
revoke all on function public.member_reference_code(uuid) from public, anon, authenticated, service_role;
revoke all on function public.assert_can_pay(uuid) from public, anon, authenticated, service_role;
revoke all on function public.assert_claim_reviewer() from public, anon, authenticated, service_role;
revoke all on function public.lock_claim_for_decision(uuid, public.claim_status[]) from public, anon, authenticated, service_role;
revoke all on function public.member_payment_options(uuid) from public, anon, authenticated;
revoke all on function public.public_plans() from public, anon, authenticated;
revoke all on function public.submit_payment_claim(uuid, uuid, public.payment_provider, text, text, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.cancel_payment_claim(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reply_payment_claim(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.member_claims(uuid) from public, anon, authenticated;
revoke all on function public.member_passes(uuid) from public, anon, authenticated;
revoke all on function public.claim_evidence_path(uuid) from public, anon, authenticated;
revoke all on function public.expire_subscriptions() from public, anon, authenticated;
revoke all on function public.evidence_due_for_deletion(integer) from public, anon, authenticated;
revoke all on function public.mark_evidence_deleted(uuid[]) from public, anon, authenticated;
revoke all on function public.staff_claims_queue(integer) from public, anon;
revoke all on function public.staff_claim_detail(uuid) from public, anon;
revoke all on function public.log_evidence_view(uuid) from public, anon;
revoke all on function public.approve_payment_claim(uuid) from public, anon, service_role;
revoke all on function public.reject_payment_claim(uuid, public.claim_rejection_reason) from public, anon, service_role;
revoke all on function public.request_claim_info(uuid, text) from public, anon, service_role;
revoke all on function public.staff_flags_queue(integer) from public, anon;

grant execute on function public.has_casual_access(uuid, timestamptz) to service_role;
grant execute on function public.member_payment_options(uuid) to service_role;
grant execute on function public.public_plans() to service_role;
grant execute on function public.submit_payment_claim(uuid, uuid, public.payment_provider, text, text, timestamptz, text, text) to service_role;
grant execute on function public.cancel_payment_claim(uuid, uuid) to service_role;
grant execute on function public.reply_payment_claim(uuid, uuid, text, text, text) to service_role;
grant execute on function public.member_claims(uuid) to service_role;
grant execute on function public.member_passes(uuid) to service_role;
grant execute on function public.claim_evidence_path(uuid) to service_role;
grant execute on function public.expire_subscriptions() to service_role;
grant execute on function public.evidence_due_for_deletion(integer) to service_role;
grant execute on function public.mark_evidence_deleted(uuid[]) to service_role;

-- Staff functions run as the admin's own session (is_staff('ADMIN') = role + password + TOTP). The
-- decision functions are not granted to service_role: no server key can approve a claim.
grant execute on function public.staff_claims_queue(integer) to authenticated;
grant execute on function public.staff_claim_detail(uuid) to authenticated;
grant execute on function public.log_evidence_view(uuid) to authenticated;
grant execute on function public.approve_payment_claim(uuid) to authenticated;
grant execute on function public.reject_payment_claim(uuid, public.claim_rejection_reason) to authenticated;
grant execute on function public.request_claim_info(uuid, text) to authenticated;
grant execute on function public.staff_flags_queue(integer) to authenticated;
