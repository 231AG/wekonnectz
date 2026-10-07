-- Phase 3 — Photos & private storage, staff console foundations.
-- Spec §11 (upload pipeline, photo states, content rules), §7 (staff), §21 (photo queue), BR-8/9/11/12/34.
-- Storage paths never leave the server (spec §6 rule 5): every function that returns one is service_role only.

-- ---------------------------------------------------------------------------
-- Private buckets (spec §4: no public bucket). Members never read or write storage.objects directly:
-- uploads go through a short-lived signed upload URL into quarantine, reads through signed URLs
-- created on the server after an access check (BR-11). verification and payment-evidence are
-- created now and used in Phases 4 and 7.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('photos-quarantine', 'photos-quarantine', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('photos',            'photos',            false, 5242880,  array['image/webp']),
  ('verification',      'verification',      false, 5242880,  array['image/jpeg', 'image/webp']),
  ('payment-evidence',  'payment-evidence',  false, 5242880,  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No storage policies are created for anon or authenticated, so RLS on storage.objects denies them
-- everything in these buckets. The server uses the service role, only after its own checks.

-- ---------------------------------------------------------------------------
-- Settings. Spec §10/§11: 3 photos required, up to 6. The upload rate limit has no spec value:
-- no default here, so get_setting() fails loudly until the owner sets it (T-19). DEV-ONLY in seed.sql.
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('photos.min_required', '3'::jsonb, 'Approved photos needed to appear anywhere (BR-8); also the onboarding minimum.'),
  ('photos.max_per_user', '6'::jsonb, 'Photo slots per member (spec §10: up to 6).'),
  ('photos.max_uploads_per_hour', null, 'Photo upload attempts per member per hour. Owner sets (T-19).'),
  ('staff_login.max_per_ip_per_hour', null, 'Failed staff sign-in attempts per client IP per hour. Owner sets (T-19).'),
  ('staff_login.max_per_account_per_hour', null, 'Failed staff sign-in attempts per account from one IP per hour. Owner sets (T-19).'),
  ('staff_login.max_per_account_all_ips_per_hour', null, 'Failed staff sign-in attempts per account from all IPs per hour (backstop). Owner sets (T-19).')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- profile_photos (spec §18). States per §11. Rows are written only by the functions below.
-- ---------------------------------------------------------------------------
create type public.photo_status as enum ('UPLOADING', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'HIDDEN', 'DELETED');

-- Spec §11 content rules. Members see neutral wording for each (lib/photos/reasons.ts).
create type public.photo_rejection_reason as enum (
  'FACE_NOT_CLEAR',     -- main photo must clearly show the member's face; no group photo as main
  'NUDITY_OR_SEXUAL',   -- nudity, underwear-focused or sexually suggestive
  'TEXT_OR_CONTACT',    -- text overlays, phone numbers, prices, handles
  'CHILD_IN_PHOTO',     -- no children in any photo
  'NOT_THE_MEMBER',     -- someone else presented as the member
  'POOR_QUALITY'        -- too dark, blurred or unrecognisable
);

create table public.profile_photos (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users (id) on delete cascade,
  storage_path     text,
  status           public.photo_status not null default 'UPLOADING',
  sort_order       integer not null default 0 check (sort_order >= 0),
  is_primary       boolean not null default false,
  rejection_reason public.photo_rejection_reason,
  reviewed_by      uuid references public.users (id) on delete set null,
  reviewed_at      timestamptz,
  submitted_at     timestamptz,
  -- The main photo must show the face (§11). A photo approved while it wasn't the main photo goes
  -- back to review if it becomes the main photo.
  reviewed_as_primary boolean not null default false,
  -- Set when the server starts processing an upload, so a repeated "finish" can't process it twice.
  processing_started_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint profile_photos_path_when_stored
    check (status in ('UPLOADING', 'DELETED') or storage_path is not null),
  constraint profile_photos_reason_when_rejected
    check ((status = 'REJECTED') = (rejection_reason is not null)),
  constraint profile_photos_primary_not_deleted
    check (not (is_primary and status = 'DELETED'))
);

comment on table public.profile_photos is
  'Member photos (spec §11). storage_path is server-only: no client role can read this table.';

create index profile_photos_user_idx on public.profile_photos (user_id, sort_order) where status <> 'DELETED';
create index profile_photos_queue_idx on public.profile_photos (submitted_at) where status = 'PENDING_REVIEW';
create unique index profile_photos_one_primary on public.profile_photos (user_id) where is_primary;

alter table public.profile_photos enable row level security;

revoke all on public.profile_photos from anon, authenticated;

create policy profile_photos_no_client_access on public.profile_photos
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

create trigger profile_photos_set_updated_at
  before update on public.profile_photos
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Visible photo slots in display order: 0, 1, 2 … The first usable photo is the main photo.
create or replace function public.renumber_photos(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_primary  uuid;
  v_requeued uuid;
begin
  with ordered as (
    select id, row_number() over (order by sort_order, created_at) - 1 as n
    from public.profile_photos
    where user_id = p_user_id and status not in ('DELETED', 'UPLOADING')
  )
  update public.profile_photos p set sort_order = o.n
  from ordered o
  where p.id = o.id and p.sort_order is distinct from o.n;

  -- The main photo is the first photo that is approved or waiting for review: a rejected or hidden
  -- photo is never the main photo.
  select id into v_primary from public.profile_photos
  where user_id = p_user_id and status in ('PENDING_REVIEW', 'APPROVED')
  order by sort_order, created_at
  limit 1;

  update public.profile_photos set is_primary = false
  where user_id = p_user_id and is_primary and id is distinct from v_primary;

  -- §11: a photo approved as a secondary photo is checked again before it becomes the main photo.
  update public.profile_photos
     set is_primary = true,
         status = case when status = 'APPROVED' and not reviewed_as_primary
                       then 'PENDING_REVIEW'::public.photo_status else status end,
         submitted_at = case when status = 'APPROVED' and not reviewed_as_primary then now() else submitted_at end
   where id = v_primary and not is_primary
  returning case when status = 'PENDING_REVIEW' and reviewed_at is not null then id end into v_requeued;
  -- The id of a photo sent back to review as the new main photo (audited by review_photo), else null.
  return v_requeued;
end;
$$;

-- Members only: staff accounts are separate and never hold member content (spec §7).
create or replace function public.assert_member_can_manage_photos(p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_can_edit_profile(p_user_id);
  if (select role from public.users where id = p_user_id) <> 'USER' then
    raise exception 'STAFF_ACCOUNT' using errcode = '42501';
  end if;
  if not coalesce((public.onboarding_progress_for(p_user_id) ->> 'interests_bio_done')::boolean, false) then
    raise exception 'PROFILE_INCOMPLETE' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Upload pipeline (spec §11): reserve a slot → signed upload to quarantine → server processing
-- (magic bytes, size cap, resize, WebP, EXIF strip) → stored in photos/ as PENDING_REVIEW.
-- ---------------------------------------------------------------------------

-- Reserves a slot and returns the new photo id. The server then signs an upload URL for
-- photos-quarantine/<user_id>/<photo_id> (only the uploader ever sees that path).
create or replace function public.begin_photo_upload(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_next integer;
begin
  perform public.assert_member_can_manage_photos(p_user_id);

  -- Serialise uploads per member so two tabs can't both take the last slot.
  perform 1 from public.users where id = p_user_id for update;

  -- Abandoned uploads (closed tab, lost connection) free their slot after an hour.
  -- Abandoned uploads (closed tab, lost connection) free their slot after an hour; a slot whose
  -- processing started but never finished (server restart) after ten minutes.
  delete from public.profile_photos
  where user_id = p_user_id and status = 'UPLOADING'
    and (created_at < now() - interval '1 hour' or processing_started_at < now() - interval '10 minutes');

  if (select count(*) from public.profile_photos where user_id = p_user_id and status <> 'DELETED')
     >= (public.get_setting('photos.max_per_user'))::int then
    raise exception 'PHOTO_LIMIT_REACHED' using errcode = '22023';
  end if;

  if not public.rate_limit_hit('photo_upload', p_user_id::text, 3600,
                               (public.get_setting('photos.max_uploads_per_hour'))::int) then
    raise exception 'RATE_LIMITED' using errcode = '22023';
  end if;

  select coalesce(max(sort_order) + 1, 0) into v_next
  from public.profile_photos where user_id = p_user_id and status <> 'DELETED';

  insert into public.profile_photos (user_id, status, sort_order)
  values (p_user_id, 'UPLOADING', v_next)
  returning id into v_id;
  return v_id;
end;
$$;

-- The server claims an upload before processing it; a second "finish" for the same photo gets false.
create or replace function public.claim_photo_upload(p_user_id uuid, p_photo_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profile_photos set processing_started_at = now()
  where id = p_photo_id and user_id = p_user_id and status = 'UPLOADING' and processing_started_at is null;
  return found;
end;
$$;

-- Called after the server has processed the file and stored it at photos/<photo_id>.webp. The object
-- name is opaque: signed URLs never reveal whose photo it is.
create or replace function public.complete_photo_upload(p_user_id uuid, p_photo_id uuid, p_storage_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_member_can_manage_photos(p_user_id);
  if p_storage_path is distinct from p_photo_id::text || '.webp' then
    raise exception 'INVALID_STORAGE_PATH' using errcode = '22023';
  end if;
  perform 1 from public.users where id = p_user_id for update;

  update public.profile_photos
     set status = 'PENDING_REVIEW', storage_path = p_storage_path, submitted_at = now()
   where id = p_photo_id and user_id = p_user_id and status = 'UPLOADING';
  if not found then
    raise exception 'PHOTO_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform public.renumber_photos(p_user_id);
end;
$$;

-- The file failed validation or processing: free the slot.
create or replace function public.abort_photo_upload(p_user_id uuid, p_photo_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.profile_photos
  where id = p_photo_id and user_id = p_user_id and status = 'UPLOADING';
$$;

-- The member's own photos in display order (server signs the paths; they never reach the client).
create or replace function public.member_photos(p_user_id uuid)
returns table (
  id uuid,
  status public.photo_status,
  sort_order integer,
  is_primary boolean,
  rejection_reason public.photo_rejection_reason,
  storage_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.status, p.sort_order, p.is_primary, p.rejection_reason, p.storage_path
  from public.profile_photos p
  where p.user_id = p_user_id and p.status not in ('DELETED', 'UPLOADING')
  order by p.sort_order, p.created_at;
$$;

-- Moves a photo to the front, making it the main photo. A rejected or hidden photo can't be main.
create or replace function public.set_primary_photo(p_user_id uuid, p_photo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_member_can_manage_photos(p_user_id);
  perform 1 from public.users where id = p_user_id for update;

  if not exists (
    select 1 from public.profile_photos
    where id = p_photo_id and user_id = p_user_id and status in ('PENDING_REVIEW', 'APPROVED')
  ) then
    raise exception 'PHOTO_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.profile_photos
     set sort_order = case when id = p_photo_id then 0 else sort_order + 1 end
   where user_id = p_user_id and status not in ('DELETED', 'UPLOADING');
  perform public.renumber_photos(p_user_id);
end;
$$;

-- Soft-deletes a photo and returns its storage path so the server can remove the object.
create or replace function public.delete_photo(p_user_id uuid, p_photo_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  perform public.assert_member_can_manage_photos(p_user_id);
  perform 1 from public.users where id = p_user_id for update;

  select storage_path into v_path from public.profile_photos
  where id = p_photo_id and user_id = p_user_id and status not in ('DELETED', 'UPLOADING')
  for update;
  if not found then
    raise exception 'PHOTO_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.profile_photos
     set status = 'DELETED', is_primary = false, storage_path = null, rejection_reason = null
   where id = p_photo_id;

  perform public.renumber_photos(p_user_id);
  return v_path;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may see whose photos (spec §11 "Who sees what", OD-3 = A, BR-11). Phase 3: the owner, or two
-- ACTIVE members (Relationship members see each other's approved photos). Phase 5 adds blocks and
-- hidden profiles; Phase 9 the Casual pool. Every photo read goes through this check.
-- ---------------------------------------------------------------------------
create or replace function public.can_view_profile(p_viewer uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_viewer is null or p_owner is null then false
    when p_viewer = p_owner then true
    else coalesce((
      select public.effective_account_status(v.status, v.suspended_until) = 'ACTIVE'
         and public.effective_account_status(o.status, o.suspended_until) = 'ACTIVE'
         and v.role = 'USER' and o.role = 'USER'
      from public.users v, public.users o
      where v.id = p_viewer and o.id = p_owner
    ), false)
  end;
$$;

-- Photo objects a viewer may see: the owner sees their own (any visible state); anyone else sees
-- APPROVED photos only, and only when can_view_profile allows (BR-9, BR-11). Server-only.
create or replace function public.photos_for_viewer(p_viewer uuid, p_owner uuid)
returns table (id uuid, status public.photo_status, sort_order integer, is_primary boolean, storage_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.status, p.sort_order, p.is_primary, p.storage_path
  from public.profile_photos p
  where p.user_id = p_owner
    and public.can_view_profile(p_viewer, p_owner)
    and (case when p_viewer = p_owner then p.status not in ('DELETED', 'UPLOADING')
              else p.status = 'APPROVED' end)
  order by p.sort_order, p.created_at;
$$;

-- ---------------------------------------------------------------------------
-- Onboarding progress gains the photos step (spec §10 step 9): 3 photos uploaded and not rejected.
-- ACTIVE still needs 3 APPROVED photos and verification (Phase 4).
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
                   >= (public.get_setting('photos.min_required'))::int
  )
  from (select p_user_id as id) u
  left join public.profiles p on p.user_id = u.id;
$$;

-- ---------------------------------------------------------------------------
-- Staff: photo queue (spec §21). Callable with the staff member's own session; is_staff() requires
-- an MFA (aal2) session. Audited in the same transaction (BR-34).
-- ---------------------------------------------------------------------------
create or replace function public.staff_photo_queue(p_limit integer default 30)
returns table (
  photo_id       uuid,
  user_id        uuid,
  display_name   text,
  age            integer,
  is_primary     boolean,
  sort_order     integer,
  uploaded_at    timestamptz,
  approved_count bigint
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
    select p.id, p.user_id, pr.display_name, public.age_in_years(pr.date_of_birth), p.is_primary, p.sort_order,
           p.submitted_at,
           (select count(*) from public.profile_photos a where a.user_id = p.user_id and a.status = 'APPROVED')
    from public.profile_photos p
    left join public.profiles pr on pr.user_id = p.user_id
    where p.status = 'PENDING_REVIEW'
    order by p.submitted_at, p.id
    limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

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
    'photos_oldest', (select min(submitted_at) from public.profile_photos where status = 'PENDING_REVIEW')
  );
end;
$$;

-- Paths of photos waiting for review, for the server to sign after it has checked the staff session.
-- Only PENDING_REVIEW photos: the queue never becomes a way to read any photo by id.
create or replace function public.review_photo_paths(p_photo_ids uuid[])
returns table (id uuid, storage_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.storage_path
  from public.profile_photos p
  where p.id = any (p_photo_ids) and p.status = 'PENDING_REVIEW';
$$;

-- Approve or reject (reason required, spec §11). Only a photo still PENDING_REVIEW can be decided,
-- so two moderators can't both decide the same photo.
create or replace function public.review_photo(
  p_photo_id uuid,
  p_approve  boolean,
  p_reason   public.photo_rejection_reason default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner    uuid;
  v_requeued uuid;
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

  -- Lock order matches the member's own photo actions (member row, then photos): no deadlocks.
  select user_id into v_owner from public.profile_photos where id = p_photo_id;
  perform 1 from public.users where id = v_owner for update;
  perform 1 from public.profile_photos where id = p_photo_id and status = 'PENDING_REVIEW' for update;
  if v_owner is null or not found then
    raise exception 'PHOTO_NOT_PENDING' using errcode = 'P0002';
  end if;
  if v_owner = auth.uid() then
    raise exception 'OWN_CONTENT' using errcode = '42501';
  end if;

  update public.profile_photos
     set status = case when p_approve then 'APPROVED'::public.photo_status else 'REJECTED'::public.photo_status end,
         rejection_reason = case when p_approve then null else p_reason end,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         reviewed_as_primary = p_approve and is_primary
   where id = p_photo_id;

  -- A rejected main photo stops being the main photo; the next one takes its place (and is checked
  -- again as a main photo if it was approved as a secondary one).
  v_requeued := public.renumber_photos(v_owner);

  perform public.audit(
    case when p_approve then 'PHOTO_APPROVED'::public.audit_action else 'PHOTO_REJECTED'::public.audit_action end,
    'profile_photo',
    p_photo_id::text,
    jsonb_strip_nulls(jsonb_build_object('user_id', v_owner, 'reason', p_reason, 'requeued_photo_id', v_requeued))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff session (server reads its own role; the page also checks the MFA level).
-- ---------------------------------------------------------------------------
create or replace function public.current_staff_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select u.role from public.users u
  where u.id = auth.uid()
    and u.role <> 'USER'
    and public.effective_account_status(u.status, u.suspended_until) not in ('BANNED', 'DELETED', 'SUSPENDED');
$$;

-- Staff sign-in attempts (password and TOTP code). Supabase Auth's own per-IP limits only see our
-- server's address, so these are the real brute-force limits. Only FAILED attempts are counted, and
-- the tight per-account limit is per (account, IP): someone who knows a staff email can't lock that
-- person out from other addresses. A looser account-wide limit is the backstop against many IPs.
create or replace function public.rate_limit_count(p_bucket text, p_subject text, p_window_seconds integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.count from public.rate_limit_counters c
    where c.bucket = p_bucket
      and c.subject_hash = public.hmac_with_pepper('rl:' || p_bucket || ':' || coalesce(p_subject, ''))
      and c.window_start = to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds)
  ), 0);
$$;

create or replace function public.staff_sign_in_allowed(p_ip text, p_account text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.rate_limit_count('staff_login.ip', coalesce(p_ip, 'unknown'), 3600)
           < (public.get_setting('staff_login.max_per_ip_per_hour'))::int
     and public.rate_limit_count('staff_login.account_ip', lower(coalesce(p_account, '')) || '|' || coalesce(p_ip, 'unknown'), 3600)
           < (public.get_setting('staff_login.max_per_account_per_hour'))::int
     and public.rate_limit_count('staff_login.account', lower(coalesce(p_account, '')), 3600)
           < (public.get_setting('staff_login.max_per_account_all_ips_per_hour'))::int;
$$;

-- Called after a wrong password or code.
create or replace function public.record_staff_sign_in_failure(p_ip text, p_account text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.rate_limit_hit('staff_login.ip', coalesce(p_ip, 'unknown'), 3600, 2147483647);
  perform public.rate_limit_hit('staff_login.account_ip', lower(coalesce(p_account, '')) || '|' || coalesce(p_ip, 'unknown'), 3600, 2147483647);
  perform public.rate_limit_hit('staff_login.account', lower(coalesce(p_account, '')), 3600, 2147483647);
end;
$$;

-- is_staff() (Phase 1) now also requires the session to have been opened with the password AND a
-- TOTP code. Enabling the email provider for staff also enables email magic links / OTP; those give
-- an aal1 session with amr = otp, which must never count as a staff sign-in (Phase 3 audit).
create or replace function public.is_staff(p_min_role public.user_role default 'MODERATOR')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case u.role
             when 'SUPER_ADMIN' then 4 when 'ADMIN' then 3 when 'MODERATOR' then 2 else 1
           end
           >= case p_min_role
             when 'SUPER_ADMIN' then 4 when 'ADMIN' then 3 when 'MODERATOR' then 2 else 1
           end
       and u.role <> 'USER'
       and public.effective_account_status(u.status, u.suspended_until) not in ('BANNED', 'DELETED', 'SUSPENDED')
       and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
       and coalesce(auth.jwt() -> 'amr', '[]'::jsonb) @> '[{"method": "password"}]'::jsonb
       and coalesce(auth.jwt() -> 'amr', '[]'::jsonb) @> '[{"method": "totp"}]'::jsonb
    from public.users u
    where u.id = auth.uid()
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- Account guards on auth.users (Phase 3 audit). Supabase Auth does not run the before-user-created
-- hook for admin-API creates, which is how our server creates members, so the same rules are
-- enforced by a trigger on every user Auth creates (session user supabase_auth_admin). Direct SQL by
-- the database owner (migrations, tests) is not affected.
-- ---------------------------------------------------------------------------
create or replace function public.guard_auth_user_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := nullif(new.phone, '');
  v_hash  text;
  v_pass  text;
begin
  if session_user <> 'supabase_auth_admin' then
    return new;
  end if;

  if v_phone is null then
    -- Email-only accounts are staff, created by the first-admin script or a SUPER_ADMIN.
    if nullif(new.email, '') is null then
      raise exception 'SIGNUP_NEEDS_LIBERIAN_PHONE' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Members sign in with their phone only; an email would open a second sign-in path.
  if nullif(new.email, '') is not null then
    raise exception 'MEMBER_EMAIL_NOT_ALLOWED' using errcode = '42501';
  end if;
  if not public.is_liberian_phone(v_phone) then
    raise exception 'ONLY_LIBERIAN_PHONES' using errcode = '42501';
  end if;
  v_hash := public.phone_hash(v_phone);
  if exists (select 1 from public.phone_blocklist b where b.phone_hash = v_hash) then
    raise exception 'PHONE_BLOCKED' using errcode = '42501';
  end if;
  -- The geo pass from begin_signup: unused, or used moments ago by the before-user-created hook
  -- (where that hook runs) for this same creation.
  update public.geo_passes
     set used_at = coalesce(used_at, now())
   where phone_hash = v_hash and expires_at > now()
     and (used_at is null or used_at > now() - interval '2 minutes')
  returning phone_hash into v_pass;
  if v_pass is null then
    raise exception 'NO_GEO_PASS' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_auth_user_insert
  before insert on auth.users
  for each row execute function public.guard_auth_user_insert();

-- Members can't add or change an email (updateUser({email}) would let them sign in by email,
-- skipping the phone OTP). A receipt email, if ever needed (spec §4), is stored separately.
create or replace function public.guard_member_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (coalesce(new.email, '') <> coalesce(old.email, '') and coalesce(new.email, '') <> '')
     or (coalesce(new.email_change, '') <> coalesce(old.email_change, '') and coalesce(new.email_change, '') <> '') then
    if coalesce((select u.role from public.users u where u.id = new.id), 'USER') = 'USER'
       and nullif(new.phone, '') is not null then
      raise exception 'MEMBER_EMAIL_NOT_ALLOWED' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_member_email
  before update of email, email_change on auth.users
  for each row execute function public.guard_member_email();

-- ---------------------------------------------------------------------------
-- First SUPER_ADMIN (spec §7, T-07). Run once by scripts/create-first-admin.mjs with the service role.
-- Refuses when a SUPER_ADMIN already exists; later staff are created by a SUPER_ADMIN (Phase 10).
-- The account must be a fresh email-only auth user (never a member account).
-- ---------------------------------------------------------------------------
create or replace function public.bootstrap_super_admin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('bootstrap_super_admin'));
  if exists (select 1 from public.users where role = 'SUPER_ADMIN') then
    raise exception 'SUPER_ADMIN_EXISTS' using errcode = '42501';
  end if;
  if not exists (
    select 1 from auth.users a
    join public.users u on u.id = a.id
    where a.id = p_user_id and coalesce(a.phone, '') = '' and a.email is not null and u.role = 'USER'
  ) or exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'NOT_A_FRESH_STAFF_ACCOUNT' using errcode = '22023';
  end if;

  update public.users set role = 'SUPER_ADMIN', status = 'ACTIVE' where id = p_user_id;

  -- audit() records auth.uid() as the actor; the first admin creates themself.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user_id)::text, true);
  perform public.audit('ADMIN_CREATED', 'user', p_user_id::text, jsonb_build_object('role', 'SUPER_ADMIN', 'bootstrap', true));
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges. Server-only (service_role) unless listed for authenticated with a reason.
-- ---------------------------------------------------------------------------
revoke all on function public.renumber_photos(uuid) from public, anon, authenticated, service_role;
revoke all on function public.assert_member_can_manage_photos(uuid) from public, anon, authenticated, service_role;
revoke all on function public.begin_photo_upload(uuid) from public, anon, authenticated;
revoke all on function public.claim_photo_upload(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_photo_upload(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.abort_photo_upload(uuid, uuid) from public, anon, authenticated;
revoke all on function public.member_photos(uuid) from public, anon, authenticated;
revoke all on function public.set_primary_photo(uuid, uuid) from public, anon, authenticated;
revoke all on function public.delete_photo(uuid, uuid) from public, anon, authenticated;
revoke all on function public.can_view_profile(uuid, uuid) from public, anon, authenticated;
revoke all on function public.photos_for_viewer(uuid, uuid) from public, anon, authenticated;
revoke all on function public.review_photo_paths(uuid[]) from public, anon, authenticated;
revoke all on function public.bootstrap_super_admin(uuid) from public, anon, authenticated;
revoke all on function public.staff_photo_queue(integer) from public, anon;
revoke all on function public.staff_queue_counts() from public, anon;
revoke all on function public.review_photo(uuid, boolean, public.photo_rejection_reason) from public, anon;
revoke all on function public.current_staff_role() from public, anon;
revoke all on function public.staff_sign_in_allowed(text, text) from public, anon, authenticated;
revoke all on function public.record_staff_sign_in_failure(text, text) from public, anon, authenticated;
revoke all on function public.rate_limit_count(text, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.guard_auth_user_insert() from public, anon, authenticated, service_role;
revoke all on function public.guard_member_email() from public, anon, authenticated, service_role;

grant execute on function public.begin_photo_upload(uuid) to service_role;
grant execute on function public.claim_photo_upload(uuid, uuid) to service_role;
grant execute on function public.complete_photo_upload(uuid, uuid, text) to service_role;
grant execute on function public.abort_photo_upload(uuid, uuid) to service_role;
grant execute on function public.member_photos(uuid) to service_role;
grant execute on function public.set_primary_photo(uuid, uuid) to service_role;
grant execute on function public.delete_photo(uuid, uuid) to service_role;
grant execute on function public.can_view_profile(uuid, uuid) to service_role;
grant execute on function public.photos_for_viewer(uuid, uuid) to service_role;
grant execute on function public.review_photo_paths(uuid[]) to service_role;
grant execute on function public.bootstrap_super_admin(uuid) to service_role;
grant execute on function public.staff_sign_in_allowed(text, text) to service_role;
grant execute on function public.record_staff_sign_in_failure(text, text) to service_role;

-- Staff functions check is_staff() (role + aal2) themselves and return no storage paths.
grant execute on function public.staff_photo_queue(integer) to authenticated;
grant execute on function public.staff_queue_counts() to authenticated;
grant execute on function public.review_photo(uuid, boolean, public.photo_rejection_reason) to authenticated;
grant execute on function public.current_staff_role() to authenticated;
