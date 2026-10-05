begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.app_settings (key, value, description)
values ('test.decided', '5'::jsonb, 'test value'),
       ('test.undecided', null, 'decision pending');

-- Spec §6 rule 9: decided values are returned, undecided or missing ones fail loudly.
select is(public.get_setting('test.decided'), '5'::jsonb, 'get_setting returns a decided value');
select throws_ok($$ select public.get_setting('test.undecided') $$, 'P0001', null,
  'get_setting raises when the owner decision is pending (NULL value)');
select throws_ok($$ select public.get_setting('test.missing') $$, 'P0002', null,
  'get_setting raises on a missing key');

-- Client roles have no privileges at all (rows exist, so an empty read would not prove anything).
set local role authenticated;
select throws_ok($$ select key from public.app_settings $$, '42501', null, 'authenticated cannot SELECT');
select throws_ok($$ insert into public.app_settings (key, value, description) values ('x.y', '1', 'x') $$,
  '42501', null, 'authenticated cannot INSERT');
select throws_ok($$ update public.app_settings set value = '9' $$, '42501', null, 'authenticated cannot UPDATE');
select throws_ok($$ delete from public.app_settings $$, '42501', null, 'authenticated cannot DELETE');
select throws_ok($$ truncate public.app_settings $$, '42501', null, 'authenticated cannot TRUNCATE');
select throws_ok($$ select public.get_setting('test.decided') $$, '42501', null,
  'authenticated cannot execute get_setting');

set local role anon;
select throws_ok($$ select key from public.app_settings $$, '42501', null, 'anon cannot SELECT');
select throws_ok($$ truncate public.app_settings $$, '42501', null, 'anon cannot TRUNCATE');

-- service_role may read but not change settings directly.
set local role service_role;
select is((select count(*)::int from public.app_settings where key like 'test.%'), 2, 'service_role can read');
select throws_ok($$ update public.app_settings set value = '9' $$, '42501', null,
  'service_role cannot UPDATE settings directly');

reset role;
select * from finish();
rollback;
