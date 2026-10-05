begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Simulate an authenticated staff session for audit()'s actor.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- BR-34: audit() writes one row with the caller as actor.
select isnt(public.audit('SETTING_CHANGED', 'app_settings', 'test.key', '{"from":1,"to":2}'::jsonb), null,
  'audit() returns the new log id');
select is((select actor_id from public.audit_logs where entity_id = 'test.key'),
  '11111111-1111-1111-1111-111111111111'::uuid, 'audit() records auth.uid() as actor');

-- Rule 7: no PII keys in metadata.
select throws_ok($$ select public.audit('USER_BANNED', 'users', 'x', '{"phone":"+231770000000"}') $$,
  '22023', null, 'audit() rejects a phone key in metadata');
select throws_ok($$ select public.audit('SELFIE_VIEWED', 'verifications', 'x', '{"storage_path":"a/b"}') $$,
  '22023', null, 'audit() rejects a storage path key in metadata');

select throws_ok($$ select public.audit('USER_BANNED', 'users', 'x', '{"meta":{"Phone":"+231770000000"}}') $$,
  '22023', null, 'audit() rejects a PII key nested inside metadata (case-insensitive)');
select throws_ok($$ select public.audit('REPORT_RESOLVED', 'reports', 'x', '{"items":[{"note":"words"}]}') $$,
  '22023', null, 'audit() rejects a PII key inside an array in metadata');

-- No actor, no audit row.
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select public.audit('USER_BANNED', 'users', 'x') $$, '42501', null,
  'audit() refuses to write without an authenticated actor');

-- Append-only even for the owner.
select throws_ok($$ update public.audit_logs set entity_type = 'x' $$, '42501', null, 'UPDATE is blocked');
select throws_ok($$ delete from public.audit_logs $$, '42501', null, 'DELETE is blocked');
select throws_ok($$ truncate public.audit_logs $$, '42501', null, 'TRUNCATE is blocked');

-- Client roles: no privileges, cannot call audit().
set local role authenticated;
select throws_ok($$ select id from public.audit_logs $$, '42501', null, 'authenticated cannot SELECT');
select throws_ok($$ insert into public.audit_logs (actor_id, action, entity_type) values (gen_random_uuid(), 'USER_BANNED', 'users') $$,
  '42501', null, 'authenticated cannot INSERT');
select throws_ok($$ select public.audit('USER_BANNED', 'users', 'x') $$, '42501', null,
  'authenticated cannot call audit()');

set local role anon;
select throws_ok($$ select id from public.audit_logs $$, '42501', null, 'anon cannot SELECT');
select throws_ok($$ truncate public.audit_logs $$, '42501', null, 'anon cannot TRUNCATE');

-- service_role: may read, may not write or call audit() (prevents actor-less or forged rows).
set local role service_role;
select is((select count(*)::int from public.audit_logs where entity_id = 'test.key'), 1, 'service_role can read');
select throws_ok($$ insert into public.audit_logs (actor_id, action, entity_type) values (gen_random_uuid(), 'USER_BANNED', 'users') $$,
  '42501', null, 'service_role cannot INSERT directly');
select throws_ok($$ select public.audit('USER_BANNED', 'users', 'x') $$, '42501', null,
  'service_role cannot call audit()');

reset role;
select * from finish();
rollback;
