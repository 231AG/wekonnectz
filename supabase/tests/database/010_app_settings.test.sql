begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into public.app_settings (key, value, description)
values ('test.decided', '5'::jsonb, 'test value'),
       ('test.undecided', null, 'decision pending');

-- get_setting returns decided values
select is(public.get_setting('test.decided'), '5'::jsonb, 'get_setting returns a decided value');

-- rule 9: fail loudly
select throws_ok($$ select public.get_setting('test.undecided') $$, 'P0001', null,
  'get_setting raises when the owner decision is pending (NULL value)');
select throws_ok($$ select public.get_setting('test.missing') $$, 'P0002', null,
  'get_setting raises on a missing key');

-- client roles cannot touch settings
set local role authenticated;
select is_empty($$ select key from public.app_settings $$, 'authenticated cannot read app_settings');
select throws_ok($$ insert into public.app_settings (key, value, description) values ('x.y', '1', 'x') $$,
  '42501', null, 'authenticated cannot insert app_settings');
select throws_ok($$ select public.get_setting('test.decided') $$, '42501', null,
  'authenticated cannot execute get_setting');

set local role anon;
select is_empty($$ select key from public.app_settings $$, 'anon cannot read app_settings');
select throws_ok($$ select public.get_setting('test.decided') $$, '42501', null,
  'anon cannot execute get_setting');

reset role;
select * from finish();
rollback;
