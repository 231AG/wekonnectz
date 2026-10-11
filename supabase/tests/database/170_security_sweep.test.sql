-- Phase 12: whole-schema security sweep (spec §22 "Full RLS / pgTAP pass"). Fails when any later change
-- widens client access by accident. Per-table and per-function behaviour is tested in 000–160.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- 1. Clients never write tables directly: every change goes through checked server functions.
select is_empty(
  $$ select c.relname || ':' || r.rolname || ':' || p.priv
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       cross join (values ('anon'), ('authenticated')) r(rolname)
       cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p(priv)
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
        and has_table_privilege(r.rolname, c.oid, p.priv) $$,
  'no client role can insert, update, delete or truncate any public table');

-- 1b. …not even single columns (a column grant would bypass the table-level check above).
select is_empty(
  $$ select c.relname || ':' || r.rolname || ':' || p.priv
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       cross join (values ('anon'), ('authenticated')) r(rolname)
       cross join unnest(array['INSERT', 'UPDATE']) p(priv)
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
        and has_any_column_privilege(r.rolname, c.oid, p.priv) $$,
  'no client role holds a column-level insert or update grant');

-- 1c. Files are reached only through signed URLs made by the server after an access check.
select is_empty(
  $$ select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
       and roles && array['anon', 'authenticated', 'public']::name[] $$,
  'no storage policy lets clients read or write files directly');

-- 1d. The Supabase Auth hooks run only as Auth itself.
select is_empty(
  $$ select p.proname || ':' || r.rolname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       cross join (values ('anon'), ('authenticated'), ('service_role')) r(rolname)
      where n.nspname = 'public' and p.proname like 'hook\_%' and has_function_privilege(r.rolname, p.oid, 'EXECUTE') $$,
  'the auth hooks can be called only by Supabase Auth');

-- 2. The tables clients may read at all (each further limited by RLS to their own rows, tested per table).
select set_eq(
  $$ select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege('authenticated', c.oid, 'SELECT') $$,
  array['areas', 'consents', 'interests', 'legal_documents', 'notifications', 'profiles', 'user_interests', 'user_settings', 'users'],
  'members can read only these tables (row-level security limits each one)');
select set_eq(
  $$ select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege('anon', c.oid, 'SELECT') $$,
  array['legal_documents'],
  'signed-out visitors can read only the legal documents');

-- 3. Every client-readable table has RLS on with a policy (the guard in 000 checks all tables).
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity $$,
  'every public table has row-level security on');

-- 4. Functions that run with raised rights can't be redirected through the search path.
select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c = 'search_path=""') $$,
  'every SECURITY DEFINER function pins an empty search_path');

-- 5. Nothing is executable by PUBLIC (every function grants explicitly).
select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                    where a.grantee = 0 and a.privilege_type = 'EXECUTE') $$,
  'no public function is executable by PUBLIC');

-- 6. No views (a view would bypass RLS unless security_invoker) and nothing on the Realtime publication
-- (chat uses authorised private channels, Phase 6).
select is_empty($$ select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and relkind in ('v', 'm') $$, 'no views in public');
select is_empty($$ select tablename from pg_publication_tables where pubname = 'supabase_realtime' $$,
  'no table is streamed by Realtime');

-- 7. Storage: every bucket private, with a size limit and allowed types.
select is_empty($$ select id from storage.buckets where public or file_size_limit is null or allowed_mime_types is null $$,
  'every storage bucket is private, size-limited and type-limited');

select * from finish();
rollback;
