-- Phase 10 — Admin console (complete) + account lifecycle (spec §7, §8, §21; BR-7, BR-34; OD-7, OD-13,
-- OD-30). Every staff function runs as the staff member's own session and checks role + MFA with
-- is_staff(); every change writes audit_logs in the same transaction (BR-34). Members delete their
-- account (hidden at once, purged after OD-7) and export their data.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('account.deletion_purge_days', null, 'Days after a member deletes their account before their data is purged (OD-7). No purge while unset.'),
  ('subscriptions.manual_extension_max_days', null, 'Most days an admin may add to a subscription in one extension (OD-30).'),
  ('export.max_per_day', null, 'Data exports one member may download per day (T-19). No limit while unset.')
on conflict (key) do nothing;

-- What a value must look like, and which keys only a SUPER_ADMIN may change (§7: system config).
alter table public.app_settings
  add column kind text not null default 'int' check (kind in ('int', 'bool', 'object', 'array', 'enum')),
  add column allowed jsonb,
  add column super_admin_only boolean not null default false;
update public.app_settings set kind = 'bool' where key in ('card.allow_during_mobile_money_pass');
update public.app_settings set kind = 'object' where key in ('claims.transaction_id_patterns', 'detection.terms');
update public.app_settings set kind = 'array' where key in ('verification.pose_prompts');
update public.app_settings set kind = 'enum', allowed = '["SIGNUP_ONLY", "EVERY_SESSION"]'::jsonb where key = 'geo.enforcement_mode';
update public.app_settings set super_admin_only = true
where key in ('geo.enforcement_mode', 'photos.min_required', 'otp.max_per_phone_per_hour', 'otp.max_per_ip_per_hour',
              'staff_login.max_per_ip_per_hour', 'staff_login.max_per_account_per_hour',
              'staff_login.max_per_account_all_ips_per_hour', 'account.deletion_purge_days');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.require_staff(p_min_role public.user_role)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff(p_min_role) then
    raise exception 'STAFF_ONLY' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard (§21)
