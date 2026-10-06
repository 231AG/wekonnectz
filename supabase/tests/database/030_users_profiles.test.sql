-- users / profiles: own-row access only; role, status and DOB not member-writable (BR-4, BR-5, BR-30).
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- Two fictional members.
insert into auth.users (id, phone, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '231770000001', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '231770000002', 'authenticated', 'authenticated');

select is((select count(*)::int from public.users where id in
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002')), 2,
  'a users row is created for each new auth user');
select is((select role::text || '/' || status::text from public.users where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'USER/PENDING', 'new users start as USER / PENDING');

-- Act as member 1.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is((select count(*)::int from public.users), 1, 'member sees only their own users row');
select throws_ok($$ update public.users set role = 'ADMIN' $$, '42501', null, 'BR-30: member cannot change their role');
select throws_ok($$ update public.users set status = 'ACTIVE' $$, '42501', null, 'BR-30: member cannot change their status');
select throws_ok($$ delete from public.users $$, '42501', null, 'member cannot delete users rows');
select is(public.current_user_status()::text, 'PENDING', 'current_user_status returns own status');

-- BR-4: DOB once, adults only, then locked.
select throws_ok($$ select public.set_date_of_birth((current_date - interval '17 years 364 days')::date) $$,
  '22023', 'UNDER_18', 'BR-4: under-18 date of birth is refused');
select throws_ok($$ select public.set_date_of_birth((current_date + 1)::date) $$,
  '22023', 'UNDER_18', 'BR-4: a future date of birth is refused');
select lives_ok($$ select public.set_date_of_birth((current_date - interval '18 years')::date) $$,
  'BR-4: exactly 18 today is accepted');
select throws_ok($$ select public.set_date_of_birth('1990-01-01') $$, '42501', 'DOB_LOCKED',
  'BR-4: date of birth cannot be set twice');
select throws_ok($$ update public.profiles set date_of_birth = '1990-01-01' $$, '42501', null,
  'BR-4: member cannot update the profile row directly');
select throws_ok($$ insert into public.profiles (user_id, date_of_birth) values ('aaaaaaaa-0000-0000-0000-000000000001', '1990-01-01') $$,
  '42501', null, 'member cannot insert profiles directly');
select is((select count(*)::int from public.profiles), 1, 'member sees their own profile');

-- Member 2 cannot see member 1.
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.profiles), 0, 'member cannot see another member''s profile');
select is((select count(*)::int from public.users where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0,
  'member cannot see another member''s users row');

-- anon sees nothing.
set local role anon;
select throws_ok($$ select id from public.users $$, '42501', null, 'anon cannot read users');
select throws_ok($$ select user_id from public.profiles $$, '42501', null, 'anon cannot read profiles');
select throws_ok($$ select public.set_date_of_birth('1990-01-01') $$, '42501', null, 'anon cannot call set_date_of_birth');

reset role;

-- DOB lock holds even for the table owner unless the audited admin path is used (Phase 10).
select throws_ok($$ update public.profiles set date_of_birth = '1980-01-01' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', 'DOB_LOCKED', 'BR-4: DOB stays locked for direct updates');

-- BR-6 / BR-7: banned or deleted accounts are refused by Supabase Auth itself.
update public.users set status = 'BANNED' where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select ok((select banned_until > now() + interval '99 years' and banned_until <> 'infinity' from auth.users
            where id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  'BR-6: BANNED status bans the auth user (finite date Supabase Auth can read)');
update public.users set status = 'ACTIVE' where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select is((select banned_until from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000002'), null,
  'restoring a banned user lifts the auth ban');
update public.users set status = 'DELETED', deleted_at = now() where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select ok((select banned_until > now() + interval '99 years' from auth.users
            where id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  'BR-7: DELETED users cannot authenticate');

-- BR-5 / §8: suspensions lift automatically when suspended_until passes.
select is(public.effective_account_status('SUSPENDED', now() - interval '1 minute')::text, 'ACTIVE',
  'BR-5: an expired suspension reads as ACTIVE');
select is(public.effective_account_status('SUSPENDED', now() + interval '1 day')::text, 'SUSPENDED',
  'BR-5: a current suspension reads as SUSPENDED');

select * from finish();
rollback;
