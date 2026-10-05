-- Guard: every table in the public schema has RLS enabled and at least one explicit policy.
-- Catches any future table created without RLS (spec §6 rule 2, §22).
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

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

select * from finish();
rollback;