-- ---------------------------------------------------------------------------
create or replace function public.staff_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('ADMIN');
  return jsonb_build_object(
    'users', (select count(*) from public.users where role = 'USER' and status <> 'DELETED'),
    'users_active', (select count(*) from public.users where role = 'USER' and status = 'ACTIVE'),
    'users_verified', (select count(*) from public.users u where u.role = 'USER' and u.status <> 'DELETED'
                       and public.latest_verification_status(u.id) = 'VERIFIED'),
    'access_by_plan', coalesce((
      select jsonb_agg(jsonb_build_object('source', x.source, 'plan', x.name, 'members', x.n) order by x.source, x.name)
      from (select s.source, p.name, count(distinct s.user_id) as n
            from public.subscriptions s join public.subscription_plans p on p.id = s.plan_id
            where s.status in ('ACTIVE', 'CANCELLED', 'PAYMENT_FAILED') and s.starts_at <= now() and s.expires_at > now()
            group by s.source, p.name) x), '[]'::jsonb),
    'available_now', (select count(*) from public.availability a where public.is_in_pool(a.user_id)),
    'revenue_30d', coalesce((
      select jsonb_agg(jsonb_build_object('source', x.source, 'amount', x.total) order by x.source)
      from (select source, sum(amount) as total from public.payments
            where status = 'SUCCEEDED' and paid_at > now() - interval '30 days' group by source) x), '[]'::jsonb),
    'revenue_all', coalesce((
      select jsonb_agg(jsonb_build_object('source', x.source, 'amount', x.total) order by x.source)
      from (select source, sum(amount) as total from public.payments where status = 'SUCCEEDED' group by source) x), '[]'::jsonb),
    'needs_refund', (select count(*) from public.payment_events e where e.type = 'CARD_NEEDS_REFUND'
                     and not exists (select 1 from public.payments p where p.id = e.payment_id and p.status = 'REFUNDED')),
    'queues', public.staff_queue_counts()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Users (§21): search, detail, DOB correction. Moderators see moderation data only; payment data and
-- the audit trail are ADMIN (§7). Phone numbers are matched on the server and never returned.
-- ---------------------------------------------------------------------------
create or replace function public.staff_users_search(
  p_query        text default null,
  p_status       public.account_status default null,
  p_verification text default null,
  p_has_access   boolean default null,
  p_available    boolean default null,
  p_phone        text default null,
  p_limit        integer default 50
)
returns table (user_id uuid, display_name text, age integer, area text, status public.account_status,
               effective_status public.account_status, verification text, hidden boolean, has_access boolean,
               in_pool boolean, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_staff('ADMIN');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  v_id    uuid;
begin
  perform public.require_staff('MODERATOR');
  if v_phone is not null and left(v_phone, 3) <> '231' then
    v_phone := '231' || ltrim(v_phone, '0');
  end if;
  begin
    v_id := btrim(p_query)::uuid;
  exception when others then
    v_id := null;
  end;
  return query
    select u.id, p.display_name, public.age_in_years(p.date_of_birth), a.name, u.status,
           public.effective_account_status(u.status, u.suspended_until),
           public.latest_verification_status(u.id), u.hidden_reason is not null,
           case when v_admin then public.has_casual_access(u.id) end,
           public.is_in_pool(u.id), u.created_at
    from public.users u
    left join public.profiles p on p.user_id = u.id
    left join public.areas a on a.id = p.area_id
    where u.role = 'USER'
      and (p_query is null or btrim(p_query) = '' or u.id = v_id or p.display_name ilike '%' || btrim(p_query) || '%')
      and (p_status is null or u.status = p_status)
      and (p_verification is null or public.latest_verification_status(u.id) = p_verification)
      and (p_has_access is null or (v_admin and public.has_casual_access(u.id) = p_has_access))
      and (p_available is null or public.is_in_pool(u.id) = p_available)
      and (v_phone is null or exists (select 1 from auth.users au where au.id = u.id and au.phone = v_phone))
    order by u.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

create or replace function public.staff_user_detail(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_staff('ADMIN');
  v_out   jsonb;
begin
  perform public.require_staff('MODERATOR');
  select jsonb_build_object(
    'user_id', u.id,
    'display_name', p.display_name,
    'age', public.age_in_years(p.date_of_birth),
    'area', a.name,
    'gender', p.gender,
    'intent_relationship', p.intent_relationship,
    'intent_casual', p.intent_casual,
    'bio', p.bio,
    'status', u.status,
    'effective_status', public.effective_account_status(u.status, u.suspended_until),
    'suspended_until', u.suspended_until,
    'hidden_reason', u.hidden_reason,
    'deleted_at', u.deleted_at,
    'created_at', u.created_at,
    'verification', public.latest_verification_status(u.id),
    'photos_approved', (select count(*) from public.profile_photos ph where ph.user_id = u.id and ph.status = 'APPROVED'),
    'photos_pending', (select count(*) from public.profile_photos ph where ph.user_id = u.id and ph.status = 'PENDING_REVIEW'),
    'in_pool', public.is_in_pool(u.id),
    'reports_against', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'category', r.category, 'priority', r.priority,
                                                                      'status', r.status, 'created_at', r.created_at)
                                                   order by r.created_at desc)
                                 from public.reports r where r.reported_user_id = u.id), '[]'::jsonb),
    'reports_filed', (select count(*) from public.reports r where r.reporter_id = u.id),
    'flags_open', coalesce((select jsonb_agg(jsonb_build_object('reason', f.reason, 'created_at', f.created_at) order by f.created_at desc)
                            from public.moderation_flags f where f.entity_type = 'USER' and f.entity_id = u.id and f.status = 'OPEN'
                              and (v_admin or f.reason not in ('CLAIM_REJECTIONS'))), '[]'::jsonb),
    -- ADMIN only (§7: subscriptions & payments, audit logs).
    'subscriptions', case when v_admin then coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'plan', pl.name, 'source', s.source, 'status', s.status,
                                          'starts_at', s.starts_at, 'expires_at', s.expires_at) order by s.starts_at desc)
      from public.subscriptions s join public.subscription_plans pl on pl.id = s.plan_id where s.user_id = u.id), '[]'::jsonb) end,
    'payments', case when v_admin then coalesce((
      select jsonb_agg(jsonb_build_object('id', pay.id, 'source', pay.source, 'provider', pay.provider, 'amount', pay.amount,
                                          'currency', pay.currency, 'status', pay.status, 'paid_at', pay.paid_at) order by pay.created_at desc)
      from public.payments pay where pay.user_id = u.id), '[]'::jsonb) end,
    'audit', case when v_admin then coalesce((
      select jsonb_agg(jsonb_build_object('action', l.action, 'actor', au.email, 'at', l.created_at, 'metadata', l.metadata)
                       order by l.created_at desc)
      from (select * from public.audit_logs l
            where l.entity_id = u.id::text or l.metadata ->> 'user_id' = u.id::text or l.metadata ->> 'target' = u.id::text
            order by l.created_at desc limit 100) l
      left join auth.users au on au.id = l.actor_id), '[]'::jsonb) end
  ) into v_out
  from public.users u
  left join public.profiles p on p.user_id = u.id
  left join public.areas a on a.id = p.area_id
  where u.id = p_user and u.role = 'USER';
  if v_out is null then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_out;
end;
$$;

