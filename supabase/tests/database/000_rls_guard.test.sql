-- Guards that apply to every table in the public schema (spec §6 rule 2, §22).
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

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

-- Future tables inherit the same restriction.
select is_empty(
  $$ select 1
       from pg_default_acl d
       join pg_namespace n on n.oid = d.defaclnamespace
       cross join lateral aclexplode(d.defaclacl) a
      where n.nspname = 'public' and d.defaclobjtype = 'r'
        and d.defaclrole = 'postgres'::regrole
        and a.grantee in ('anon'::regrole, 'authenticated'::regrole)
        and a.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER') $$,
  'default privileges for new tables exclude TRUNCATE/REFERENCES/TRIGGER for client roles'
);

select * from finish();
rollback;
