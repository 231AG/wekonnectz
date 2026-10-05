-- Guards that apply to every table in the public schema (spec §6 rule 2, §22).
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select is_empty(
  $$ select c.relname::text
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'every public table has RLS enabled'
);

select is_empty(
  $$ select c.relname::text
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and not exists (select 1 from pg_policy p where p.polrelid = c.oid) $$,
  'every public table has at least one explicit policy'
);

-- RLS does not cover TRUNCATE / REFERENCES / TRIGGER, so client roles must never hold them.
select is_empty(
  $$ select table_name || ':' || grantee || ':' || privilege_type
       from information_schema.role_table_grants
      where table_schema = 'public'
        and grantee in ('anon', 'authenticated')
        and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER') $$,
  'client roles hold no TRUNCATE/REFERENCES/TRIGGER privilege on any public table'
);

-- Deny by default: new tables, sequences and functions grant nothing to client roles.
select is_empty(
  $$ select d.defaclobjtype::text || ':' || a.privilege_type
       from pg_default_acl d
       join pg_namespace n on n.oid = d.defaclnamespace
       cross join lateral aclexplode(d.defaclacl) a
      where n.nspname = 'public'
        and d.defaclrole = 'postgres'::regrole
        and a.grantee in (0, 'anon'::regrole, 'authenticated'::regrole) $$,
  'default privileges grant nothing to PUBLIC, anon or authenticated'
);

-- No function in public is executable by client roles unless a later migration grants it on purpose.
-- (Phase 0 has none. Later phases add their RPCs to this allow-list with a comment.)
select is_empty(
  $$ select p.proname::text
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'))
        and p.proname <> all (array[]::text[]) -- allow-list: none yet $$,
  'no public function is executable by anon or authenticated'
);

select * from finish();
rollback;