-- BR-4 kept: a correction can't make a member under 18 (that is a ban, not a correction). The new date
-- of birth is never written to the audit log (§6 rule 7), only that it changed and why.
create or replace function public.staff_correct_dob(p_user uuid, p_dob date, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('ADMIN');
  if p_reason is null or length(btrim(p_reason)) < 5 or length(p_reason) > 500 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p join public.users u on u.id = p.user_id
                 where p.user_id = p_user and u.role = 'USER') then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform set_config('app.dob_correction', 'on', true);
  update public.profiles set date_of_birth = p_dob, dob_locked = true where user_id = p_user;
  perform set_config('app.dob_correction', 'off', true);
  perform public.audit('DOB_CORRECTED', 'user', p_user::text, jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Subscriptions (§21; OD-30): list, and extend an existing subscription with a reason. Never creates
-- access: only a subscription that is still running can be extended, capped per extension.
-- ---------------------------------------------------------------------------
create or replace function public.staff_subscriptions(p_status public.subscription_status default null, p_limit integer default 100)
returns table (subscription_id uuid, user_id uuid, display_name text, plan text, source public.payment_source,
               status public.subscription_status, starts_at timestamptz, expires_at timestamptz, cancel_at_period_end boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('ADMIN');
  return query
    select s.id, s.user_id, p.display_name, pl.name, s.source, s.status, s.starts_at, s.expires_at, s.cancel_at_period_end
    from public.subscriptions s
    join public.subscription_plans pl on pl.id = s.plan_id
    left join public.profiles p on p.user_id = s.user_id
    where (p_status is null or s.status = p_status) and s.status <> 'PENDING'
    order by s.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

create or replace function public.staff_extend_subscription(p_subscription uuid, p_days integer, p_reason text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_to  timestamptz;
begin
  perform public.require_staff('ADMIN');
  if p_reason is null or length(btrim(p_reason)) < 5 or length(p_reason) > 500 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  if p_days is null or p_days < 1 or p_days > (public.get_setting('subscriptions.manual_extension_max_days'))::int then
    raise exception 'EXTENSION_OUT_OF_RANGE' using errcode = '22023';
  end if;
  select * into v_sub from public.subscriptions where id = p_subscription for update;
  if not found or v_sub.status not in ('ACTIVE', 'CANCELLED', 'PAYMENT_FAILED') or v_sub.expires_at <= now()
     or v_sub.starts_at > now() then
    raise exception 'NOT_EXTENDABLE' using errcode = '22023';
  end if;
  v_to := v_sub.expires_at + make_interval(days => p_days);
  perform set_config('wk.subscription_admin', 'on', true);
  update public.subscriptions set expires_at = v_to, updated_at = now() where id = v_sub.id;
  perform set_config('wk.subscription_admin', 'off', true);
  perform public.audit('SUBSCRIPTION_MODIFIED', 'subscription', v_sub.id::text,
    jsonb_build_object('user_id', v_sub.user_id, 'days', p_days, 'from', v_sub.expires_at, 'to', v_to, 'reason', btrim(p_reason)));
  return v_to;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payments & events (§21), and refunds recorded as events (§16 immutability; OD-13 decides when).
-- ---------------------------------------------------------------------------
create or replace function public.staff_payments(p_source public.payment_source default null,
                                                 p_status public.payment_status default null,
                                                 p_needs_refund boolean default false,
                                                 p_limit integer default 100)
returns table (payment_id uuid, user_id uuid, display_name text, plan text, source public.payment_source,
               provider public.payment_provider, transaction_id text, amount numeric, currency text,
               status public.payment_status, paid_at timestamptz, needs_refund boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('ADMIN');
  return query
    select * from (
      select pay.id, pay.user_id, p.display_name, pl.name, pay.source, pay.provider, pay.provider_transaction_id,
             pay.amount, pay.currency, pay.status, pay.paid_at,
             pay.status <> 'REFUNDED' and exists (select 1 from public.payment_events e
                                                  where e.payment_id = pay.id and e.type = 'CARD_NEEDS_REFUND') as nr
      from public.payments pay
      join public.subscription_plans pl on pl.id = pay.plan_id
      left join public.profiles p on p.user_id = pay.user_id
      where (p_source is null or pay.source = p_source) and (p_status is null or pay.status = p_status)
      order by pay.created_at desc
    ) x
    where not coalesce(p_needs_refund, false) or x.nr
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

create or replace function public.staff_payment_events(p_payment uuid)
returns table (event_id uuid, type text, received_at timestamptz, signature_valid boolean, actor text, payload jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('ADMIN');
  return query
    select e.id, e.type, e.received_at, e.signature_valid, au.email::text, e.raw_payload
    from public.payment_events e
    left join auth.users au on au.id = e.actor_id
    where e.payment_id = p_payment or (e.claim_id is not null and e.claim_id = (select claim_id from public.payments where id = p_payment))
    order by e.received_at;
end;
$$;

-- The card webhook log (§21): every delivery, valid or not, newest first. Bodies of invalid deliveries
-- are only a hash and a short prefix (Phase 7b).
create or replace function public.staff_webhook_log(p_limit integer default 100)
returns table (event_id uuid, processor text, processor_event_id text, type text, signature_valid boolean,
               received_at timestamptz, payload jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('ADMIN');
  return query
    select e.id, e.processor, e.processor_event_id, e.type, e.signature_valid, e.received_at, e.raw_payload
    from public.payment_events e
    where e.type like 'CARD\_%'
    order by e.received_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

-- A refund paid out (by wallet transfer or in the card processor's dashboard) is recorded here: the
-- payment's status becomes REFUNDED (logged by its trigger, with the admin as actor) and the access it
-- paid for ends. Card renewals then stop at the processor (card_cancel_needed).
create or replace function public.staff_record_refund(p_payment uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.payments;
begin
  perform public.require_staff('ADMIN');
  if p_reason is null or length(btrim(p_reason)) < 5 or length(p_reason) > 500 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  select * into v_pay from public.payments where id = p_payment for update;
  if not found or v_pay.status <> 'SUCCEEDED' then
    raise exception 'NOT_REFUNDABLE' using errcode = '22023';
  end if;
  update public.payments set status = 'REFUNDED' where id = v_pay.id;
  perform set_config('wk.subscription_admin', 'on', true);
  if v_pay.source = 'MOBILE_MONEY' then
    update public.subscriptions set status = 'REFUNDED', updated_at = now() where source_payment_id = v_pay.id;
  elsif v_pay.processor_subscription_ref is not null
        and v_pay.paid_at >= (select max(p.paid_at) from public.payments p
                              where p.processor_subscription_ref = v_pay.processor_subscription_ref and p.source = 'CARD') then
    update public.subscriptions set status = 'REFUNDED', auto_renew = false, cancel_at_period_end = true, updated_at = now()
    where processor_subscription_id = v_pay.processor_subscription_ref and source = 'CARD';
  end if;
  perform set_config('wk.subscription_admin', 'off', true);
  perform public.audit('PAYMENT_REFUNDED', 'payment', v_pay.id::text,
    jsonb_build_object('user_id', v_pay.user_id, 'amount', v_pay.amount, 'currency', v_pay.currency,
                       'source', v_pay.source, 'reason', btrim(p_reason)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Analytics (§21): daily figures for the last N days.
-- ---------------------------------------------------------------------------
create or replace function public.staff_analytics(p_days integer default 30)
returns table (day date, signups bigint, verified bigint, passes_mobile_money bigint, passes_card bigint,
               revenue numeric, likes bigint, matches bigint, requests bigint, requests_accepted bigint, reports bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
begin
  perform public.require_staff('ADMIN');
  return query
    select d::date,
      (select count(*) from public.users u where u.role = 'USER' and u.created_at::date = d::date),
      (select count(*) from public.verifications v where v.status = 'VERIFIED' and v.reviewed_at::date = d::date),
      (select count(*) from public.payments p where p.source = 'MOBILE_MONEY' and p.paid_at::date = d::date),
      (select count(*) from public.payments p where p.source = 'CARD' and p.paid_at::date = d::date),
      coalesce((select sum(p.amount) from public.payments p where p.status = 'SUCCEEDED' and p.paid_at::date = d::date), 0),
      (select count(*) from public.likes l where l.created_at::date = d::date),
      (select count(*) from public.matches m where m.created_at::date = d::date),
      (select count(*) from public.message_requests r where r.created_at::date = d::date),
      (select count(*) from public.message_requests r where r.status = 'ACCEPTED' and r.responded_at::date = d::date),
      (select count(*) from public.reports r where r.created_at::date = d::date)
    from generate_series(current_date - (v_days - 1), current_date, interval '1 day') d
    order by 1 desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit logs (§21): read-only, filter by actor, action, entity, date. ADMIN and SUPER_ADMIN (§7).
-- ---------------------------------------------------------------------------
create or replace function public.staff_audit_logs(
  p_actor_email text default null,
  p_action      public.audit_action default null,
  p_entity_type text default null,
  p_entity_id   text default null,
  p_from        timestamptz default null,
  p_to          timestamptz default null,
  p_before      timestamptz default null,
  p_limit       integer default 100,
  p_before_id   uuid default null
)
returns table (log_id uuid, created_at timestamptz, actor text, action public.audit_action, entity_type text,
               entity_id text, metadata jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('ADMIN');
  return query
    select l.id, l.created_at, au.email::text, l.action, l.entity_type, l.entity_id, l.metadata
    from public.audit_logs l
    left join auth.users au on au.id = l.actor_id
    where (p_actor_email is null or au.email ilike btrim(p_actor_email))
      and (p_action is null or l.action = p_action)
      and (p_entity_type is null or l.entity_type = p_entity_type)
      and (p_entity_id is null or l.entity_id = p_entity_id)
      and (p_from is null or l.created_at >= p_from)
      and (p_to is null or l.created_at < p_to)
      -- Keyset page: rows written in one transaction share created_at, so the id breaks ties.
      and (p_before is null or (l.created_at, l.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by l.created_at desc, l.id desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

-- ---------------------------------------------------------------------------
-- Settings (§21): app settings, plans, merchant accounts, interests, areas. Every change is audited
-- SETTING_CHANGED with the old and new value. This is how the owner's decisions (OD-…, T-19) are set.
-- ---------------------------------------------------------------------------
create or replace function public.staff_settings()
returns table (key text, value jsonb, description text, kind text, allowed jsonb, super_admin_only boolean,
               updated_at timestamptz, updated_by text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('ADMIN');
  return query
    select s.key, s.value, s.description, s.kind, s.allowed, s.super_admin_only, s.updated_at, au.email::text
    from public.app_settings s
    left join auth.users au on au.id = s.updated_by
    order by s.key;
end;
$$;

create or replace function public.staff_update_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.app_settings;
  v_ok  boolean;
begin
  perform public.require_staff('ADMIN');
  select * into v_row from public.app_settings where key = p_key for update;
  if not found then
    raise exception 'UNKNOWN_SETTING' using errcode = 'P0002';
  end if;
  if v_row.super_admin_only and not public.is_staff('SUPER_ADMIN') then
    raise exception 'SUPER_ADMIN_ONLY' using errcode = '42501';
  end if;
  v_ok := case v_row.kind
    when 'int' then jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric)
                    and (p_value #>> '{}')::numeric between 0 and 1000000
    when 'bool' then jsonb_typeof(p_value) = 'boolean'
    when 'object' then jsonb_typeof(p_value) = 'object'
    when 'array' then jsonb_typeof(p_value) = 'array' and jsonb_array_length(p_value) > 0
    when 'enum' then jsonb_typeof(p_value) = 'string' and v_row.allowed ? (p_value #>> '{}')
    else false
  end;
  if not coalesce(v_ok, false) then
    raise exception 'INVALID_VALUE' using errcode = '22023';
  end if;
  update public.app_settings set value = p_value, updated_by = auth.uid(), updated_at = now() where key = p_key;
  perform public.audit('SETTING_CHANGED', 'app_setting', p_key, jsonb_build_object('from', v_row.value, 'to', p_value));
end;
$$;

create or replace function public.staff_plans()
returns table (plan_id uuid, code text, name text, source public.payment_source, duration_hours integer, price numeric,
               currency text, renews boolean, processor_price_id text, active boolean, sort_order integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('ADMIN');
  return query
    select p.id, p.code, p.name, p.source, p.duration_hours, p.price, p.currency, p.renews, p.processor_price_id,
           p.active, p.sort_order
    from public.subscription_plans p order by p.source, p.sort_order, p.price;
end;
$$;

-- Prices (OD-1) are set here. A price change never affects a claim already submitted (amount locked on
-- the claim) or a running card subscription (price locked at checkout).
create or replace function public.staff_save_plan(
  p_plan_id uuid, p_code text, p_name text, p_source public.payment_source, p_duration_hours integer,
  p_price numeric, p_processor_price_id text, p_active boolean, p_sort_order integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_id  uuid;
begin
  perform public.require_staff('ADMIN');
  if p_plan_id is null then
    insert into public.subscription_plans (code, name, source, duration_hours, price, renews, processor_price_id, active, sort_order)
    values (p_code, p_name, p_source, p_duration_hours, p_price, p_source = 'CARD', nullif(btrim(p_processor_price_id), ''),
            coalesce(p_active, true), coalesce(p_sort_order, 0))
    returning id into v_id;
  else
    select to_jsonb(p) into v_old from public.subscription_plans p where id = p_plan_id for update;
    if v_old is null then
      raise exception 'PLAN_NOT_FOUND' using errcode = 'P0002';
    end if;
    -- The code and source identify the plan everywhere; they don't change.
    update public.subscription_plans
       set name = p_name, duration_hours = p_duration_hours, price = p_price,
           processor_price_id = nullif(btrim(p_processor_price_id), ''), active = coalesce(p_active, active),
           sort_order = coalesce(p_sort_order, sort_order), updated_at = now()
     where id = p_plan_id
    returning id into v_id;
  end if;
  perform public.audit('SETTING_CHANGED', 'subscription_plan', v_id::text,
    jsonb_build_object('from', v_old, 'to', (select to_jsonb(p) from public.subscription_plans p where id = v_id)));
  return v_id;
end;
$$;

create or replace function public.staff_merchant_accounts()
returns table (account_id uuid, provider public.payment_provider, display_name text, number_or_code text, active boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('ADMIN');
  return query select m.id, m.provider, m.display_name, m.number_or_code, m.active
    from public.merchant_accounts m order by m.provider, m.active desc, m.created_at desc;
end;
$$;

-- One active wallet per provider: activating one retires the other.
create or replace function public.staff_save_merchant_account(
  p_account_id uuid, p_provider public.payment_provider, p_display_name text, p_number_or_code text, p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_id  uuid;
begin
  perform public.require_staff('ADMIN');
  if coalesce(p_active, true) then
    update public.merchant_accounts set active = false, updated_at = now()
    where provider = p_provider and active and id is distinct from p_account_id;
  end if;
  if p_account_id is null then
    insert into public.merchant_accounts (provider, display_name, number_or_code, active)
    values (p_provider, btrim(p_display_name), btrim(p_number_or_code), coalesce(p_active, true))
    returning id into v_id;
  else
    select to_jsonb(m) into v_old from public.merchant_accounts m where id = p_account_id for update;
    if v_old is null then
      raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
    end if;
    update public.merchant_accounts
       set display_name = btrim(p_display_name), number_or_code = btrim(p_number_or_code),
           active = coalesce(p_active, active), updated_at = now()
     where id = p_account_id
    returning id into v_id;
  end if;
  perform public.audit('SETTING_CHANGED', 'merchant_account', v_id::text,
    jsonb_build_object('from', v_old, 'to', (select to_jsonb(m) from public.merchant_accounts m where id = v_id)));
  return v_id;
end;
$$;

create or replace function public.staff_interests()
returns table (interest_id uuid, name text, slug text, active boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('ADMIN');
  return query select i.id, i.name, i.slug, i.active from public.interests i order by i.active desc, i.name;
end;
$$;

create or replace function public.staff_areas()
returns table (area_id uuid, county text, name text, active boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('ADMIN');
  return query select a.id, a.county, a.name, a.active from public.areas a order by a.active desc, a.county, a.name;
end;
$$;

create or replace function public.staff_save_interest(p_interest_id uuid, p_name text, p_active boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_id  uuid;
  v_slug text := trim(both '-' from regexp_replace(lower(btrim(coalesce(p_name, ''))), '[^a-z0-9]+', '-', 'g'));
begin
  perform public.require_staff('ADMIN');
  if p_interest_id is null then
    insert into public.interests (name, slug, active) values (btrim(p_name), v_slug, coalesce(p_active, true)) returning id into v_id;
  else
    select to_jsonb(i) into v_old from public.interests i where id = p_interest_id for update;
    if v_old is null then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
    update public.interests set name = btrim(p_name), active = coalesce(p_active, active), updated_at = now()
    where id = p_interest_id returning id into v_id;
  end if;
  perform public.audit('SETTING_CHANGED', 'interest', v_id::text,
    jsonb_build_object('from', v_old, 'to', (select to_jsonb(i) from public.interests i where id = v_id)));
  return v_id;
end;
$$;

create or replace function public.staff_save_area(p_area_id uuid, p_county text, p_name text, p_active boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_id  uuid;
begin
  perform public.require_staff('ADMIN');
  if p_area_id is null then
    insert into public.areas (county, name, active) values (btrim(p_county), btrim(p_name), coalesce(p_active, true)) returning id into v_id;
  else
    select to_jsonb(a) into v_old from public.areas a where id = p_area_id for update;
    if v_old is null then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
    update public.areas set county = btrim(p_county), name = btrim(p_name), active = coalesce(p_active, active), updated_at = now()
    where id = p_area_id returning id into v_id;
  end if;
  perform public.audit('SETTING_CHANGED', 'area', v_id::text,
    jsonb_build_object('from', v_old, 'to', (select to_jsonb(a) from public.areas a where id = v_id)));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff (§7: SUPER_ADMIN only). Staff accounts are separate email accounts with TOTP; member accounts
-- never become staff.
-- ---------------------------------------------------------------------------
create or replace function public.staff_list()
returns table (user_id uuid, email text, role public.user_role, status public.account_status, mfa boolean,
               created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('SUPER_ADMIN');
  return query
    select u.id, au.email::text, u.role, u.status,
           exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'),
           u.created_at, au.last_sign_in_at
    from public.users u join auth.users au on au.id = u.id
    where u.role <> 'USER'
    order by u.role desc, au.email;
end;
$$;

-- The second half of creating a staff account: the server created the email account (with the server
-- key, after checking the caller is a SUPER_ADMIN); this gives it its role, as the SUPER_ADMIN, audited.
create or replace function public.staff_register_new(p_user uuid, p_role public.user_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('SUPER_ADMIN');
  if p_role is null or p_role = 'USER' then
    raise exception 'BAD_ROLE' using errcode = '22023';
  end if;
  -- Only a brand-new email account: never a member's account (§7: staff accounts are separate).
  if not exists (select 1 from public.users u join auth.users au on au.id = u.id
                 where u.id = p_user and u.role = 'USER' and u.status = 'PENDING' and au.email is not null and au.phone is null
                   and au.created_at > now() - interval '10 minutes')
     or exists (select 1 from public.profiles where user_id = p_user) then
    raise exception 'NOT_A_NEW_STAFF_ACCOUNT' using errcode = '22023';
  end if;
  update public.users set role = p_role, status = 'ACTIVE' where id = p_user;
  perform public.audit('ADMIN_CREATED', 'user', p_user::text, jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.staff_set_role(p_user uuid, p_role public.user_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.user_role;
begin
  perform public.require_staff('SUPER_ADMIN');
  if p_user = auth.uid() then
    raise exception 'NOT_YOURSELF' using errcode = '22023';
  end if;
  if p_role is null or p_role = 'USER' then
    raise exception 'BAD_ROLE' using errcode = '22023';
  end if;
  select role into v_old from public.users where id = p_user and role <> 'USER' for update;
  if v_old is null then
    raise exception 'STAFF_NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.users set role = p_role where id = p_user;
  perform public.audit('ROLE_CHANGED', 'user', p_user::text, jsonb_build_object('from', v_old, 'to', p_role));
end;
$$;

-- Turning a staff account off (or back on). Off = can't sign in (the status mirrors into Auth).
create or replace function public.staff_set_enabled(p_user uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
begin
  perform public.require_staff('SUPER_ADMIN');
  if p_user = auth.uid() then
    raise exception 'NOT_YOURSELF' using errcode = '22023';
  end if;
  select role into v_role from public.users where id = p_user and role <> 'USER' for update;
  if v_role is null then
    raise exception 'STAFF_NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.users set status = case when p_enabled then 'ACTIVE'::public.account_status else 'BANNED'::public.account_status end
  where id = p_user;
  perform public.audit('ROLE_CHANGED', 'user', p_user::text, jsonb_build_object('role', v_role, 'enabled', p_enabled));
end;
$$;

-- ---------------------------------------------------------------------------
-- Member: delete account (§8: hidden immediately; purged after OD-7) and export (data access).
-- ---------------------------------------------------------------------------
create or replace function public.member_delete_account(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.users where id = p_user and role = 'USER' and status not in ('BANNED', 'DELETED') for update;
  if not found then
    raise exception 'CANNOT_DELETE' using errcode = '22023';
  end if;
  perform public.leave_pool(p_user);
  update public.message_requests set status = 'EXPIRED'
  where status = 'PENDING' and (sender_id = p_user or recipient_id = p_user);
  update public.matches set status = 'UNMATCHED', unmatched_by = p_user, unmatched_at = now()
  where status = 'ACTIVE' and (user_a_id = p_user or user_b_id = p_user);
  update public.conversations c set status = 'CLOSED', closed_reason = 'UNMATCHED', closed_at = now(), closed_by = p_user
  where c.status = 'OPEN' and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = p_user);
  -- BR-7: from here every read function treats the member as gone; Auth refuses their sessions.
  update public.users set status = 'DELETED', deleted_at = now() where id = p_user;
end;
$$;

-- Everything the member gave us or did, without other members' private data, storage paths or
-- moderation notes. Their own messages are included; the other side's are not.
create or replace function public.member_data_export(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'status', u.status, 'created_at', u.created_at,
                                          'phone', au.phone)
                from public.users u join auth.users au on au.id = u.id where u.id = p_user),
    'profile', (select to_jsonb(p) - 'dob_locked' from public.profiles p where p.user_id = p_user),
    'interests', coalesce((select jsonb_agg(i.name order by i.name) from public.user_interests ui
                           join public.interests i on i.id = ui.interest_id where ui.user_id = p_user), '[]'::jsonb),
    'settings', (select jsonb_build_object('casual_message_permission', s.casual_message_permission,
                                           'notification_prefs', s.notification_prefs)
                 from public.user_settings s where s.user_id = p_user),
    'consents', coalesce((select jsonb_agg(jsonb_build_object('document', c.document, 'version', c.version,
                                                              'accepted_at', c.accepted_at) order by c.accepted_at)
                          from public.consents c where c.user_id = p_user), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', ph.id, 'status', ph.status, 'is_primary', ph.is_primary,
                                                            'submitted_at', ph.submitted_at) order by ph.sort_order)
                        from public.profile_photos ph where ph.user_id = p_user), '[]'::jsonb),
    'verifications', coalesce((select jsonb_agg(jsonb_build_object('status', v.status, 'submitted_at', v.submitted_at,
                                                                   'reviewed_at', v.reviewed_at) order by v.created_at)
                               from public.verifications v where v.user_id = p_user), '[]'::jsonb),
    'likes_sent', (select count(*) from public.likes l where l.sender_id = p_user),
    'matches', coalesce((select jsonb_agg(jsonb_build_object('with', public.member_card(case when m.user_a_id = p_user then m.user_b_id else m.user_a_id end) ->> 'display_name',
                                                             'status', m.status, 'created_at', m.created_at) order by m.created_at)
                         from public.matches m where m.user_a_id = p_user or m.user_b_id = p_user), '[]'::jsonb),
    'messages_sent', coalesce((select jsonb_agg(jsonb_build_object('conversation_id', x.conversation_id, 'body', x.body,
                                                                   'created_at', x.created_at) order by x.created_at)
                               from public.messages x where x.sender_id = p_user), '[]'::jsonb),
    'requests_sent', coalesce((select jsonb_agg(jsonb_build_object('body', r.body, 'status',
                                                                   case when r.status = 'DECLINED' then 'EXPIRED' else r.status::text end,
                                                                   'created_at', r.created_at) order by r.created_at)
                               from public.message_requests r where r.sender_id = p_user), '[]'::jsonb),
    'availability', coalesce((select jsonb_agg(jsonb_build_object('start_at', w.start_at, 'end_at', w.end_at) order by w.created_at)
                              from public.availability_windows w where w.user_id = p_user), '[]'::jsonb),
    'blocks', (select count(*) from public.blocks b where b.blocker_id = p_user),
    'reports_filed', coalesce((select jsonb_agg(jsonb_build_object('category', r.category, 'status', r.status,
                                                                   'created_at', r.created_at) order by r.created_at)
                               from public.reports r where r.reporter_id = p_user), '[]'::jsonb),
    'payment_claims', coalesce((select jsonb_agg(jsonb_build_object('provider', c.provider, 'transaction_id', c.transaction_id,
                                                                    'amount', c.amount, 'currency', c.currency, 'status', c.status,
                                                                    'created_at', c.created_at) order by c.created_at)
                                from public.payment_claims c where c.user_id = p_user), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('source', p.source, 'provider', p.provider, 'amount', p.amount,
                                                              'currency', p.currency, 'status', p.status, 'paid_at', p.paid_at)
                                           order by p.paid_at)
                          from public.payments p where p.user_id = p_user), '[]'::jsonb),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('source', s.source, 'status', s.status, 'starts_at', s.starts_at,
                                                                   'expires_at', s.expires_at) order by s.starts_at)
                               from public.subscriptions s where s.user_id = p_user and s.status <> 'PENDING'), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(jsonb_build_object('type', n.type, 'created_at', n.created_at) order by n.created_at)
                               from public.notifications n where n.user_id = p_user), '[]'::jsonb)
  );
$$;

-- OD-7: deleted accounts past the retention period, with the files to remove before the account row
-- goes. Payments, claims, reports and audit rows stay (unlinked). Nothing is due while OD-7 is unset.
create or replace function public.accounts_due_for_purge(p_limit integer default 50)
returns table (user_id uuid, photo_paths text[], selfie_paths text[])
language sql
stable
security definer
set search_path = ''
as $$
  select u.id,
         coalesce((select array_agg(ph.storage_path) from public.profile_photos ph
                   where ph.user_id = u.id and ph.storage_path is not null), '{}'),
         coalesce((select array_agg(v.selfie_storage_path) from public.verifications v
                   where v.user_id = u.id and v.selfie_storage_path is not null), '{}')
  from public.users u
  cross join (select (value #>> '{}')::int as days from public.app_settings
              where key = 'account.deletion_purge_days' and value is not null) r
  where u.status = 'DELETED' and u.role = 'USER' and u.deleted_at < now() - make_interval(days => r.days)
  order by u.deleted_at
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- First step of a purge (OD-7), before the files and the Auth account go: the member's conversations
-- (with their messages) and matches, in an order the cascades can't trip over. The other member
-- already lost them from every list when the account was deleted (BR-7). Refuses unless the account
-- is DELETED and past the retention period.
create or replace function public.purge_account_content(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.accounts_due_for_purge(200) d where d.user_id = p_user) then
    raise exception 'NOT_DUE' using errcode = '22023';
  end if;
  delete from public.conversations c
  where exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = p_user);
  delete from public.matches where user_a_id = p_user or user_b_id = p_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.require_staff(public.user_role) from public, anon, authenticated, service_role;
revoke all on function public.staff_dashboard() from public, anon;
revoke all on function public.staff_users_search(text, public.account_status, text, boolean, boolean, text, integer) from public, anon;
revoke all on function public.staff_user_detail(uuid) from public, anon;
revoke all on function public.staff_correct_dob(uuid, date, text) from public, anon;
revoke all on function public.staff_subscriptions(public.subscription_status, integer) from public, anon;
revoke all on function public.staff_extend_subscription(uuid, integer, text) from public, anon;
revoke all on function public.staff_payments(public.payment_source, public.payment_status, boolean, integer) from public, anon;
revoke all on function public.staff_payment_events(uuid) from public, anon;
revoke all on function public.staff_webhook_log(integer) from public, anon;
revoke all on function public.staff_record_refund(uuid, text) from public, anon;
revoke all on function public.staff_analytics(integer) from public, anon;
revoke all on function public.staff_audit_logs(text, public.audit_action, text, text, timestamptz, timestamptz, timestamptz, integer, uuid) from public, anon;
revoke all on function public.staff_settings() from public, anon;
revoke all on function public.staff_update_setting(text, jsonb) from public, anon;
revoke all on function public.staff_plans() from public, anon;
revoke all on function public.staff_save_plan(uuid, text, text, public.payment_source, integer, numeric, text, boolean, integer) from public, anon;
revoke all on function public.staff_merchant_accounts() from public, anon;
revoke all on function public.staff_save_merchant_account(uuid, public.payment_provider, text, text, boolean) from public, anon;
revoke all on function public.staff_interests() from public, anon;
revoke all on function public.staff_areas() from public, anon;
revoke all on function public.staff_save_interest(uuid, text, boolean) from public, anon;
revoke all on function public.staff_save_area(uuid, text, text, boolean) from public, anon;
revoke all on function public.staff_list() from public, anon;
revoke all on function public.staff_register_new(uuid, public.user_role) from public, anon;
revoke all on function public.staff_set_role(uuid, public.user_role) from public, anon;
revoke all on function public.staff_set_enabled(uuid, boolean) from public, anon;
revoke all on function public.member_delete_account(uuid) from public, anon, authenticated;
revoke all on function public.member_data_export(uuid) from public, anon, authenticated;
revoke all on function public.accounts_due_for_purge(integer) from public, anon, authenticated;
revoke all on function public.purge_account_content(uuid) from public, anon, authenticated;

-- Staff functions: the staff member's own session (role + MFA checked inside). Not the server key.
revoke all on function public.staff_dashboard() from service_role;
revoke all on function public.staff_users_search(text, public.account_status, text, boolean, boolean, text, integer) from service_role;
revoke all on function public.staff_user_detail(uuid) from service_role;
revoke all on function public.staff_correct_dob(uuid, date, text) from service_role;
revoke all on function public.staff_subscriptions(public.subscription_status, integer) from service_role;
revoke all on function public.staff_extend_subscription(uuid, integer, text) from service_role;
revoke all on function public.staff_payments(public.payment_source, public.payment_status, boolean, integer) from service_role;
revoke all on function public.staff_payment_events(uuid) from service_role;
revoke all on function public.staff_webhook_log(integer) from service_role;
revoke all on function public.staff_record_refund(uuid, text) from service_role;
revoke all on function public.staff_analytics(integer) from service_role;
revoke all on function public.staff_audit_logs(text, public.audit_action, text, text, timestamptz, timestamptz, timestamptz, integer, uuid) from service_role;
revoke all on function public.staff_settings() from service_role;
revoke all on function public.staff_update_setting(text, jsonb) from service_role;
revoke all on function public.staff_plans() from service_role;
revoke all on function public.staff_save_plan(uuid, text, text, public.payment_source, integer, numeric, text, boolean, integer) from service_role;
revoke all on function public.staff_merchant_accounts() from service_role;
revoke all on function public.staff_save_merchant_account(uuid, public.payment_provider, text, text, boolean) from service_role;
revoke all on function public.staff_interests() from service_role;
revoke all on function public.staff_areas() from service_role;
revoke all on function public.staff_save_interest(uuid, text, boolean) from service_role;
revoke all on function public.staff_save_area(uuid, text, text, boolean) from service_role;
revoke all on function public.staff_list() from service_role;
revoke all on function public.staff_register_new(uuid, public.user_role) from service_role;
revoke all on function public.staff_set_role(uuid, public.user_role) from service_role;
revoke all on function public.staff_set_enabled(uuid, boolean) from service_role;

grant execute on function public.staff_dashboard() to authenticated;
grant execute on function public.staff_users_search(text, public.account_status, text, boolean, boolean, text, integer) to authenticated;
grant execute on function public.staff_user_detail(uuid) to authenticated;
grant execute on function public.staff_correct_dob(uuid, date, text) to authenticated;
grant execute on function public.staff_subscriptions(public.subscription_status, integer) to authenticated;
grant execute on function public.staff_extend_subscription(uuid, integer, text) to authenticated;
grant execute on function public.staff_payments(public.payment_source, public.payment_status, boolean, integer) to authenticated;
grant execute on function public.staff_payment_events(uuid) to authenticated;
grant execute on function public.staff_webhook_log(integer) to authenticated;
grant execute on function public.staff_record_refund(uuid, text) to authenticated;
grant execute on function public.staff_analytics(integer) to authenticated;
grant execute on function public.staff_audit_logs(text, public.audit_action, text, text, timestamptz, timestamptz, timestamptz, integer, uuid) to authenticated;
grant execute on function public.staff_settings() to authenticated;
grant execute on function public.staff_update_setting(text, jsonb) to authenticated;
grant execute on function public.staff_plans() to authenticated;
grant execute on function public.staff_save_plan(uuid, text, text, public.payment_source, integer, numeric, text, boolean, integer) to authenticated;
grant execute on function public.staff_merchant_accounts() to authenticated;
grant execute on function public.staff_save_merchant_account(uuid, public.payment_provider, text, text, boolean) to authenticated;
grant execute on function public.staff_interests() to authenticated;
grant execute on function public.staff_areas() to authenticated;
grant execute on function public.staff_save_interest(uuid, text, boolean) to authenticated;
grant execute on function public.staff_save_area(uuid, text, text, boolean) to authenticated;
grant execute on function public.staff_list() to authenticated;
grant execute on function public.staff_register_new(uuid, public.user_role) to authenticated;
grant execute on function public.staff_set_role(uuid, public.user_role) to authenticated;
grant execute on function public.staff_set_enabled(uuid, boolean) to authenticated;

grant execute on function public.member_delete_account(uuid) to service_role;
grant execute on function public.member_data_export(uuid) to service_role;
grant execute on function public.accounts_due_for_purge(integer) to service_role;
grant execute on function public.purge_account_content(uuid) to service_role;
