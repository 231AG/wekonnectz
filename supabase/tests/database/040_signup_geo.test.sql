-- Liberia-only signup pre-filter and the before-user-created hook (BR-1, BR-2, BR-3, §3).
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- Phone helpers
select is(public.normalize_phone('+231 77 000 0001'), '+231770000001', 'normalize_phone strips formatting');
select ok(public.is_liberian_phone('231770000001'), 'BR-2: +231 number accepted without the plus');
select ok(not public.is_liberian_phone('+447700900123'), 'BR-2: non-Liberian number refused');
select is(public.phone_hash('+231 77 000 0001'), public.phone_hash('231770000001'), 'phone_hash ignores formatting');
select isnt(public.phone_hash('+231770000001'), public.phone_hash('+231770000002'), 'phone_hash differs per number');

-- begin_signup: order and results (§3 rules 1–5)
select is(public.begin_signup('+231770000101', 'GB', '198.51.100.1')::text, 'BLOCKED_COUNTRY', 'BR-1: non-LR country blocked');
select is(public.begin_signup('+231770000102', null, '198.51.100.1')::text, 'BLOCKED_COUNTRY', 'BR-1: unknown country blocked (fail closed)');
select is(public.begin_signup('+447700900123', 'LR', '198.51.100.1')::text, 'BLOCKED_PHONE', 'BR-2: non-+231 number blocked');
insert into public.phone_blocklist (phone_hash, reason) values (public.phone_hash('+231770000103'), 'test ban');
select is(public.begin_signup('+231770000103', 'LR', '198.51.100.1')::text, 'BLOCKED_LIST', 'BR-3: banned number blocked');
select is(public.begin_signup('+231770000104', 'lr', '198.51.100.1')::text, 'PASS', 'LR + valid +231 passes');

select is((select count(*)::int from public.geo_checks where created_at >= now()), 5, '§3 rule 5: every attempt is recorded');
select is_empty($$ select 1 from public.geo_checks where ip_country is not null and ip_country !~ '^[A-Z]{2}$' $$,
  'OD-12: geo_checks stores country codes only');
select ok(not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'geo_checks' and column_name ilike '%ip' ),
  'OD-12: geo_checks has no raw IP column');

-- Hook: allows only a fresh geo pass, once.
select is(public.hook_before_user_created('{"user":{"phone":"231770000104"}}'), '{}'::jsonb,
  'hook allows a number with a fresh geo pass');
select is((public.hook_before_user_created('{"user":{"phone":"231770000104"}}') -> 'error' ->> 'http_code'), '403',
  'hook refuses the same geo pass twice (single use)');
select is((public.hook_before_user_created('{"user":{"phone":"231770000199"}}') -> 'error' ->> 'http_code'), '403',
  'hook refuses a number that skipped the server pre-filter (direct API call)');
select is((public.hook_before_user_created('{"user":{"phone":"447700900123"}}') -> 'error' ->> 'http_code'), '403',
  'BR-2: hook refuses a non-Liberian number');
select is((public.hook_before_user_created('{"user":{"phone":"231770000103"}}') -> 'error' ->> 'http_code'), '403',
  'BR-3: hook refuses a banned number');
select is(public.hook_before_user_created('{"user":{"email":"staff@example.test"}}'), '{}'::jsonb,
  'hook allows admin-created email (staff) accounts; public email signup is disabled in Auth config');

-- Expired pass is refused.
select public.begin_signup('+231770000105', 'LR', '198.51.100.1');
update public.geo_passes set expires_at = now() - interval '1 second' where phone_hash = public.phone_hash('+231770000105');
select is((public.hook_before_user_created('{"user":{"phone":"231770000105"}}') -> 'error' ->> 'http_code'), '403',
  'hook refuses an expired geo pass');

select * from finish();
rollback;
