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
  add column super_admin_only boolean not null default false,
  add column min_value integer,
  add column max_value integer;
alter type public.audit_action add value if not exists 'STAFF_PASSWORD_CHANGED';
update public.app_settings set kind = 'bool' where key in ('card.allow_during_mobile_money_pass');
update public.app_settings set kind = 'object' where key in ('claims.transaction_id_patterns', 'detection.terms');
update public.app_settings set kind = 'array' where key in ('verification.pose_prompts');
update public.app_settings set kind = 'enum', allowed = '["SIGNUP_ONLY", "EVERY_SESSION"]'::jsonb where key = 'geo.enforcement_mode';
update public.app_settings set super_admin_only = true
where key in ('geo.enforcement_mode', 'photos.min_required', 'otp.max_per_phone_per_hour', 'otp.max_per_ip_per_hour',
              'staff_login.max_per_ip_per_hour', 'staff_login.max_per_account_per_hour',
              'staff_login.max_per_account_all_ips_per_hour', 'account.deletion_purge_days',
              -- Access-granting limits: an ADMIN can't widen their own extension cap or the card grace.
              'subscriptions.manual_extension_max_days', 'card.grace_hours');
-- Every number setting is a count, length or limit: 0 would switch a feature off for everyone.
update public.app_settings set min_value = 1 where kind = 'int';
-- Zero is a real choice for these: no cool-down, no grace period.
update public.app_settings set min_value = 0
where key in ('relationship.pass_cooldown_days', 'requests.decline_cooldown_days', 'card.grace_hours');
update public.app_settings set max_value = 30 where key = 'subscriptions.manual_extension_max_days';
update public.app_settings set max_value = 168 where key = 'card.grace_hours';
update public.app_settings set min_value = 3, max_value = 12 where key in ('photos.min_required', 'photos.max_per_user');

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
                 where p.user_id = p_user and u.role = 'USER' and u.status <> 'DELETED') then
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
-- access: only a running mobile money pass can be extended, capped in total per subscription.
-- ---------------------------------------------------------------------------
create or replace function public.staff_subscriptions(p_status public.subscription_status default null, p_limit integer default 100,
                                                      p_id uuid default null)
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
    where (p_status is null or s.status = p_status) and s.status <> 'PENDING' and (p_id is null or s.id = p_id)
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
  -- A card period belongs to the processor: its next renewal or failure would undo the change.
  if v_sub.source = 'CARD' then
    raise exception 'CARD_EXTEND_AT_PROCESSOR' using errcode = '22023';
  end if;
  if (select status from public.users where id = v_sub.user_id) in ('BANNED', 'DELETED') then
    raise exception 'MEMBER_NOT_AVAILABLE' using errcode = '22023';
  end if;
  -- BR-28: with a pass stacked behind this one the added days would overlap it; extend the last one.
  if exists (select 1 from public.subscriptions s where s.user_id = v_sub.user_id and s.id <> v_sub.id
             and s.source = 'MOBILE_MONEY'
             and s.status in ('ACTIVE', 'CANCELLED', 'PAYMENT_FAILED') and s.expires_at > v_sub.expires_at) then
    raise exception 'EXTEND_LAST_PASS' using errcode = '22023';
  end if;
  -- OD-30 caps the total added to one subscription, not each click.
  if p_days + coalesce((select sum((l.metadata ->> 'days')::int) from public.audit_logs l
                        where l.action = 'SUBSCRIPTION_MODIFIED' and l.entity_id = v_sub.id::text), 0)
     > (public.get_setting('subscriptions.manual_extension_max_days'))::int then
    raise exception 'EXTENSION_OUT_OF_RANGE' using errcode = '22023';
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
                                                 p_limit integer default 100,
                                                 p_id uuid default null)
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
        and (p_id is null or pay.id = p_id)
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
-- paid for ends. For a card, the server then stops renewals at the processor (card_stops_due).
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
      (select count(*) from public.payments p where p.source = 'MOBILE_MONEY' and p.status = 'SUCCEEDED' and p.paid_at::date = d::date),
      (select count(*) from public.payments p where p.source = 'CARD' and p.status = 'SUCCEEDED' and p.paid_at::date = d::date),
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
               updated_at timestamptz, updated_by text, min_value integer, max_value integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('ADMIN');
  return query
    select s.key, s.value, s.description, s.kind, s.allowed, s.super_admin_only, s.updated_at, au.email::text,
           s.min_value, s.max_value
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
                    and (p_value #>> '{}')::numeric between coalesce(v_row.min_value, 0) and coalesce(v_row.max_value, 1000000)
    when 'bool' then jsonb_typeof(p_value) = 'boolean'
    when 'object' then jsonb_typeof(p_value) = 'object'
    when 'array' then jsonb_typeof(p_value) = 'array' and jsonb_array_length(p_value) > 0
    when 'enum' then jsonb_typeof(p_value) = 'string' and v_row.allowed ? (p_value #>> '{}')
    else false
  end;
  -- Contents, not just shape, for the settings code depends on.
  if coalesce(v_ok, false) and v_row.kind = 'array' then
    v_ok := not exists (select 1 from jsonb_array_elements(p_value) e
                        where jsonb_typeof(e) <> 'string' or length(btrim(e #>> '{}')) not between 3 and 200);
  end if;
  if coalesce(v_ok, false) and p_key = 'claims.transaction_id_patterns' then
    v_ok := (select array_agg(k order by k) from jsonb_object_keys(p_value) k) = array['MTN_MOMO', 'ORANGE_MONEY']
            and not exists (select 1 from jsonb_each(p_value) e
                            where jsonb_typeof(e.value) <> 'string' or length(e.value #>> '{}') not between 2 and 200);
    if v_ok then
      begin
        perform 'probe' ~ (e.value #>> '{}') from jsonb_each(p_value) e;
      exception when others then
        v_ok := false;
      end;
    end if;
  end if;
  if coalesce(v_ok, false) and p_key = 'detection.terms' then
    v_ok := (v_row.value is null or (select array_agg(k order by k) from jsonb_object_keys(p_value) k)
                                    = (select array_agg(k order by k) from jsonb_object_keys(v_row.value) k))
            and not exists (select 1 from jsonb_each(p_value) e where jsonb_typeof(e.value) <> 'array')
            and not exists (select 1 from jsonb_each(p_value) e, jsonb_array_elements(e.value) t
                            where jsonb_typeof(t) <> 'string' or length(btrim(t #>> '{}')) not between 1 and 60);
  end if;
  -- Members must be able to upload at least the photos onboarding requires.
  if coalesce(v_ok, false) and p_key in ('photos.min_required', 'photos.max_per_user') then
    v_ok := (case when p_key = 'photos.min_required' then (p_value #>> '{}')::int
                  else (select (value #>> '{}')::int from public.app_settings where key = 'photos.min_required') end)
            <= (case when p_key = 'photos.max_per_user' then (p_value #>> '{}')::int
                     else (select (value #>> '{}')::int from public.app_settings where key = 'photos.max_per_user') end);
  end if;
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
  -- Card checkouts charge the processor's price: a card plan needs its price ID, and a new price needs a
  -- new price ID (created at the processor first).
  if coalesce((select source from public.subscription_plans where id = p_plan_id), p_source) = 'CARD'
     and nullif(btrim(coalesce(p_processor_price_id, '')), '') is null then
    raise exception 'PRICE_ID_REQUIRED' using errcode = '22023';
  end if;
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
    if v_old ->> 'source' = 'CARD' and (v_old ->> 'price')::numeric <> p_price
       and coalesce(v_old ->> 'processor_price_id', '') = btrim(coalesce(p_processor_price_id, '')) then
      raise exception 'PRICE_ID_REQUIRED' using errcode = '22023';
    end if;
    -- A plan's length is what members paid for (claims waiting and running card periods use it):
    -- once used it doesn't change; add a new plan instead.
    if (v_old ->> 'duration_hours')::int <> p_duration_hours
       and (exists (select 1 from public.subscriptions where plan_id = p_plan_id)
            or exists (select 1 from public.payment_claims where plan_id = p_plan_id)) then
      raise exception 'PLAN_IN_USE' using errcode = '22023';
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
  -- A card checkout still open can't start a plan on a deleted account: if it is paid anyway, the
  -- charge goes to the refund list and renewals are stopped (Phase 7b closed-checkout path).
  perform set_config('wk.card_event', 'on', true);
  update public.subscriptions set status = 'EXPIRED', updated_at = now() where user_id = p_user and status = 'PENDING';
  perform set_config('wk.card_event', 'off', true);
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
    -- BR-7: no name for a member who has since been deleted or banned.
    'matches', coalesce((select jsonb_agg(jsonb_build_object('with', case when o.status in ('DELETED', 'BANNED') then null else op.display_name end,
                                                             'status', m.status, 'created_at', m.created_at) order by m.created_at)
                         from public.matches m
                         join public.users o on o.id = case when m.user_a_id = p_user then m.user_b_id else m.user_a_id end
                         left join public.profiles op on op.user_id = o.id
                         where m.user_a_id = p_user or m.user_b_id = p_user), '[]'::jsonb),
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
-- goes. Payments, claims, payment events, reports (about and by the member) and audit rows stay,
-- unlinked. Nothing is due while OD-7 is unset.
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
  -- A member who deleted and was then banned (Q54) is purged too; the phone blocklist entry stays.
  where u.status in ('DELETED', 'BANNED') and u.deleted_at is not null and u.role = 'USER'
    and u.deleted_at < now() - make_interval(days => r.days)
    -- Open reports against the member are decided first (staff may still ban the account).
    and not exists (select 1 from public.reports rp where rp.reported_user_id = u.id and rp.status = 'OPEN')
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

-- Reports outlive a purged account (unlinked), so the history and staff notes are kept.
alter table public.reports alter column reported_user_id drop not null;
alter table public.reports drop constraint reports_reported_user_id_fkey,
  add constraint reports_reported_user_id_fkey foreign key (reported_user_id) references public.users(id) on delete set null;

-- Closed reports about a purged account stay visible to staff (member shown as deleted).
create or replace function public.staff_reports_queue(p_include_closed boolean DEFAULT false, p_limit integer DEFAULT 100, p_member uuid DEFAULT NULL::uuid)
 RETURNS TABLE(report_id uuid, reported_user_id uuid, category report_category, priority report_priority, status report_status, created_at timestamp with time zone, target_hidden text, reporters_24h bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_staff('MODERATOR') then
    raise exception 'NOT_STAFF' using errcode = '42501';
  end if;
  return query
    select r.id, r.reported_user_id, r.category, r.priority, r.status, r.created_at, u.hidden_reason,
           (select count(distinct x.reporter_id) from public.reports x
            where x.reported_user_id = r.reported_user_id and x.status = 'OPEN'
              and x.created_at > now() - interval '24 hours')
    from public.reports r
    left join public.users u on u.id = r.reported_user_id
    where (p_include_closed or r.status = 'OPEN')
      and (p_member is null or r.reported_user_id = p_member)
    order by (r.status = 'OPEN') desc, r.priority, r.created_at
    limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$function$;

create or replace function public.staff_report_detail(p_report_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v jsonb;
begin
  if not public.is_staff('MODERATOR') then
    raise exception 'NOT_STAFF' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'report_id', r.id,
    'category', r.category,
    'priority', r.priority,
    'status', r.status,
    'description', r.description,
    'photo_id', r.photo_id,
    'created_at', r.created_at,
    'from_conversation', r.conversation_id is not null
                         or exists (select 1 from public.report_messages rm where rm.report_id = r.id),
    'captured_messages', (select count(*) from public.report_messages rm where rm.report_id = r.id),
    'reported_user_id', r.reported_user_id,
    'display_name', p.display_name,
    'age', public.age_in_years(p.date_of_birth),
    'account_status', public.effective_account_status(u.status, u.suspended_until),
    'stored_status', u.status,
    'suspended_until', case when u.suspended_until > now() then u.suspended_until end,
    'hidden_reason', u.hidden_reason,
    'verification', public.latest_verification_status(u.id),
    'reporters_24h', (select count(distinct x.reporter_id) from public.reports x
                      where x.reported_user_id = r.reported_user_id and x.status = 'OPEN'
                        and x.created_at > now() - interval '24 hours'),
    'other_reports', coalesce((select jsonb_agg(jsonb_build_object('category', o.category, 'status', o.status, 'created_at', o.created_at)
                                                order by o.created_at desc)
                               from public.reports o where o.reported_user_id = r.reported_user_id and o.id <> r.id), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('note', n.note, 'created_at', n.created_at,
                                                           'mine', n.author_id = auth.uid()) order by n.created_at)
                       from public.report_notes n where n.report_id = r.id), '[]'::jsonb)
  ) into v
  from public.reports r
  left join public.users u on u.id = r.reported_user_id
  left join public.profiles p on p.user_id = r.reported_user_id
  where r.id = p_report_id;
  return v;
end;
$function$;

-- A ban also reaches an account its owner deleted before staff decided its reports (otherwise deleting
-- would dodge the phone blocklist). Same as Phase 5 otherwise.
create or replace function public.ban_user(p_target uuid, p_reason text, p_report_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
begin
  if not public.is_staff('ADMIN') then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  perform public.assert_staff_target(p_target);
  if p_reason is null or p_reason !~ '^[A-Z_]{3,40}$' then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  update public.users set status = 'BANNED', suspended_until = null
  where id = p_target and status in ('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED');
  if not found then
    raise exception 'ACCOUNT_NOT_BANNABLE' using errcode = '22023';
  end if;
  select nullif(phone, '') into v_phone from auth.users where id = p_target;
  if v_phone is not null then
    insert into public.phone_blocklist (phone_hash, reason, created_by)
    values (public.phone_hash(v_phone), p_reason, auth.uid())
    on conflict (phone_hash) do nothing;
  end if;
  perform public.audit('USER_BANNED', 'user', p_target::text,
    jsonb_strip_nulls(jsonb_build_object('reason', p_reason, 'report_id', public.report_about(p_report_id, p_target))));
end;
$$;

-- Lifting a ban on an account its owner had deleted returns it to DELETED (never back to life).
create or replace function public.restore_user(p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was   public.account_status;
  v_until timestamptz;
  v_phone text;
begin
  if not public.is_staff('ADMIN') then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  perform public.assert_staff_target(p_target);
  select public.effective_account_status(status, suspended_until), suspended_until into v_was, v_until
  from public.users where id = p_target for update;
  if (select status from public.users where id = p_target) = 'BANNED' then
    select nullif(phone, '') into v_phone from auth.users where id = p_target;
    if v_phone is not null then
      delete from public.phone_blocklist where phone_hash = public.phone_hash(v_phone);
    end if;
    if (select deleted_at from public.users where id = p_target) is not null then
      update public.users set status = 'DELETED', suspended_until = null where id = p_target;
    else
      update public.users set status = 'PENDING', suspended_until = null where id = p_target;
      perform public.recompute_account_state(p_target);
    end if;
  elsif exists (select 1 from public.users where id = p_target and suspended_until > now()) then
    update public.users set suspended_until = null,
                            status = case when status = 'SUSPENDED' then 'ACTIVE' else status end
    where id = p_target;
  else
    raise exception 'NOTHING_TO_RESTORE' using errcode = '22023';
  end if;
  perform public.audit('USER_RESTORED', 'user', p_target::text,
    jsonb_strip_nulls(jsonb_build_object('from', v_was, 'suspended_until', case when v_until > now() then v_until end)));
end;
$$;

-- BR-7: a deleted member no longer appears in anyone's blocked list.
create or replace function public.member_blocked_list(p_user_id uuid)
returns table (user_id uuid, display_name text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.blocked_id, p.display_name, b.created_at
  from public.blocks b
  join public.users u on u.id = b.blocked_id and u.status <> 'DELETED'
  left join public.profiles p on p.user_id = b.blocked_id
  where b.blocker_id = p_user_id
  order by b.created_at desc;
$$;

-- A card checkout paid, or a renewal charged, after the account was deleted or banned gives no access:
-- the charge goes on the refund list (ACCOUNT_CLOSED) and renewals stop. Otherwise unchanged from 7b.
create or replace function public.card_event_transition(p_processor text, p_event jsonb, p_at timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_type    text := p_event ->> 'type';
  v_sub     public.subscriptions;
  v_plan    public.subscription_plans;
  v_ref     uuid;
  v_end     timestamptz;
  v_payment uuid;
  v_status  public.subscription_status;
  v_charge  public.payments;
  v_problem text;
  v_dispute text;
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
    if v_sub.status not in ('PENDING', 'EXPIRED') then
      raise exception 'CHECKOUT_NOT_PENDING' using errcode = '22023';
    end if;
    if coalesce(p_event ->> 'subscription_ref', '') = '' then
      raise exception 'SUBSCRIPTION_REF_REQUIRED' using errcode = '22023';
    end if;
    select * into v_plan from public.subscription_plans where id = v_sub.plan_id;
    v_end := (p_event ->> 'period_end')::timestamptz;
    if v_end is null or v_end <= p_at then
      raise exception 'BAD_PERIOD_END' using errcode = '22023';
    end if;
    -- Never more than the plan's period (a day's slack for processor billing anchors).
    v_end := least(v_end, p_at + make_interval(hours => v_plan.duration_hours) + interval '1 day');
    perform 1 from public.users where id = v_sub.user_id for update;
    v_sub.processor_subscription_id := p_event ->> 'subscription_ref';
    v_payment := public.record_card_charge(v_sub, p_event, p_at);
    if v_payment is null then
      raise exception 'CHARGE_ALREADY_RECORDED' using errcode = '22023';
    end if;
    if coalesce(p_event ->> 'customer_ref', '') <> '' then
      insert into public.card_customers (user_id, processor, customer_ref)
      values (v_sub.user_id, p_processor, p_event ->> 'customer_ref')
      on conflict (user_id) do update set processor = excluded.processor, customer_ref = excluded.customer_ref;
    end if;
    -- A paid checkout is activated unless that would break a rule checked when it started: the amount
    -- is the plan price, one card subscription at a time (a second paid checkout), OD-19.
    v_problem := case
      when exists (select 1 from public.users u where u.id = v_sub.user_id and u.status in ('DELETED', 'BANNED')) then 'ACCOUNT_CLOSED'
      when (p_event ->> 'amount')::numeric <> coalesce(v_sub.locked_price, v_plan.price) then 'AMOUNT_MISMATCH'
      when public.has_active_card_subscription(v_sub.user_id) then 'CARD_SUBSCRIPTION_ACTIVE'
      when public.has_active_mobile_money_pass(v_sub.user_id)
           and not (public.get_setting('card.allow_during_mobile_money_pass'))::boolean then 'MOBILE_MONEY_PASS_ACTIVE'
    end;
    if v_problem is not null then
      update public.subscriptions
         set status = 'REFUNDED', processor_subscription_id = v_sub.processor_subscription_id, source_payment_id = v_payment,
             auto_renew = false, cancel_at_period_end = true, last_event_at = p_at, updated_at = now()
       where id = v_sub.id;
      perform public.card_needs_refund(v_sub, v_payment, v_problem);
      return 'NEEDS_REFUND';
    end if;
    update public.subscriptions
       set status = 'ACTIVE', starts_at = least(p_at, now()), expires_at = v_end, period_end = v_end,
           processor_subscription_id = v_sub.processor_subscription_id, source_payment_id = v_payment,
           auto_renew = true, cancel_at_period_end = false, last_event_at = p_at, updated_at = now()
     where id = v_sub.id;
    return 'ACTIVATED';
  end if;

  if coalesce(p_event ->> 'subscription_ref', '') = '' then
    raise exception 'SUBSCRIPTION_REF_REQUIRED' using errcode = '22023';
  end if;
  select * into v_sub from public.subscriptions
  where processor = p_processor and processor_subscription_id = p_event ->> 'subscription_ref'
  for update;
  if not found then
    perform public.card_not_yet_known('UNKNOWN_SUBSCRIPTION', p_at);
  end if;
  select * into v_plan from public.subscription_plans where id = v_sub.plan_id;

  -- Money events apply whatever their order; state events older than the last one applied are stale.
  -- CANCEL_SCHEDULED and SUBSCRIPTION_ENDED only ever move one way, so they are never stale. Dispute events
  -- are ordered only against other dispute events.
  if v_type = 'RENEWAL_FAILED' and v_sub.last_event_at is not null and p_at < v_sub.last_event_at then
    return 'IGNORED_STALE';
  end if;
  if v_type in ('DISPUTE_OPENED', 'DISPUTE_CLOSED') then
    v_dispute := nullif(p_event ->> 'dispute_id', '');
    if v_dispute is null or length(v_dispute) > 200 then
      raise exception 'DISPUTE_ID_REQUIRED' using errcode = '22023';
    end if;
  end if;

  if v_type = 'RENEWAL_SUCCEEDED' then
    v_end := (p_event ->> 'period_end')::timestamptz;
    if v_end is null or v_end <= p_at then
      raise exception 'BAD_PERIOD_END' using errcode = '22023';
    end if;
    -- One period past the paid period end (or the charge, if later), with a day's slack.
    v_end := least(v_end, greatest(p_at, coalesce(v_sub.period_end, p_at))
                          + make_interval(hours => v_plan.duration_hours) + interval '1 day');
    v_payment := public.record_card_charge(v_sub, p_event, p_at);
    if v_payment is null then
      return 'IGNORED_CHARGE_RECORDED';
    end if;
    -- A charge on a subscription that ended (refunded, not activated) or for the wrong amount: kept on
    -- record for a refund, no access, renewals cancelled.
    v_problem := case
      when v_sub.status = 'REFUNDED' then 'SUBSCRIPTION_REFUNDED'
      when exists (select 1 from public.users u where u.id = v_sub.user_id and u.status in ('DELETED', 'BANNED')) then 'ACCOUNT_CLOSED'
      when (p_event ->> 'amount')::numeric <> coalesce(v_sub.locked_price, v_plan.price) then 'AMOUNT_MISMATCH'
    end;
    if v_problem is not null then
      update public.subscriptions
         set status = case when status in ('ACTIVE', 'PAYMENT_FAILED') then 'CANCELLED'::public.subscription_status
                           else status end,
             auto_renew = false, cancel_at_period_end = true, updated_at = now()
       where id = v_sub.id;
      perform public.card_needs_refund(v_sub, v_payment, v_problem);
      return 'NEEDS_REFUND';
    end if;
    -- A late charge for a period already covered (e.g. delivered after a later failure): record only.
    if v_sub.period_end is not null and (p_event ->> 'period_end')::timestamptz <= v_sub.period_end then
      return 'CHARGE_RECORDED';
    end if;
    v_status := case when v_sub.status = 'SUSPENDED' then v_sub.status
                     when v_sub.cancel_at_period_end then 'CANCELLED'
                     else 'ACTIVE' end;
    update public.subscriptions
       set status = v_status, period_end = v_end, expires_at = v_end, grace_for_period_end = null,
           last_event_at = greatest(p_at, coalesce(last_event_at, p_at)), updated_at = now()
     where id = v_sub.id;
    return 'RENEWED';
  end if;

  if v_type = 'RENEWAL_FAILED' then
    -- BR-40 / OD-20: access continues for the grace period, counted from the failure (not before the paid
    -- period ends). One grace period per paid period: later failed retries never add another.
    if v_sub.grace_for_period_end is not distinct from v_sub.period_end then
      return 'IGNORED_GRACE_USED';
    end if;
    if v_sub.status = 'ACTIVE' or (v_sub.status = 'EXPIRED' and v_sub.auto_renew and not v_sub.cancel_at_period_end) then
      update public.subscriptions
         set status = 'PAYMENT_FAILED',
             expires_at = greatest(coalesce(period_end, expires_at), p_at)
                          + make_interval(hours => (public.get_setting('card.grace_hours'))::int),
             grace_for_period_end = period_end,
             last_event_at = p_at, updated_at = now()
       where id = v_sub.id;
      return 'PAYMENT_FAILED';
    end if;
    update public.subscriptions set last_event_at = greatest(p_at, coalesce(last_event_at, p_at)) where id = v_sub.id;
    return 'IGNORED_STATE';
  end if;

  if v_type = 'CANCEL_SCHEDULED' then
    update public.subscriptions
       set status = case when status in ('ACTIVE', 'PAYMENT_FAILED') then 'CANCELLED'::public.subscription_status
                         else status end,
           cancel_at_period_end = true, auto_renew = false,
           last_event_at = greatest(p_at, coalesce(last_event_at, p_at)), updated_at = now()
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
           auto_renew = false, cancel_at_period_end = true,
           last_event_at = greatest(p_at, coalesce(last_event_at, p_at)), updated_at = now()
     where id = v_sub.id;
    return 'ENDED';
  end if;

  if v_type = 'DISPUTE_OPENED' then
    -- §16: SUSPENDED by a processor dispute; access stops until every open dispute is settled.
    if v_dispute = any (v_sub.open_disputes) or v_dispute = any (v_sub.closed_disputes) then
      return 'IGNORED_STATE'; -- already open, or its "closed" arrived first
    end if;
    update public.subscriptions
       set open_disputes = array_append(open_disputes, v_dispute),
           status = case when status in ('ACTIVE', 'CANCELLED', 'PAYMENT_FAILED', 'EXPIRED')
                         then 'SUSPENDED'::public.subscription_status else status end,
           updated_at = now()
     where id = v_sub.id
    returning * into v_sub;
    return case when v_sub.status = 'SUSPENDED' then 'SUSPENDED' else 'IGNORED_STATE' end;
  end if;

  if v_type = 'DISPUTE_CLOSED' then
    if v_dispute = any (v_sub.closed_disputes) then
      return 'IGNORED_STATE';
    end if;
    update public.subscriptions
       set open_disputes = array_remove(open_disputes, v_dispute),
           closed_disputes = array_append(closed_disputes, v_dispute), updated_at = now()
     where id = v_sub.id
    returning * into v_sub;
    if (p_event ->> 'won')::boolean then
      if v_sub.status = 'SUSPENDED' and cardinality(v_sub.open_disputes) = 0 then
        perform public.card_restore_after_dispute(v_sub.id);
        return 'RESTORED';
      end if;
      return 'IGNORED_STATE';
    end if;
    v_type := 'REFUNDED'; -- a lost dispute returns the money, whatever the current state: a refund below
  end if;

  if v_type = 'REFUNDED' then
    -- Refunds are new events, not edits (§16): the payment's status changes and the trigger logs it.
    select * into v_charge from public.payments
    where transaction_key = 'CARD:' || p_processor || ':' || coalesce(p_event ->> 'charge_id', '')
      and processor_subscription_ref = v_sub.processor_subscription_id
    for update;
    if not found then
      perform public.card_not_yet_known('UNKNOWN_CHARGE', p_at);
    end if;
    if v_charge.status <> 'REFUNDED' then
      update public.payments set status = 'REFUNDED' where id = v_charge.id;
    end if;
    -- Access ends when the refunded charge paid for the current period (the latest charge).
    if v_charge.paid_at >= (select max(p.paid_at) from public.payments p
                            where p.source = 'CARD' and p.processor_subscription_ref = v_sub.processor_subscription_id
                              and p.transaction_key like 'CARD:' || p_processor || ':%') then
      update public.subscriptions
         set status = 'REFUNDED', auto_renew = false, cancel_at_period_end = true, updated_at = now()
       where id = v_sub.id;
      return 'REFUNDED';
    end if;
    -- An earlier charge: the current period stays paid. A suspension ends once no dispute is open.
    if v_sub.status = 'SUSPENDED' and cardinality(v_sub.open_disputes) = 0 then
      perform public.card_restore_after_dispute(v_sub.id);
    end if;
    return 'REFUNDED_EARLIER_CHARGE';
  end if;

  raise exception 'UNKNOWN_EVENT_TYPE' using errcode = '22023';
end;
$function$;

-- Card renewals must stop for an account that is deleted or banned, whatever the subscription's state.
create or replace function public.card_cancel_needed(p_processor text, p_ref text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_ref, '') <> '' and exists (
    select 1 from public.subscriptions s
    where s.processor = p_processor and s.processor_subscription_id = p_ref
      and s.processor_cancelled_at is null
      and (s.status = 'REFUNDED'
           or exists (select 1 from public.users u where u.id = s.user_id and u.status in ('DELETED', 'BANNED'))
           or exists (select 1 from public.payment_events e
                      where e.type = 'CARD_NEEDS_REFUND' and e.processor = p_processor
                        and e.raw_payload ->> 'subscription_ref' = p_ref))
  );
$$;

-- The member's processor subscriptions whose renewals we haven't stopped: all of them (before an
-- account is deleted), or only those card_cancel_needed() asks for (after a refund is recorded).
create or replace function public.card_stops_due(p_user uuid, p_all boolean default false)
returns table (processor text, processor_subscription_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct s.processor, s.processor_subscription_id
  from public.subscriptions s
  where s.user_id = p_user and s.source = 'CARD' and s.processor_subscription_id is not null
    and s.processor_cancelled_at is null
    -- "All" means every plan that could still renew; ended or refunded ones are left alone, so an
    -- old subscription the processor already closed never blocks deleting an account.
    and ((p_all and s.auto_renew and not s.cancel_at_period_end and s.status not in ('PENDING', 'REFUNDED'))
         or public.card_cancel_needed(s.processor, s.processor_subscription_id));
$$;

-- Your account: a staff password change is recorded (§22: sensitive staff actions audited).
create or replace function public.staff_log_password_change()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff('MODERATOR');
  perform public.audit('STAFF_PASSWORD_CHANGED', 'user', auth.uid()::text, '{}'::jsonb);
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
revoke all on function public.staff_subscriptions(public.subscription_status, integer, uuid) from public, anon;
revoke all on function public.staff_extend_subscription(uuid, integer, text) from public, anon;
revoke all on function public.staff_payments(public.payment_source, public.payment_status, boolean, integer, uuid) from public, anon;
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
revoke all on function public.card_stops_due(uuid, boolean) from public, anon, authenticated;
revoke all on function public.staff_log_password_change() from public, anon, service_role;
grant execute on function public.staff_log_password_change() to authenticated;
grant execute on function public.card_stops_due(uuid, boolean) to service_role;
revoke all on function public.purge_account_content(uuid) from public, anon, authenticated;

-- Staff functions: the staff member's own session (role + MFA checked inside). Not the server key.
revoke all on function public.staff_dashboard() from service_role;
revoke all on function public.staff_users_search(text, public.account_status, text, boolean, boolean, text, integer) from service_role;
revoke all on function public.staff_user_detail(uuid) from service_role;
revoke all on function public.staff_correct_dob(uuid, date, text) from service_role;
revoke all on function public.staff_subscriptions(public.subscription_status, integer, uuid) from service_role;
revoke all on function public.staff_extend_subscription(uuid, integer, text) from service_role;
revoke all on function public.staff_payments(public.payment_source, public.payment_status, boolean, integer, uuid) from service_role;
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
grant execute on function public.staff_subscriptions(public.subscription_status, integer, uuid) to authenticated;
grant execute on function public.staff_extend_subscription(uuid, integer, text) to authenticated;
grant execute on function public.staff_payments(public.payment_source, public.payment_status, boolean, integer, uuid) to authenticated;
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
