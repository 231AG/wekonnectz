-- Postgres counter rate limits (spec §5, §22) and client access to Phase 1 internals.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select ok(public.rate_limit_hit('test.bucket', 'subject-a', 3600, 2), 'first hit allowed');
select ok(public.rate_limit_hit('test.bucket', 'subject-a', 3600, 2), 'second hit allowed');
select ok(not public.rate_limit_hit('test.bucket', 'subject-a', 3600, 2), 'third hit over the limit');
select ok(public.rate_limit_hit('test.bucket', 'subject-b', 3600, 2), 'other subjects are counted separately');
select is_empty($$ select 1 from public.rate_limit_counters where subject_hash like '%subject-a%' $$,
  'rate limit subjects are stored hashed');

-- IP limit stops begin_signup (§22: OTP sends per IP).
update public.app_settings set value = '1' where key = 'otp.max_per_ip_per_hour';
select is(public.begin_signup('+231770000201', 'LR', '203.0.113.9')::text, 'PASS', 'first request from an IP passes');
select is(public.begin_signup('+231770000202', 'LR', '203.0.113.9')::text, 'RATE_LIMITED', 'second request from the same IP is rate limited');

-- Rule 9: begin_signup fails loudly while the owner decision is pending.
update public.app_settings set value = null where key = 'otp.max_per_ip_per_hour';
select throws_ok($$ select public.begin_signup('+231770000203', 'LR', '203.0.113.10') $$, 'P0001', null,
  'rule 9: no IP limit decided → signup refuses to run');

-- Per-phone OTP limit used by the Send-SMS hook (§22).
update public.app_settings set value = '2' where key = 'otp.max_per_phone_per_hour';
select ok(public.otp_send_allowed('+231770000301'), 'first OTP to a phone allowed');
select ok(public.otp_send_allowed('231 77 000 0301'), 'second OTP allowed (same number, other format)');
select ok(not public.otp_send_allowed('+231770000301'), 'third OTP to the same phone in the hour refused');

-- Clients cannot reach the internals.
set local role authenticated;
select throws_ok($$ select public.begin_signup('+231770000204', 'LR', '1.2.3.4') $$, '42501', null,
  'members cannot call begin_signup');
select throws_ok($$ select phone_hash from public.geo_passes $$, '42501', null, 'members cannot read geo_passes');
set local role anon;
select throws_ok($$ select public.hook_before_user_created('{}') $$, '42501', null, 'anon cannot call the auth hook');

reset role;
select * from finish();
rollback;
