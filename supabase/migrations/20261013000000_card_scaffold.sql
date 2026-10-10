-- Phase 7b — Card subscriptions, scaffold (spec §16; BR-26 card, BR-29, BR-40, BR-41).
-- No real processor yet (OD-4). Everything a processor needs on our side is real and tested: checkout
-- records, the idempotent event log, the subscription state machine and cancel-at-period-end. The
-- processor adapter (lib/payments/card) verifies the signature first and only then calls
-- apply_card_event() with a normalised event. Card access is created only here (wk.card_event).
-- Open owner decisions are settings without a value: OD-19, OD-20 and the renewal reminder lead time.

-- ---------------------------------------------------------------------------
-- Settings (no values: owner decisions pending; DEV-ONLY values in seed.sql)
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('card.grace_hours', null, 'Hours of access kept after a failed card renewal before it expires (OD-20, BR-40).'),
  ('card.allow_during_mobile_money_pass', null,
   'true: a card subscription may start while a mobile money pass is active, both run at once (OD-19).'),
  ('card.renewal_reminder_hours', null, 'Hours before a card renewal that the member is reminded (§16; sent from Phase 11).')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
-- Which processor a card subscription lives at, the paid period end (expires_at adds the grace period
-- after a failed renewal) and the time of the last processor event applied (out-of-order delivery).
alter table public.subscriptions
  add column processor     text check (processor ~ '^[a-z0-9_]{2,30}$'),
  add column period_end    timestamptz,
  add column last_event_at timestamptz,
  add constraint subscriptions_card_has_processor check (source <> 'CARD' or processor is not null);
create unique index subscriptions_processor_ref on public.subscriptions (processor, processor_subscription_id)
  where processor_subscription_id is not null;

-- The processor subscription a card charge belongs to (no foreign key: payments outlive subscriptions).
alter table public.payments add column processor_subscription_ref text;

-- Idempotency: one row per verified processor event.
alter table public.payment_events
  add column processor          text check (processor ~ '^[a-z0-9_]{2,30}$'),
  add column processor_event_id text check (length(processor_event_id) between 1 and 200);
create unique index payment_events_processor_event on public.payment_events (processor, processor_event_id)
  where processor_event_id is not null;
create index payment_events_invalid_idx on public.payment_events (received_at) where signature_valid = false;

-- ---------------------------------------------------------------------------
-- Integrity triggers, extended for the new columns
-- ---------------------------------------------------------------------------
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
     or new.transaction_key is distinct from old.transaction_key
     or new.processor_subscription_ref is distinct from old.processor_subscription_ref
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

create or replace function public.payment_events_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.actor_id is null and old.actor_id is not null
     and (new.id, new.payment_id, new.claim_id, new.type, new.raw_payload, new.signature_valid, new.received_at,
          new.processor, new.processor_event_id)
         is not distinct from
         (old.id, old.payment_id, old.claim_id, old.type, old.raw_payload, old.signature_valid, old.received_at,
          old.processor, old.processor_event_id) then
    return new; -- the actor's account was purged (on delete set null)
  end if;
  raise exception 'APPEND_ONLY' using errcode = '42501';
end;
$$;

