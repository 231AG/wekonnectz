-- Phase 4 — Verification (spec §9, §10 steps 10–11, §21 verification queue; BR-10, 13, 14, 15, 34).
-- A liveness selfie with a server-chosen pose, reviewed by a person. Selfie paths never leave the server;
-- each staff view is audited before a signed URL is created.

-- ---------------------------------------------------------------------------
-- Settings. Pose list and escalation threshold: owner values (T-19); retention: OD-6. No defaults here;
-- DEV-ONLY values in seed.sql.
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('verification.pose_prompts', null, 'Pose instructions for the verification selfie, one picked at random (T-19).'),
  ('verification.rejections_before_escalation', null, 'Rejected selfies after which the next one goes to an admin (T-19).'),
  ('verification.selfie_retention_days', null, 'Days after a decision before the selfie image is deleted (OD-6).')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- verifications (spec §18). No row = NOT_STARTED. AWAITING_SELFIE holds the pose shown on screen until
-- the member submits, so the pose can't be chosen by the device.
-- ---------------------------------------------------------------------------
create type public.verification_status as enum ('AWAITING_SELFIE', 'PENDING', 'VERIFIED', 'REJECTED');

-- Reviewer checks from spec §9.
create type public.verification_rejection_reason as enum (
  'POSE_NOT_MATCHING',  -- the pose doesn't match the instruction
  'NOT_SAME_PERSON',    -- the face doesn't match the profile photos
  'AGE_DOUBT',          -- the person may be under 18 → reject and escalate (§9)
  'NOT_LIVE',           -- photo of a screen or printout
  'UNCLEAR'             -- face not visible, too dark or blurred
);

create table public.verifications (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users (id) on delete cascade,
  pose_prompt         text not null check (length(pose_prompt) between 3 and 200),
  status              public.verification_status not null default 'AWAITING_SELFIE',
  selfie_storage_path text,
  escalated           boolean not null default false,
  rejection_reason    public.verification_rejection_reason,
  submitted_at        timestamptz,
  reviewed_at         timestamptz,
  reviewed_by         uuid references public.users (id) on delete set null,
  processing_started_at timestamptz,
  selfie_deleted_at   timestamptz,
  -- clock_timestamp(): "latest verification" must be well defined even within one transaction.
  created_at          timestamptz not null default clock_timestamp(),
  updated_at          timestamptz not null default now(),
  constraint verifications_reason_when_rejected check ((status = 'REJECTED') = (rejection_reason is not null)),
  constraint verifications_selfie_when_submitted
    check (status = 'AWAITING_SELFIE' or selfie_storage_path is not null or selfie_deleted_at is not null)
);

comment on table public.verifications is
  'Verification selfies (spec §9). Server-only: selfie_storage_path never reaches a client (BR-10).';

create index verifications_user_idx on public.verifications (user_id, created_at desc);
create index verifications_queue_idx on public.verifications (submitted_at) where status = 'PENDING';
-- At most one open verification (awaiting a selfie or waiting for review) per member.
create unique index verifications_one_open on public.verifications (user_id)
  where status in ('AWAITING_SELFIE', 'PENDING');

alter table public.verifications enable row level security;
revoke all on public.verifications from anon, authenticated;
create policy verifications_no_client_access on public.verifications
  as restrictive for all to anon, authenticated using (false) with check (false);

create trigger verifications_set_updated_at
  before update on public.verifications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- notifications (spec §18, Q3: in-app + web push). Phase 4 writes review outcomes; Phase 11 adds the
-- inbox, preferences and push. Payloads hold ids and codes only, never personal data.
-- ---------------------------------------------------------------------------
create type public.notification_type as enum (
  'VERIFICATION_APPROVED', 'VERIFICATION_REJECTED', 'PHOTO_REJECTED', 'ACCOUNT_ACTIVE'
);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  type       public.notification_type not null,
  payload    jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());

-- The only writer. Called inside the transaction of the change it reports.
create or replace function public.notify(p_user_id uuid, p_type public.notification_type, p_payload jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, type, payload) values (p_user_id, p_type, coalesce(p_payload, '{}'::jsonb));
$$;

