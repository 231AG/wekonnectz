begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- audit() writes a row (BR-34)
select isnt(public.audit('SETTING_CHANGED', 'app_settings', 'test.key', '{"from":1,"to":2}'::jsonb), null,
  'audit() returns the new log id');
select is((select count(*)::int from public.audit_logs where entity_id = 'test.key'), 1,
  'audit() wrote exactly one row');

-- append-only for every role, including the table owner
select throws_ok($$ update public.audit_logs set entity_type = 'x' $$, '42501', null, 'UPDATE is blocked');
select throws_ok($$ delete from public.audit_logs $$, '42501', null, 'DELETE is blocked');
select throws_ok($$ truncate public.audit_logs $$, '42501', null, 'TRUNCATE is blocked');

-- client roles: no read, no write, no audit()
set local role authenticated;
select is_empty($$ select id from public.audit_logs $$, 'authenticated cannot read audit_logs');
select throws_ok($$ insert into public.audit_logs (action, entity_type) values ('USER_BANNED', 'users') $$,
  '42501', null, 'authenticated cannot insert audit_logs');
select throws_ok($$ select public.audit('USER_BANNED', 'users', 'x') $$, '42501', null,
  'authenticated cannot call audit()');

set local role anon;
select is_empty($$ select id from public.audit_logs $$, 'anon cannot read audit_logs');

reset role;
select * from finish();
rollback;