-- Card rows: inserted and changed only by the card functions below (wk.card_event), never moved to
-- another member, plan or source.
create or replace function public.subscriptions_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.source = 'MOBILE_MONEY' and coalesce(current_setting('wk.claim_approval', true), '') <> 'on' then
      raise exception 'ACCESS_ONLY_BY_CLAIM_APPROVAL' using errcode = '42501';
    end if;
    if new.source = 'CARD' and coalesce(current_setting('wk.card_event', true), '') <> 'on' then
      raise exception 'ACCESS_ONLY_BY_CARD_EVENT' using errcode = '42501';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    -- Only as part of purging the member's account (OD-7, on delete cascade).
    if exists (select 1 from public.users where id = old.user_id) then
      raise exception 'SUBSCRIPTION_IMMUTABLE' using errcode = '42501';
    end if;
    return old;
  end if;
  if coalesce(current_setting('wk.subscription_admin', true), '') = 'on' then
    return new;
  end if;
  if coalesce(current_setting('wk.card_event', true), '') = 'on' and old.source = 'CARD' then
    if (new.id, new.user_id, new.plan_id, new.source, new.created_at)
       is distinct from (old.id, old.user_id, old.plan_id, old.source, old.created_at)
       or (old.source_payment_id is not null and new.source_payment_id is distinct from old.source_payment_id)
       or (old.processor is not null and new.processor is distinct from old.processor) then
      raise exception 'SUBSCRIPTION_IMMUTABLE' using errcode = '42501';
    end if;
    return new;
  end if;
  if (new.id, new.user_id, new.plan_id, new.source, new.starts_at, new.expires_at, new.source_payment_id,
      new.auto_renew, new.cancel_at_period_end, new.processor_subscription_id, new.created_at,
      new.processor, new.period_end, new.last_event_at)
     is distinct from
     (old.id, old.user_id, old.plan_id, old.source, old.starts_at, old.expires_at, old.source_payment_id,
      old.auto_renew, old.cancel_at_period_end, old.processor_subscription_id, old.created_at,
      old.processor, old.period_end, old.last_event_at)
     or not (new.status = 'EXPIRED' and old.expires_at <= now()) then
    raise exception 'SUBSCRIPTION_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access (BR-27, BR-40): a failed renewal keeps access until expires_at, which then includes the grace
-- period. PENDING, SUSPENDED, REFUNDED and EXPIRED never give access.
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
    where s.user_id = p_user and s.status in ('ACTIVE', 'CANCELLED', 'PAYMENT_FAILED')
      and s.starts_at <= p_at and s.expires_at > p_at
  );
$$;

create or replace function public.casual_access_until(p_user uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.has_casual_access(p_user)
    then (select max(s.expires_at) from public.subscriptions s
          where s.user_id = p_user and s.status in ('ACTIVE', 'CANCELLED', 'PAYMENT_FAILED') and s.expires_at > now())
  end;
$$;

create or replace function public.has_active_mobile_money_pass(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user and s.source = 'MOBILE_MONEY' and s.status = 'ACTIVE'
      and s.starts_at <= now() and s.expires_at > now()
  );
$$;

-- Tidy job: records ended access and abandoned checkouts (access itself ends by time, BR-27).
create or replace function public.expire_subscriptions()
returns integer
language sql
security definer
set search_path = ''
as $$
  with done as (
    update public.subscriptions set status = 'EXPIRED', updated_at = now()
    where status in ('ACTIVE', 'CANCELLED', 'PAYMENT_FAILED', 'PENDING') and expires_at <= now()
    returning 1
  )
  select count(*)::int from done;
$$;

-- ---------------------------------------------------------------------------
-- Member side (service_role; the member id comes from the session)
-- ---------------------------------------------------------------------------

-- Get access screen data, now with card plans and the OD-19 warning input.
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
    'card_plans', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name,
                                                                'duration_hours', p.duration_hours, 'price', p.price,
                                                                'currency', p.currency) order by p.sort_order, p.price)
                            from public.subscription_plans p where p.active and p.source = 'CARD'), '[]'::jsonb),
    'wallets', coalesce((select jsonb_agg(jsonb_build_object('provider', m.provider, 'display_name', m.display_name,
                                                             'number_or_code', m.number_or_code) order by m.provider)
                         from public.merchant_accounts m where m.active), '[]'::jsonb),
    'reference_code', public.member_reference_code(p_user),
    'access_until', public.casual_access_until(p_user),
    'card_active', public.has_active_card_subscription(p_user),
    'mobile_money_active', public.has_active_mobile_money_pass(p_user),
    'pending_claims', (select count(*) from public.payment_claims c
                       where c.user_id = p_user and c.status in ('PENDING_REVIEW', 'NEEDS_INFO')),
    'max_pending', (public.get_setting('claims.max_pending'))::int
  );
$$;

-- Receipts (§16 "Receipts ... in My profile"): one line per mobile money pass and one per card charge.
-- Abandoned card checkouts have no payment and are not receipts.
drop function public.member_passes(uuid);
create function public.member_passes(p_user uuid)
returns table (plan_name text, source public.payment_source, starts_at timestamptz, expires_at timestamptz,
               amount numeric, currency text, provider public.payment_provider, transaction_id text,
               payment_status public.payment_status)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select p.name, s.source, s.starts_at, s.expires_at, pay.amount, pay.currency, pay.provider,
           pay.provider_transaction_id, pay.status
    from public.subscriptions s
    join public.subscription_plans p on p.id = s.plan_id
    join public.payments pay on pay.id = s.source_payment_id
    where s.user_id = p_user and s.source = 'MOBILE_MONEY'
    union all
    select p.name, pay.source, pay.paid_at, null::timestamptz, pay.amount, pay.currency, pay.provider,
           null::text, pay.status
    from public.payments pay
    join public.subscription_plans p on p.id = pay.plan_id
    where pay.user_id = p_user and pay.source = 'CARD'
  ) r
  order by r.starts_at desc
  limit 50;
