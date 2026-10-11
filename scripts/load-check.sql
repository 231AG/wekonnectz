-- Phase 12 load sanity (plan: "load sanity on discovery queries"). Local only: creates 3,000 fictional
-- members inside a transaction, times Discover and Available Now for one viewer, then rolls back.
-- Run: docker exec -i supabase_db_wekonnectz psql -U postgres -f - < scripts/load-check.sql
begin;
set local client_min_messages = warning;

insert into auth.users (id, phone, aud, role)
select ('ffffffff-ffff-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid, '23177' || lpad(n::text, 7, '0'), 'authenticated', 'authenticated'
from generate_series(1, 3000) n;

insert into public.profiles (user_id, date_of_birth, display_name, gender, seeking_genders, area_id, intent_relationship, intent_casual, is_profile_complete)
select ('ffffffff-ffff-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid, date '1990-01-01' + (n % 3000),
       'Member ' || n, case when n % 2 = 0 then 'WOMAN' else 'MAN' end::public.gender,
       array[case when n % 2 = 0 then 'MAN' else 'WOMAN' end]::public.gender[],
       (select id from public.areas order by id offset (n % 10) limit 1), true, true, true
from generate_series(1, 3000) n;

insert into public.profile_photos (user_id, status, storage_path, sort_order, is_primary, reviewed_as_primary, submitted_at)
select ('ffffffff-ffff-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid, 'APPROVED', gen_random_uuid() || '.webp', k, k = 0, k = 0, now()
from generate_series(1, 3000) n, generate_series(0, 2) k;

insert into public.verifications (user_id, pose_prompt, status, selfie_storage_path, submitted_at, reviewed_at)
select ('ffffffff-ffff-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid, 'Touch your ear', 'VERIFIED', gen_random_uuid() || '.webp', now(), now()
from generate_series(1, 3000) n;
update public.users set status = 'ACTIVE' where id::text like 'ffffffff-ffff-4000-8000-%';

-- Passes for everyone; half go available.
insert into public.payments (user_id, plan_id, source, provider, provider_transaction_id, transaction_key, amount, currency, status, paid_at)
select ('ffffffff-ffff-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid, (select id from public.subscription_plans where code = 'MM_7DAY'),
       'MOBILE_MONEY', 'ORANGE_MONEY', 'LOAD' || n, 'LOAD' || n, 5, 'USD', 'SUCCEEDED', now()
from generate_series(1, 3000) n;
select set_config('wk.claim_approval', 'on', true);
insert into public.subscriptions (user_id, plan_id, source, status, starts_at, expires_at, source_payment_id)
select p.user_id, p.plan_id, 'MOBILE_MONEY', 'ACTIVE', now(), now() + interval '7 days', p.id
from public.payments p where p.provider_transaction_id like 'LOAD%';
select set_config('wk.claim_approval', 'off', true);
select count(public.set_availability(('ffffffff-ffff-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid, null, now() + interval '4 hours'))
from generate_series(1, 3000, 2) n;
analyze;

\timing on
\echo 'Discover (Relationship), first page:'
select count(*) from public.discover_candidates('ffffffff-ffff-4000-8000-000000000002');
select count(*) from public.discover_candidates('ffffffff-ffff-4000-8000-000000000002');
\echo 'Available Now (Casual pool), first page:'
select count(*) from public.pool_candidates('ffffffff-ffff-4000-8000-000000000002');
select count(*) from public.pool_candidates('ffffffff-ffff-4000-8000-000000000002');
\echo 'Is one member in the pool:'
select public.is_in_pool('ffffffff-ffff-4000-8000-000000000001');
\timing off
rollback;
