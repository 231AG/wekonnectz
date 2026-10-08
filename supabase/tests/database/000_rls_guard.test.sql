-- Guards that apply to every table in the public schema (spec §6 rule 2, §22).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

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

-- Probe: objects created now (as a migration would) must not be reachable by client roles.
create function public.zz_probe_fn() returns int language sql as 'select 1';
create table public.zz_probe_table (id int);
select ok(
  not has_function_privilege('anon', 'public.zz_probe_fn()', 'execute')
  and not has_function_privilege('authenticated', 'public.zz_probe_fn()', 'execute'),
  'a newly created function is not executable by anon/authenticated'
);
select ok(
  not has_table_privilege('anon', 'public.zz_probe_table', 'select,insert,update,delete,truncate')
  and not has_table_privilege('authenticated', 'public.zz_probe_table', 'select,insert,update,delete,truncate'),
  'a newly created table grants nothing to anon/authenticated'
);
drop function public.zz_probe_fn();
drop table public.zz_probe_table;

-- No function in public is executable by client roles unless a later migration grants it on purpose.
-- Each phase adds its member RPCs to this allow-list with a comment saying why it is safe.
select is_empty(
  $$ select p.proname::text
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'))
        and p.proname <> all (array[
          'effective_account_status', -- Phase 1: pure helper, no data access
          'current_user_status',      -- Phase 1: caller's own status only
          'set_date_of_birth',        -- Phase 1: caller's own DOB, once (BR-4)
          'current_user_can_act',     -- Phase 1: caller's own status only
          'is_staff',                 -- Phase 1: caller's own role + MFA level only
          'onboarding_progress',      -- Phase 2: caller's own onboarding flags only
          'staff_photo_queue',        -- Phase 3: raises unless is_staff() (role + aal2); no storage paths
          'staff_queue_counts',       -- Phase 3: raises unless is_staff(); counts only
          'review_photo',             -- Phase 3: raises unless is_staff(); audited (BR-34)
          'current_staff_role',       -- Phase 3: caller's own staff role only
          'mark_notifications_read',  -- Phase 4: caller's own notifications only
          'staff_verification_queue', -- Phase 4: raises unless is_staff(); no storage paths
          'staff_verification_detail',-- Phase 4: raises unless is_staff(); no storage paths
          'log_selfie_view',          -- Phase 4: raises unless is_staff(); writes SELFIE_VIEWED (BR-34)
          'review_verification',      -- Phase 4: raises unless is_staff() (ADMIN if escalated); audited
          'staff_reports_queue',      -- Phase 5: raises unless is_staff()
          'staff_report_detail',      -- Phase 5: raises unless is_staff()
          'add_report_note',          -- Phase 5: raises unless is_staff()
          'resolve_report',           -- Phase 5: raises unless is_staff(); audited
          'suspend_user',             -- Phase 5: raises unless is_staff(); audited
          'ban_user',                 -- Phase 5: raises unless is_staff('ADMIN'); audited
          'restore_user',             -- Phase 5: raises unless is_staff('ADMIN'); audited
          'staff_flags_queue',        -- Phase 5: raises unless is_staff()
          'resolve_flag',             -- Phase 5: raises unless is_staff(); audited
          'unhide_member',            -- Phase 5: raises unless is_staff(); audited
          'can_join_conversation_topic', -- Phase 6: Realtime join check; answers only for auth.uid()
          'staff_report_messages'     -- Phase 6: raises unless is_staff(); audited per view (OD-33)
        ]::text[]) $$,
  'no public function is executable by anon or authenticated'
);

-- Spec §4: no public storage bucket, ever.
select is_empty($$ select id from storage.buckets where public $$, 'no storage bucket is public');

select * from finish();
rollback;