$$;
revoke all on function public.member_passes(uuid) from public, anon, authenticated;
grant execute on function public.member_passes(uuid) to service_role;

-- Card checkout (§16): records a PENDING subscription whose id the processor sends back with the
-- completed checkout. PENDING gives no access (BR-26); an abandoned checkout expires after an hour.
create or replace function public.start_card_checkout(p_user uuid, p_plan_code text, p_processor text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.subscription_plans;
  v_id   uuid;
begin
  perform public.assert_can_pay(p_user);
  if p_processor is null or p_processor !~ '^[a-z0-9_]{2,30}$' then
    raise exception 'BAD_PROCESSOR' using errcode = '22023';
  end if;
  select * into v_plan from public.subscription_plans
  where code = p_plan_code and active and source = 'CARD';
  if not found then
    raise exception 'PLAN_NOT_AVAILABLE' using errcode = '22023';
  end if;
  perform 1 from public.users where id = p_user for update;
  if public.has_active_card_subscription(p_user) then
    raise exception 'CARD_SUBSCRIPTION_ACTIVE' using errcode = '22023';
  end if;
  -- OD-19: only asked when it matters, so the setting is required only then.
  if public.has_active_mobile_money_pass(p_user)
     and not (public.get_setting('card.allow_during_mobile_money_pass'))::boolean then
    raise exception 'MOBILE_MONEY_PASS_ACTIVE' using errcode = '22023';
  end if;
  if (select count(*) from public.subscriptions
      where user_id = p_user and source = 'CARD' and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'TOO_MANY_CHECKOUTS' using errcode = '22023';
  end if;

  perform set_config('wk.card_event', 'on', true);
  -- One open checkout at a time: an earlier one is closed (a late completion of it is still honoured).
  update public.subscriptions set status = 'EXPIRED', expires_at = greatest(starts_at + interval '1 second', now()),
         updated_at = now()
  where user_id = p_user and source = 'CARD' and status = 'PENDING';
  insert into public.subscriptions (user_id, plan_id, source, status, starts_at, expires_at, auto_renew, processor)
  values (p_user, v_plan.id, 'CARD', 'PENDING', now(), now() + interval '1 hour', true, p_processor)
  returning id into v_id;
  perform set_config('wk.card_event', 'off', true);
  return jsonb_build_object('reference', v_id, 'plan_code', v_plan.code, 'processor_price_id', v_plan.processor_price_id);
end;
$$;

-- The member's current card subscription (§16 My profile: status, renewal, cancel).
create or replace function public.member_card_subscription(p_user uuid)
returns table (id uuid, plan_name text, price numeric, currency text, status public.subscription_status,
               starts_at timestamptz, period_end timestamptz, expires_at timestamptz,
               cancel_at_period_end boolean, processor text, processor_subscription_id text, customer_ref text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, p.name, p.price, p.currency, s.status, s.starts_at, s.period_end, s.expires_at,
         s.cancel_at_period_end, s.processor, s.processor_subscription_id,
         (select c.customer_ref from public.card_customers c where c.user_id = s.user_id and c.processor = s.processor)
  from public.subscriptions s
  join public.subscription_plans p on p.id = s.plan_id
  where s.user_id = p_user and s.source = 'CARD' and s.processor_subscription_id is not null
    and s.status in ('ACTIVE', 'CANCELLED', 'PAYMENT_FAILED', 'SUSPENDED') and s.expires_at > now()
  order by s.expires_at desc
  limit 1;
$$;

-- Cancel at period end (BR-40). Called after the processor confirmed the cancellation; the processor's
-- own CANCEL_SCHEDULED event then arrives as a no-op.
create or replace function public.member_cancel_card_subscription(p_user uuid, p_subscription uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
begin
  select * into v_sub from public.subscriptions
  where id = p_subscription and user_id = p_user and source = 'CARD'
  for update;
  if not found or v_sub.status not in ('ACTIVE', 'PAYMENT_FAILED', 'CANCELLED') or v_sub.expires_at <= now() then
    raise exception 'NOTHING_TO_CANCEL' using errcode = '22023';
  end if;
  if v_sub.cancel_at_period_end then
    return;
  end if;
  perform set_config('wk.card_event', 'on', true);
  update public.subscriptions
     set status = 'CANCELLED', cancel_at_period_end = true, auto_renew = false, updated_at = now()
   where id = v_sub.id;
  perform set_config('wk.card_event', 'off', true);
  insert into public.payment_events (type, raw_payload, actor_id, processor)
  values ('CARD_CANCEL_REQUESTED', jsonb_build_object('subscription_id', v_sub.id), p_user, v_sub.processor);
end;
$$;

-- ---------------------------------------------------------------------------
-- Processor events (webhook). The server calls these only after the adapter verified the signature.
-- ---------------------------------------------------------------------------

-- A delivery whose signature failed: logged without trusting anything in it (§22). Logging pauses
-- under a flood so forged requests can't grow the append-only table without limit.
create or replace function public.log_invalid_card_webhook(p_processor text, p_reason text, p_body text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.payment_events
      where signature_valid = false and received_at > now() - interval '10 minutes') >= 100 then
    return false;
  end if;
  insert into public.payment_events (type, raw_payload, signature_valid, processor)
  values ('CARD_WEBHOOK_INVALID',
          jsonb_build_object('reason', left(coalesce(p_reason, ''), 60), 'length', length(coalesce(p_body, '')),
                             'body', left(coalesce(p_body, ''), 2048)),
          false,
          case when p_processor ~ '^[a-z0-9_]{2,30}$' then p_processor end);
  return true;
end;
$$;

-- Records one card charge (BR-29: a new immutable payment row); null when it was already recorded.
create or replace function public.record_card_charge(p_sub public.subscriptions, p_event jsonb, p_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_charge  text := p_event ->> 'charge_id';
  v_amount  numeric;
  v_key     text;
  v_payment uuid;
begin
  if v_charge is null or length(v_charge) not between 1 and 200 then
    raise exception 'CHARGE_ID_REQUIRED' using errcode = '22023';
  end if;
  if coalesce(p_event ->> 'currency', '') <> 'USD' then
    raise exception 'CURRENCY_NOT_SUPPORTED' using errcode = '22023'; -- OD-2
  end if;
  v_amount := (p_event ->> 'amount')::numeric;
  if v_amount is null or v_amount <= 0 then
    raise exception 'BAD_AMOUNT' using errcode = '22023';
  end if;
  -- Card keys carry a prefix with a colon, which mobile money keys (letters and digits) never have.
  v_key := 'CARD:' || p_sub.processor || ':' || v_charge;
  if exists (select 1 from public.payments where transaction_key = v_key) then
    return null;
  end if;
  insert into public.payments (user_id, plan_id, source, provider, provider_transaction_id, transaction_key,
                               amount, currency, status, paid_at, processor_subscription_ref)
  values (p_sub.user_id, p_sub.plan_id, 'CARD', 'CARD', v_charge, v_key, v_amount, 'USD', 'SUCCEEDED', p_at,
          coalesce(p_sub.processor_subscription_id, p_event ->> 'subscription_ref'))
  returning id into v_payment;
  insert into public.payment_events (payment_id, type, raw_payload, processor)
  values (v_payment, 'CARD_CHARGE_RECORDED', jsonb_build_object('event_id', p_event ->> 'id'), p_sub.processor);
  return v_payment;
end;
$$;

-- State machine (§16 subscription states; BR-40). Returns what happened.
create or replace function public.card_event_transition(p_processor text, p_event jsonb, p_at timestamptz)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type    text := p_event ->> 'type';
  v_sub     public.subscriptions;
  v_ref     uuid;
  v_end     timestamptz;
  v_payment uuid;
  v_status  public.subscription_status;
  v_charge  public.payments;
begin
  if v_type = 'CHECKOUT_COMPLETED' then
    begin
      v_ref := (p_event ->> 'reference')::uuid;
    exception when invalid_text_representation then
      raise exception 'UNKNOWN_CHECKOUT' using errcode = '22023';
    end;
    select * into v_sub from public.subscriptions
    where id = v_ref and source = 'CARD' and processor = p_processor
    for update;
    if not found then
      raise exception 'UNKNOWN_CHECKOUT' using errcode = '22023';
    end if;
    if v_sub.processor_subscription_id is not null then
      return 'IGNORED_ALREADY_ACTIVE';
    end if;
    -- PENDING, or a checkout closed by a newer one / the hourly tidy: the member paid, so it is honoured.
    if v_sub.status not in ('PENDING', 'EXPIRED') then
      raise exception 'CHECKOUT_NOT_PENDING' using errcode = '22023';
    end if;
    if coalesce(p_event ->> 'subscription_ref', '') = '' then
      raise exception 'SUBSCRIPTION_REF_REQUIRED' using errcode = '22023';
    end if;
    v_end := (p_event ->> 'period_end')::timestamptz;
    if v_end is null or v_end <= p_at then
      raise exception 'BAD_PERIOD_END' using errcode = '22023';
    end if;
    v_sub.processor_subscription_id := p_event ->> 'subscription_ref';
    v_payment := public.record_card_charge(v_sub, p_event, p_at);
    if v_payment is null then
      raise exception 'CHARGE_ALREADY_RECORDED' using errcode = '22023';
    end if;
    update public.subscriptions
       set status = 'ACTIVE', starts_at = least(p_at, now()), expires_at = v_end, period_end = v_end,
           processor_subscription_id = p_event ->> 'subscription_ref', source_payment_id = v_payment,
           auto_renew = true, cancel_at_period_end = false, last_event_at = p_at, updated_at = now()
     where id = v_sub.id;
    if coalesce(p_event ->> 'customer_ref', '') <> '' then
      insert into public.card_customers (user_id, processor, customer_ref)
      values (v_sub.user_id, p_processor, p_event ->> 'customer_ref')
      on conflict (user_id) do update set processor = excluded.processor, customer_ref = excluded.customer_ref;
    end if;
    return 'ACTIVATED';
  end if;

  if coalesce(p_event ->> 'subscription_ref', '') = '' then
    raise exception 'SUBSCRIPTION_REF_REQUIRED' using errcode = '22023';
  end if;
  select * into v_sub from public.subscriptions
  where processor = p_processor and processor_subscription_id = p_event ->> 'subscription_ref'
  for update;
  if not found then
    raise exception 'UNKNOWN_SUBSCRIPTION' using errcode = '22023';
  end if;

  -- Money events apply whatever their order; state events older than the last one applied are stale.
  if v_type in ('RENEWAL_FAILED', 'CANCEL_SCHEDULED', 'SUBSCRIPTION_ENDED')
     and v_sub.last_event_at is not null and p_at < v_sub.last_event_at then
    return 'IGNORED_STALE';
  end if;

  if v_type = 'RENEWAL_SUCCEEDED' then
    v_end := (p_event ->> 'period_end')::timestamptz;
    if v_end is null or v_end <= p_at then
      raise exception 'BAD_PERIOD_END' using errcode = '22023';
    end if;
    v_payment := public.record_card_charge(v_sub, p_event, p_at);
    if v_payment is null then
      return 'IGNORED_CHARGE_RECORDED';
    end if;
    v_end := greatest(v_end, coalesce(v_sub.period_end, v_end));
    v_status := case when v_sub.status in ('SUSPENDED', 'REFUNDED') then v_sub.status
                     when v_sub.cancel_at_period_end then 'CANCELLED'
                     else 'ACTIVE' end;
    update public.subscriptions
       set status = v_status, period_end = v_end, expires_at = v_end,
           last_event_at = greatest(p_at, coalesce(last_event_at, p_at)), updated_at = now()
     where id = v_sub.id;
    return 'RENEWED';
  end if;

  if v_type = 'RENEWAL_FAILED' then
    -- BR-40 / OD-20: access continues for the grace period, counted from the failure (not before the paid
    -- period ends), and is not extended again by later failed retries.
    if v_sub.status = 'ACTIVE' or (v_sub.status = 'EXPIRED' and v_sub.auto_renew and not v_sub.cancel_at_period_end) then
      update public.subscriptions
         set status = 'PAYMENT_FAILED',
             expires_at = greatest(coalesce(period_end, expires_at), p_at)
                          + make_interval(hours => (public.get_setting('card.grace_hours'))::int),
             last_event_at = p_at, updated_at = now()
       where id = v_sub.id;
      return 'PAYMENT_FAILED';
    end if;
    return 'IGNORED_STATE';
  end if;

  if v_type = 'CANCEL_SCHEDULED' then
    update public.subscriptions
       set status = case when status in ('ACTIVE', 'PAYMENT_FAILED') then 'CANCELLED'::public.subscription_status
                         else status end,
           cancel_at_period_end = true, auto_renew = false, last_event_at = p_at, updated_at = now()
     where id = v_sub.id;
    return 'CANCELLED';
  end if;

  if v_type = 'SUBSCRIPTION_ENDED' then
    -- No more renewals. Paid time (and a running grace period) is kept; nothing is cut short.
    update public.subscriptions
       set status = case when expires_at <= now() and status in ('ACTIVE', 'CANCELLED', 'PAYMENT_FAILED')
                           then 'EXPIRED'::public.subscription_status
                         when status = 'ACTIVE' then 'CANCELLED'::public.subscription_status
                         else status end,
           auto_renew = false, last_event_at = greatest(p_at, coalesce(last_event_at, p_at)), updated_at = now()
     where id = v_sub.id;
    return 'ENDED';
  end if;

  if v_type = 'DISPUTE_OPENED' then
    -- §16: SUSPENDED by a processor dispute; access stops until it is settled.
    if v_sub.status in ('ACTIVE', 'CANCELLED', 'PAYMENT_FAILED', 'EXPIRED') then
      update public.subscriptions set status = 'SUSPENDED', updated_at = now() where id = v_sub.id;
      return 'SUSPENDED';
    end if;
    return 'IGNORED_STATE';
  end if;

  if v_type = 'DISPUTE_CLOSED' then
    if v_sub.status <> 'SUSPENDED' then
      return 'IGNORED_STATE';
    end if;
    if (p_event ->> 'won')::boolean then
      update public.subscriptions
         set status = case when cancel_at_period_end then 'CANCELLED'::public.subscription_status
                           else 'ACTIVE'::public.subscription_status end,
             updated_at = now()
       where id = v_sub.id;
      return 'RESTORED';
    end if;
    v_type := 'REFUNDED'; -- a lost dispute returns the money: handled as a refund below
  end if;

  if v_type = 'REFUNDED' then
    -- Refunds are new events, not edits (§16): the payment's status changes and the trigger logs it.
    select * into v_charge from public.payments
    where transaction_key = 'CARD:' || p_processor || ':' || coalesce(p_event ->> 'charge_id', '')
    for update;
    if not found then
      raise exception 'UNKNOWN_CHARGE' using errcode = '22023';
    end if;
    if v_charge.status <> 'REFUNDED' then
      update public.payments set status = 'REFUNDED' where id = v_charge.id;
    end if;
    -- Access ends when the refunded charge paid for the current period (the latest charge).
    if v_charge.paid_at >= (select max(p.paid_at) from public.payments p
                            where p.source = 'CARD' and p.processor_subscription_ref = v_sub.processor_subscription_id
                              and p.transaction_key like 'CARD:' || p_processor || ':%') then
      update public.subscriptions
         set status = 'REFUNDED', auto_renew = false, updated_at = now()
       where id = v_sub.id;
      return 'REFUNDED';
    end if;
    return 'REFUNDED_EARLIER_CHARGE';
  end if;

  raise exception 'UNKNOWN_EVENT_TYPE' using errcode = '22023';
end;
$$;

-- BR-26 (card): access starts only from a verified processor event. Idempotent on the processor event ID
-- (§16, §22): a replay returns DUPLICATE and changes nothing. A well-signed event we can't apply is
-- recorded as rejected (so the processor stops retrying and staff can see it); a missing owner setting
-- (e.g. OD-20) raises instead, so the processor retries once it is set.
create or replace function public.apply_card_event(p_processor text, p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      text := p_event ->> 'id';
  v_type    text := p_event ->> 'type';
  v_at      timestamptz;
  v_outcome text;
begin
  if p_processor is null or p_processor !~ '^[a-z0-9_]{2,30}$' or v_id is null or length(v_id) not between 1 and 200
     or v_type is null or v_type !~ '^[A-Z_]{3,30}$' then
    raise exception 'BAD_EVENT' using errcode = '22023';
  end if;
  begin
    v_at := (p_event ->> 'occurred_at')::timestamptz;
  exception when others then
    raise exception 'BAD_EVENT' using errcode = '22023';
  end;
  if v_at is null then
    raise exception 'BAD_EVENT' using errcode = '22023';
  end if;
  v_at := least(v_at, now()); -- a processor clock ahead of ours never post-dates a change

  begin
    insert into public.payment_events (type, raw_payload, signature_valid, processor, processor_event_id)
    values ('CARD_' || v_type, p_event, true, p_processor, v_id);
  exception when unique_violation then
    return jsonb_build_object('outcome', 'DUPLICATE');
  end;

  perform set_config('wk.card_event', 'on', true);
  begin
    v_outcome := public.card_event_transition(p_processor, p_event, v_at);
  exception when sqlstate '22023' or invalid_text_representation or invalid_datetime_format
                 or datetime_field_overflow or numeric_value_out_of_range then
    perform set_config('wk.card_event', 'off', true);
    insert into public.payment_events (type, raw_payload, signature_valid, processor)
    values ('CARD_EVENT_REJECTED', jsonb_build_object('event_id', v_id, 'reason', left(sqlerrm, 80)), true, p_processor);
    return jsonb_build_object('outcome', 'REJECTED', 'reason', left(sqlerrm, 80));
  end;
  perform set_config('wk.card_event', 'off', true);
  return jsonb_build_object('outcome', 'APPLIED', 'result', v_outcome);
end;
$$;

-- Renewal reminder hook (§16). Notifications are sent from Phase 11; nothing is due while the lead time
-- has no value.
create or replace function public.card_renewals_due()
returns table (subscription_id uuid, user_id uuid, renews_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.user_id, s.period_end
  from public.subscriptions s
  cross join (select (value #>> '{}')::int as hours from public.app_settings
              where key = 'card.renewal_reminder_hours' and value is not null) r
  where s.source = 'CARD' and s.status = 'ACTIVE' and s.auto_renew and not s.cancel_at_period_end
    and s.period_end > now() and s.period_end <= now() + make_interval(hours => r.hours)
  order by s.period_end
  limit 500;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: server only. No client role may call any of these.
-- ---------------------------------------------------------------------------
revoke all on function public.has_active_mobile_money_pass(uuid) from public, anon, authenticated, service_role;
revoke all on function public.record_card_charge(public.subscriptions, jsonb, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.card_event_transition(text, jsonb, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.casual_access_until(uuid) from public, anon, authenticated, service_role;
revoke all on function public.has_casual_access(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.expire_subscriptions() from public, anon, authenticated;
revoke all on function public.member_payment_options(uuid) from public, anon, authenticated;
revoke all on function public.start_card_checkout(uuid, text, text) from public, anon, authenticated;
revoke all on function public.member_card_subscription(uuid) from public, anon, authenticated;
revoke all on function public.member_cancel_card_subscription(uuid, uuid) from public, anon, authenticated;
revoke all on function public.log_invalid_card_webhook(text, text, text) from public, anon, authenticated;
revoke all on function public.apply_card_event(text, jsonb) from public, anon, authenticated;
revoke all on function public.card_renewals_due() from public, anon, authenticated;
revoke all on function public.payments_guard() from public, anon, authenticated, service_role;
revoke all on function public.payment_events_append_only() from public, anon, authenticated, service_role;
revoke all on function public.subscriptions_insert_guard() from public, anon, authenticated, service_role;

grant execute on function public.has_casual_access(uuid, timestamptz) to service_role;
grant execute on function public.expire_subscriptions() to service_role;
grant execute on function public.member_payment_options(uuid) to service_role;
grant execute on function public.start_card_checkout(uuid, text, text) to service_role;
grant execute on function public.member_card_subscription(uuid) to service_role;
grant execute on function public.member_cancel_card_subscription(uuid, uuid) to service_role;
grant execute on function public.log_invalid_card_webhook(text, text, text) to service_role;
grant execute on function public.apply_card_event(text, jsonb) to service_role;
grant execute on function public.card_renewals_due() to service_role;