create or replace function public.mark_notifications_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Account state (spec §8, §10): PENDING → ACTIVE exactly when verification is VERIFIED and at least
-- photos.min_required photos are APPROVED (BR-8, BR-13). Runs after every photo or verification change.
-- Leaving discovery when approved photos drop below 3 is enforced by the discovery queries (Phase 6/9).
-- ---------------------------------------------------------------------------
create or replace function public.latest_verification_status(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case when v.status = 'AWAITING_SELFIE' then 'NOT_STARTED' else v.status::text end
    from public.verifications v
    where v.user_id = p_user_id and v.status <> 'AWAITING_SELFIE'
    order by v.created_at desc
    limit 1
  ), 'NOT_STARTED');
$$;

create or replace function public.recompute_account_state(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.latest_verification_status(p_user_id) = 'VERIFIED'
     and (select count(*) from public.profile_photos where user_id = p_user_id and status = 'APPROVED')
         >= (public.get_setting('photos.min_required'))::int then
    update public.users set status = 'ACTIVE' where id = p_user_id and status = 'PENDING';
    if found then
      perform public.notify(p_user_id, 'ACCOUNT_ACTIVE');
    end if;
  end if;
end;
$$;

-- Photo decisions also move the account and tell the member (photo approved last, or rejected).
create or replace function public.profile_photos_after_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'REJECTED' then
    perform public.notify(new.user_id, 'PHOTO_REJECTED',
                          jsonb_build_object('photo_id', new.id, 'reason', new.rejection_reason));
  end if;
  perform public.recompute_account_state(new.user_id);
  return new;
end;
$$;

create trigger profile_photos_after_status
  after update of status on public.profile_photos
  for each row
  when (old.status is distinct from new.status and new.status in ('APPROVED', 'REJECTED'))
  execute function public.profile_photos_after_status();

-- ---------------------------------------------------------------------------
-- Member side (service_role, with the member id from the session)
-- ---------------------------------------------------------------------------

-- Verification comes after the photos step (spec §10 step 10) and is for member accounts only.
create or replace function public.assert_can_verify(p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_member_can_manage_photos(p_user_id);
  if not coalesce((public.onboarding_progress_for(p_user_id) ->> 'photos_done')::boolean, false) then
    raise exception 'PHOTOS_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

-- Starts (or resumes) a verification: the server picks the pose. Returns the open AWAITING_SELFIE row,
-- so reloading the page shows the same pose instead of letting the member re-roll for an easier one.
create or replace function public.start_verification(p_user_id uuid)
returns table (verification_id uuid, pose_prompt text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poses jsonb;
  v_id    uuid;
  v_pose  text;
begin
  perform public.assert_can_verify(p_user_id);
  perform 1 from public.users where id = p_user_id for update;

  if exists (select 1 from public.verifications where user_id = p_user_id and status in ('PENDING', 'VERIFIED')) then
    raise exception 'ALREADY_SUBMITTED' using errcode = '22023';
  end if;

  -- A capture that started processing but never finished (server restart) is retried with the same pose.
  update public.verifications set processing_started_at = null
  where user_id = p_user_id and status = 'AWAITING_SELFIE' and processing_started_at < now() - interval '10 minutes';

  select v.id, v.pose_prompt into v_id, v_pose
  from public.verifications v
  where v.user_id = p_user_id and v.status = 'AWAITING_SELFIE';

  if v_id is null then
    v_poses := public.get_setting('verification.pose_prompts');
    if jsonb_typeof(v_poses) <> 'array' or jsonb_array_length(v_poses) = 0 then
      raise exception 'NO_POSE_PROMPTS' using errcode = '22023';
    end if;
    v_pose := v_poses ->> floor(random() * jsonb_array_length(v_poses))::int;
    insert into public.verifications (user_id, pose_prompt) values (p_user_id, v_pose)
    returning id into v_id;
  end if;

  return query select v_id, v_pose;
end;
$$;

-- Only one "submit" may process a capture.
create or replace function public.claim_verification_selfie(p_user_id uuid, p_verification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.verifications set processing_started_at = now()
  where id = p_verification_id and user_id = p_user_id and status = 'AWAITING_SELFIE' and processing_started_at is null;
  return found;
end;
$$;

-- The processing failed (not an image, too small …): the member can take the selfie again, same pose.
create or replace function public.release_verification_selfie(p_user_id uuid, p_verification_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.verifications set processing_started_at = null
  where id = p_verification_id and user_id = p_user_id and status = 'AWAITING_SELFIE';
$$;

-- The processed selfie is stored at verification/<verification_id>.webp: submit it for review.
-- Escalated to an admin after repeated rejections, or after any rejection for doubt about age (§9).
create or replace function public.submit_verification(p_user_id uuid, p_verification_id uuid, p_storage_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rejections integer;
  v_age_doubt  boolean;
begin
  perform public.assert_can_verify(p_user_id);
  if p_storage_path is distinct from p_verification_id::text || '.webp' then
    raise exception 'INVALID_STORAGE_PATH' using errcode = '22023';
  end if;
  perform 1 from public.users where id = p_user_id for update;

  select count(*), coalesce(bool_or(rejection_reason = 'AGE_DOUBT'), false)
    into v_rejections, v_age_doubt
  from public.verifications where user_id = p_user_id and status = 'REJECTED';

  update public.verifications
     set status = 'PENDING',
         selfie_storage_path = p_storage_path,
         submitted_at = now(),
         escalated = v_age_doubt
                     or v_rejections >= (public.get_setting('verification.rejections_before_escalation'))::int
   where id = p_verification_id and user_id = p_user_id and status = 'AWAITING_SELFIE'
     and processing_started_at is not null;
  if not found then
    raise exception 'VERIFICATION_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

-- What the member sees on the Under review screen (spec §10 step 11): no paths, no reviewer.
create or replace function public.member_review_status(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'verification', public.latest_verification_status(p_user_id),
    'rejection_reason', (select v.rejection_reason from public.verifications v
                         where v.user_id = p_user_id and v.status = 'REJECTED'
                         order by v.created_at desc limit 1),
    'photos_approved', (select count(*) from public.profile_photos where user_id = p_user_id and status = 'APPROVED'),
    'photos_in_review', (select count(*) from public.profile_photos where user_id = p_user_id and status = 'PENDING_REVIEW'),
    'photos_rejected', (select count(*) from public.profile_photos where user_id = p_user_id and status = 'REJECTED'),
    'photos_required', (public.get_setting('photos.min_required'))::int
  );
$$;

-- ---------------------------------------------------------------------------
-- Onboarding progress gains the verification state (resume at the right screen).
-- ---------------------------------------------------------------------------
create or replace function public.onboarding_progress_for(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'has_dob', p.user_id is not null,
    'rules_accepted', public.has_accepted_current_documents(p_user_id),
    'basics_done', coalesce(p.display_name is not null and p.gender is not null and p.seeking_genders is not null
                            and p.area_id is not null and (p.intent_relationship or p.intent_casual), false),
    'interests_bio_done', coalesce(p.is_profile_complete, false),
    'photos_done', (select count(*) from public.profile_photos ph
                    where ph.user_id = p_user_id and ph.status in ('PENDING_REVIEW', 'APPROVED'))
                   >= (public.get_setting('photos.min_required'))::int,
    'verification', public.latest_verification_status(p_user_id)
  )
  from (select p_user_id as id) u
  left join public.profiles p on p.user_id = u.id;
$$;

-- ---------------------------------------------------------------------------
-- Staff: verification queue (spec §21: photos beside the selfie and pose; oldest first). Escalated
-- items are listed for every reviewer but only ADMIN and above can decide them.
-- ---------------------------------------------------------------------------
create or replace function public.staff_verification_queue(p_limit integer default 50)
returns table (
  verification_id uuid,
  user_id         uuid,
  display_name    text,
  age             integer,
  submitted_at    timestamptz,
  escalated       boolean,
  previous_rejections bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff('MODERATOR') then
    raise exception 'NOT_STAFF' using errcode = '42501';
  end if;
  return query
    select v.id, v.user_id, p.display_name, public.age_in_years(p.date_of_birth), v.submitted_at, v.escalated,
           (select count(*) from public.verifications r where r.user_id = v.user_id and r.status = 'REJECTED')
    from public.verifications v
    left join public.profiles p on p.user_id = v.user_id
    where v.status = 'PENDING'
    order by v.submitted_at, v.id
    limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

-- Details for one verification under review. DOB is shown to reviewers to judge age (§9).
create or replace function public.staff_verification_detail(p_verification_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_staff('MODERATOR') then
    raise exception 'NOT_STAFF' using errcode = '42501';
  end if;
  select jsonb_build_object(
           'verification_id', v.id,
           'user_id', v.user_id,
           'pose_prompt', v.pose_prompt,
           'escalated', v.escalated,
           'submitted_at', v.submitted_at,
           'display_name', p.display_name,
           'age', public.age_in_years(p.date_of_birth),
           'date_of_birth', p.date_of_birth,
           'area', a.name,
           'intent_relationship', p.intent_relationship,
           'intent_casual', p.intent_casual,
           'previous_rejections', (select count(*) from public.verifications r
                                   where r.user_id = v.user_id and r.status = 'REJECTED'))
    into v_result
  from public.verifications v
  left join public.profiles p on p.user_id = v.user_id
  left join public.areas a on a.id = p.area_id
  where v.id = p_verification_id and v.status = 'PENDING';
  return v_result;
end;
$$;

-- Records that this staff member is viewing the selfie (BR-34: SELFIE_VIEWED per view). The server
-- calls this with the staff session BEFORE it signs the selfie URL; no audit row, no URL.
create or replace function public.log_selfie_view(p_verification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if not public.is_staff('MODERATOR') then
    raise exception 'NOT_STAFF' using errcode = '42501';
  end if;
  select user_id into v_owner from public.verifications where id = p_verification_id and status = 'PENDING';
  if v_owner is null then
    raise exception 'VERIFICATION_NOT_PENDING' using errcode = 'P0002';
  end if;
  if v_owner = auth.uid() then
    raise exception 'OWN_CONTENT' using errcode = '42501';
  end if;
  perform public.audit('SELFIE_VIEWED', 'verification', p_verification_id::text, jsonb_build_object('user_id', v_owner));
end;
$$;

-- Server-only: the selfie path of a verification under review, and the member's photo paths to show
-- beside it. Called only after requireStaff() and log_selfie_view().
create or replace function public.verification_review_paths(p_verification_id uuid)
returns table (kind text, id uuid, storage_path text, is_primary boolean, status public.photo_status, sort_order integer)
language sql
stable
security definer
set search_path = ''
as $$
  select 'selfie', v.id, v.selfie_storage_path, false, null::public.photo_status, -1
  from public.verifications v
  where v.id = p_verification_id and v.status = 'PENDING' and v.selfie_storage_path is not null
  union all
  select 'photo', ph.id, ph.storage_path, ph.is_primary, ph.status, ph.sort_order
  from public.verifications v
  join public.profile_photos ph on ph.user_id = v.user_id
  where v.id = p_verification_id and v.status = 'PENDING'
    and ph.status in ('PENDING_REVIEW', 'APPROVED')
  order by 6;
$$;

-- Approve or reject (reason required). Escalated verifications need ADMIN. Audited in the same
-- transaction; the member is notified and the account recomputed (ACTIVE when photos are approved too).
create or replace function public.review_verification(
  p_verification_id uuid,
  p_approve         boolean,
  p_reason          public.verification_rejection_reason default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner     uuid;
  v_escalated boolean;
begin
  if not public.is_staff('MODERATOR') then
    raise exception 'NOT_STAFF' using errcode = '42501';
  end if;
  if p_approve is null then
    raise exception 'DECISION_REQUIRED' using errcode = '22023';
  end if;
  if not p_approve and p_reason is null then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;

  -- Same lock order as member actions: member row, then the verification.
  select user_id into v_owner from public.verifications where id = p_verification_id;
  perform 1 from public.users where id = v_owner for update;
  select escalated into v_escalated from public.verifications
  where id = p_verification_id and status = 'PENDING'
  for update;
  if v_owner is null or not found then
    raise exception 'VERIFICATION_NOT_PENDING' using errcode = 'P0002';
  end if;
  if v_owner = auth.uid() then
    raise exception 'OWN_CONTENT' using errcode = '42501';
  end if;
  if v_escalated and not public.is_staff('ADMIN') then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  update public.verifications
     set status = case when p_approve then 'VERIFIED'::public.verification_status
                       else 'REJECTED'::public.verification_status end,
         rejection_reason = case when p_approve then null else p_reason end,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_verification_id;

  perform public.audit(
    case when p_approve then 'VERIFICATION_APPROVED'::public.audit_action else 'VERIFICATION_REJECTED'::public.audit_action end,
    'verification',
    p_verification_id::text,
    jsonb_strip_nulls(jsonb_build_object('user_id', v_owner, 'reason', p_reason, 'escalated', v_escalated))
  );
  perform public.notify(
    v_owner,
    case when p_approve then 'VERIFICATION_APPROVED'::public.notification_type
         else 'VERIFICATION_REJECTED'::public.notification_type end,
    jsonb_strip_nulls(jsonb_build_object('reason', p_reason))
  );
  perform public.recompute_account_state(v_owner);
end;
$$;

-- Dashboard counts gain the verification queue.
create or replace function public.staff_queue_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff('MODERATOR') then
    raise exception 'NOT_STAFF' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'photos_pending', (select count(*) from public.profile_photos where status = 'PENDING_REVIEW'),
    'photos_oldest', (select min(submitted_at) from public.profile_photos where status = 'PENDING_REVIEW'),
    'verifications_pending', (select count(*) from public.verifications where status = 'PENDING'),
    'verifications_escalated', (select count(*) from public.verifications where status = 'PENDING' and escalated),
    'verifications_oldest', (select min(submitted_at) from public.verifications where status = 'PENDING')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Selfie retention (OD-6): the image is deleted a set number of days after the decision; the decision
-- record stays. The server job removes the objects, then marks them deleted.
-- ---------------------------------------------------------------------------
create or replace function public.selfies_due_for_deletion(p_limit integer default 100)
returns table (verification_id uuid, storage_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.selfie_storage_path
  from public.verifications v
  where v.status in ('VERIFIED', 'REJECTED')
    and v.selfie_storage_path is not null
    and v.reviewed_at < now() - make_interval(days => (public.get_setting('verification.selfie_retention_days'))::int)
  order by v.reviewed_at
  limit least(greatest(coalesce(p_limit, 100), 1), 1000);
$$;

create or replace function public.mark_selfies_deleted(p_verification_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.verifications
     set selfie_storage_path = null, selfie_deleted_at = now()
   where id = any (p_verification_ids) and status in ('VERIFIED', 'REJECTED') and selfie_storage_path is not null
     -- Re-checks the retention period: a caller can't mark a selfie deleted early.
     and reviewed_at < now() - make_interval(days => (public.get_setting('verification.selfie_retention_days'))::int);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.notify(uuid, public.notification_type, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.mark_notifications_read() from public, anon;
revoke all on function public.latest_verification_status(uuid) from public, anon, authenticated, service_role;
revoke all on function public.recompute_account_state(uuid) from public, anon, authenticated, service_role;
revoke all on function public.profile_photos_after_status() from public, anon, authenticated, service_role;
revoke all on function public.assert_can_verify(uuid) from public, anon, authenticated, service_role;
revoke all on function public.start_verification(uuid) from public, anon, authenticated;
revoke all on function public.claim_verification_selfie(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_verification_selfie(uuid, uuid) from public, anon, authenticated;
revoke all on function public.submit_verification(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.member_review_status(uuid) from public, anon, authenticated;
revoke all on function public.staff_verification_queue(integer) from public, anon;
revoke all on function public.staff_verification_detail(uuid) from public, anon;
revoke all on function public.log_selfie_view(uuid) from public, anon;
revoke all on function public.verification_review_paths(uuid) from public, anon, authenticated;
revoke all on function public.review_verification(uuid, boolean, public.verification_rejection_reason) from public, anon;
revoke all on function public.staff_queue_counts() from public, anon;
revoke all on function public.selfies_due_for_deletion(integer) from public, anon, authenticated;
revoke all on function public.mark_selfies_deleted(uuid[]) from public, anon, authenticated;

grant execute on function public.start_verification(uuid) to service_role;
grant execute on function public.claim_verification_selfie(uuid, uuid) to service_role;
grant execute on function public.release_verification_selfie(uuid, uuid) to service_role;
grant execute on function public.submit_verification(uuid, uuid, text) to service_role;
grant execute on function public.member_review_status(uuid) to service_role;
grant execute on function public.verification_review_paths(uuid) to service_role;
grant execute on function public.selfies_due_for_deletion(integer) to service_role;
grant execute on function public.mark_selfies_deleted(uuid[]) to service_role;

-- Client-callable: own notifications only; staff functions check is_staff() (role + password + TOTP).
grant execute on function public.mark_notifications_read() to authenticated;
grant execute on function public.staff_verification_queue(integer) to authenticated;
grant execute on function public.staff_verification_detail(uuid) to authenticated;
grant execute on function public.log_selfie_view(uuid) to authenticated;
grant execute on function public.review_verification(uuid, boolean, public.verification_rejection_reason) to authenticated;
grant execute on function public.staff_queue_counts() to authenticated;
