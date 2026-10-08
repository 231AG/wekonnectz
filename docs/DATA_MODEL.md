# Data model

Spec v3 §18, kept in sync with `supabase/migrations/`. PostgreSQL; all ids UUID; every table has
`created_at`, mutable ones `updated_at`; **RLS on every table** with explicit policies in the same migration.

Legend: ✅ in a migration · ⬜ planned (phase)

## Built

### `app_settings` ✅ (Phase 0 — `20261005000000_foundation.sql`)

| Column                  | Type            | Notes                                                      |
| ----------------------- | --------------- | ---------------------------------------------------------- |
| key                     | text PK         | Dotted lower-case, e.g. `reports.auto_hide_threshold`      |
| value                   | jsonb, nullable | **NULL = owner decision pending.** `get_setting()` raises. |
| description             | text            | Required                                                   |
| updated_by              | uuid, nullable  | Staff user (FK added with `users` in Phase 1)              |
| created_at / updated_at | timestamptz     | `set_updated_at()` trigger                                 |

Privileges: none for `anon`/`authenticated`; `service_role` SELECT only. RLS: restrictive deny-all for `anon`, `authenticated`. Staff read/write arrives in Phase 3/10 via audited functions (`SETTING_CHANGED`).

### `audit_logs` ✅ (Phase 0)

| Column      | Type                | Notes                                                            |
| ----------- | ------------------- | ---------------------------------------------------------------- |
| id          | uuid PK             |                                                                  |
| actor_id    | uuid, not null      | `auth.uid()` at write time; `audit()` refuses to run without one |
| action      | `audit_action` enum | The 19 actions in §18                                            |
| entity_type | text                |                                                                  |
| entity_id   | text, nullable      | text so non-uuid keys (e.g. setting keys) fit                    |
| metadata    | jsonb               | Never phone numbers, DOB, storage paths, message text            |
| created_at  | timestamptz         |                                                                  |

Append-only: triggers block UPDATE, DELETE and TRUNCATE (owner-role caveat in `docs/SECURITY.md`). Privileges: none for clients; `service_role` SELECT only. Only `audit()` writes; it is not executable from the API, needs an authenticated actor and rejects PII metadata keys. RLS: deny-all for clients; ADMIN read in Phase 10.

### Functions ✅

| Function                                          | Callable by                      | Purpose                                                  |
| ------------------------------------------------- | -------------------------------- | -------------------------------------------------------- |
| `get_setting(key)`                                | service_role, other DB functions | Returns value; raises `P0002` missing, `P0001` undecided |
| `audit(action, entity_type, entity_id, metadata)` | other DB functions only          | Appends one audit row in the caller's transaction        |
| `set_updated_at()`                                | trigger only                     |                                                          |
| `audit_logs_append_only()`                        | trigger only                     |                                                          |

### Phase 1 tables ✅ (`20261006000000_auth_geo.sql`)

| Table                 | Key columns                                                                                        | Client access       | Notes                                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `users`               | id (= auth.users.id), role, status, suspended_until, last_seen_at, deleted_at                      | SELECT own row      | Created by trigger on auth.users. Role/status never member-writable. BANNED/DELETED → `auth.users.banned_until` = now + 100 years |
| `profiles`            | user_id PK, date_of_birth, dob_locked                                                              | SELECT own row      | Phase 1 holds DOB only. Written once via `set_date_of_birth()`. Trigger refuses under-18 and locked changes (BR-4)                |
| `geo_checks`          | id, phone_hash, ip_country, phone_country, result, created_at                                      | none                | One row per signup attempt. Country codes only (OD-12)                                                                            |
| `geo_passes`          | phone_hash PK, expires_at, used_at                                                                 | none                | Single-use, 10 min; consumed by the before-user-created hook                                                                      |
| `phone_blocklist`     | phone_hash PK, reason, created_by                                                                  | none                | BR-3. Filled by the Phase 5 ban function                                                                                          |
| `consents`            | id, user_id, document (TERMS/PRIVACY/RULES), version, accepted_at; unique(user, document, version) | SELECT + INSERT own | Used from Phase 2                                                                                                                 |
| `rate_limit_counters` | bucket, subject_hash, window_start, count                                                          | none                | Fixed-window counters; subjects HMAC-hashed                                                                                       |

Enums: `user_role`, `account_status`, `geo_result` (PASS, BLOCKED_COUNTRY, BLOCKED_PHONE, BLOCKED_LIST, RATE_LIMITED), `consent_document`.

| Function                                                           | Callable by         | Purpose                                                                               |
| ------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------- |
| `normalize_phone`, `is_liberian_phone`, `age_in_years`             | DB functions only   | Helpers                                                                               |
| `phone_hash(phone)`                                                | service_role        | HMAC-SHA256 with Vault secret `phone_hash_pepper` (raises if missing)                 |
| `rate_limit_hit(bucket, subject, window, max)`                     | service_role        | Fixed-window counter; true = allowed                                                  |
| `otp_ip_allowed(ip)`, `otp_send_allowed(phone)`                    | service_role        | §22 OTP limits from `otp.max_per_ip_per_hour` / `otp.max_per_phone_per_hour`          |
| `begin_signup(phone, ip_country, ip)`                              | service_role        | §3 pre-filter: IP limit → country → +231 → blocklist → geo pass. Records `geo_checks` |
| `hook_before_user_created(event)`                                  | supabase_auth_admin | +231, blocklist, consumes geo pass; allows email-only (admin-created staff)           |
| `set_date_of_birth(dob)`                                           | authenticated       | Own DOB, once, 18+                                                                    |
| `current_user_status()`, `effective_account_status(status, until)` | authenticated       | Expired suspension reads ACTIVE                                                       |

Settings added: `geo.enforcement_mode` = "SIGNUP_ONLY" (owner decision), `otp.max_per_phone_per_hour` and `otp.max_per_ip_per_hour` = NULL ([DECISION] T-19; DEV-ONLY values in seed).

### Phase 2 ✅ (`20261007000000_profile_onboarding.sql`)

| Table / change    | Key columns                                                                                                      | Client access               | Notes                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------- |
| `areas`           | id, county, name, active; unique(county, name)                                                                   | authenticated SELECT active | BR-20 controlled list. Content: T-09 (DEV-ONLY sample in seed)                      |
| `interests`       | id, name, slug, active                                                                                           | authenticated SELECT active | Content: T-10                                                                       |
| `user_interests`  | user_id, interest_id (PK both)                                                                                   | SELECT own                  | Replaced as a set by `save_interests_and_bio()`                                     |
| `user_settings`   | user_id PK, casual_message_permission (ANYONE/NOBODY), notification_prefs                                        | SELECT own                  | Created by trigger with each users row                                              |
| `legal_documents` | document, version (PK), title, body, content_sha256 (generated), is_current, published_at                        | anon + authenticated SELECT | One current version per document. Published text immutable (trigger). Content: T-12 |
| `consents`        | + FK (document, version) → legal_documents                                                                       | SELECT own                  | Written only by `accept_current_documents()`                                        |
| `profiles`        | + display_name, gender, seeking_genders[], bio, area_id, intent_relationship, intent_casual, is_profile_complete | SELECT own                  | Written only by the functions below                                                 |

| Function                                                          | Callable by         | Purpose                                                    |
| ----------------------------------------------------------------- | ------------------- | ---------------------------------------------------------- |
| `onboarding_progress()`                                           | authenticated (own) | {has_dob, rules_accepted, basics_done, interests_bio_done} |
| `accept_current_documents(user, versions)`                        | service_role        | Versions must equal the current ones                       |
| `save_profile_basics(user, name, gender, seeking, area, intents)` | service_role        | Requires rules accepted                                    |
| `save_interests_and_bio(user, interest_ids, bio)`                 | service_role        | Requires basics; ≥3 active interests; bio ≤ 500            |

Settings: `detection.terms` (contact / price / money_request lists; owner review T-11).

### Phase 3 ✅ (`20261008000000_photos_staff.sql`)

| Table / object   | Key columns                                                                                                                                                                     | Client access | Notes                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------- |
| `profile_photos` | id, user_id, storage_path, status (UPLOADING · PENDING_REVIEW · APPROVED · REJECTED · HIDDEN · DELETED), sort_order, is_primary, rejection_reason, reviewed_by/at, submitted_at | none          | One main photo per member (unique index). Paths never reach clients. Written only by the functions below |
| storage buckets  | photos-quarantine (10 MB, JPEG/PNG/WebP), photos (5 MB, WebP), verification, payment-evidence                                                                                   | none          | All private; no storage policies for anon/authenticated                                                  |

| Function                                                          | Callable by                 | Purpose                                                                         |
| ----------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------- |
| `begin_photo_upload(user)`                                        | service_role                | Reserve a slot: members only, steps 4–8 done, max 6, rate limit                 |
| `complete_photo_upload(user, photo, path)` / `abort_photo_upload` | service_role                | Store as PENDING_REVIEW / free the slot                                         |
| `member_photos(user)`                                             | service_role                | Own photos in order, with paths for signing                                     |
| `set_primary_photo(user, photo)` / `delete_photo`                 | service_role                | Main photo moves to the front; delete returns the path to remove                |
| `can_view_profile(viewer, owner)` / `photos_for_viewer`           | service_role                | Who sees whose photos (owner; both ACTIVE → APPROVED only). Phase 5 adds blocks |
| `staff_photo_queue(limit)` / `staff_queue_counts()`               | authenticated, `is_staff()` | Pending photos oldest first, no paths                                           |
| `claim_photo_upload(user, photo)`                                 | service_role                | Only one "finish" processes a slot                                              |
| `staff_sign_in_allowed(ip, account)`                              | service_role                | Staff password/code attempt limit per IP and per account                        |
| `review_photo_paths(ids)`                                         | service_role                | Paths of photos still PENDING_REVIEW, for signing after the staff check         |
| `review_photo(photo, approve, reason)`                            | authenticated, `is_staff()` | Decide once; reason required to reject; audited                                 |
| `current_staff_role()`                                            | authenticated (own)         | Caller's staff role                                                             |
| `bootstrap_super_admin(user)`                                     | service_role                | First SUPER_ADMIN only; audited                                                 |

Triggers on `auth.users`: `guard_auth_user_insert` (+231, blocklist, geo pass, no member email — for every user Auth creates) and `guard_member_email`. `is_staff()` now also requires `amr` to contain `password` and `totp`.

`onboarding_progress()` gains `photos_done` (3+ photos PENDING_REVIEW or APPROVED). Settings: `photos.min_required` 3, `photos.max_per_user` 6 (spec), `photos.max_uploads_per_hour` (T-19).

### Phase 4 ✅ (`20261009000000_verification.sql`)

| Table           | Key columns                                                                                                                                                                       | Client access | Notes                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------- |
| `verifications` | id, user_id, pose_prompt, status (AWAITING_SELFIE · PENDING · VERIFIED · REJECTED), selfie_storage_path, escalated, rejection_reason, submitted/reviewed at/by, selfie_deleted_at | none          | One open (awaiting or pending) per member. No row = NOT_STARTED |
| `notifications` | id, user_id, type (VERIFICATION_APPROVED · VERIFICATION_REJECTED · PHOTO_REJECTED · ACCOUNT_ACTIVE), payload, read_at                                                             | SELECT own    | Written only by `notify()`                                      |

| Function                                                                            | Callable by                    | Purpose                                                |
| ----------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------ |
| `start_verification(user)`                                                          | service_role                   | Pick (or resume) the pose                              |
| `claim_verification_selfie` / `release_verification_selfie` / `submit_verification` | service_role                   | One processing per capture; submit computes escalation |
| `member_review_status(user)`                                                        | service_role                   | Under review screen data (no paths)                    |
| `staff_verification_queue` / `staff_verification_detail`                            | authenticated, `is_staff()`    | Queue and detail (pose, DOB, area; no paths)           |
| `log_selfie_view(id)`                                                               | authenticated, `is_staff()`    | `SELFIE_VIEWED` audit before any signed URL            |
| `verification_review_paths(id)`                                                     | service_role                   | Selfie + photo paths for signing, pending only         |
| `review_verification(id, approve, reason)`                                          | authenticated, `is_staff()`    | Decide (ADMIN if escalated); audit, notify, recompute  |
| `recompute_account_state(user)`                                                     | internal (triggers, functions) | PENDING → ACTIVE when VERIFIED ∧ 3 APPROVED            |
| `selfies_due_for_deletion` / `mark_selfies_deleted`                                 | service_role                   | OD-6 retention                                         |
| `mark_notifications_read()`                                                         | authenticated (own)            |                                                        |

Settings: `verification.pose_prompts`, `verification.rejections_before_escalation` (T-19), `verification.selfie_retention_days` (OD-6) — no values in the migration.

### Phase 5 ✅ (`20261010000000_safety.sql`)

| Table              | Key columns                                                                                                                       | Client access | Notes                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------- |
| `blocks`           | blocker_id, blocked_id (unique pair, not self)                                                                                    | none          | Silent (BR-24). The member's own list via `member_blocked_list()`     |
| `reports`          | reporter_id, reported_user_id, category (8, §17), priority (HIGH · MEDIUM · LOW), description ≤500, photo_id, status, reviewed by | none          | Priority from `report_priority_for()`; reporter never shown to anyone |
| `report_notes`     | report_id, author_id, note                                                                                                        | none          | Internal staff notes                                                  |
| `moderation_flags` | entity_type, entity_id, reason (`MANY_REPORTS`, `AGE_DOUBT`; later phases add more), details, status                              | none          | One open flag per entity + reason                                     |

`users` gains `hidden_reason` (`UNDER_18_REPORT` · `REPORT_THRESHOLD`) and `hidden_at`: out of discovery pending review, not a ban. A suspension is now an overlay: `suspended_until` on a PENDING or ACTIVE row, read through `effective_account_status()`, so the account returns to exactly its stored status when it ends (legacy rows stored as SUSPENDED keep their Phase 1 meaning).

| Function                                                            | Callable by                        | Purpose                                                                      |
| ------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| `can_view_profile(viewer, owner)`                                   | internal                           | Both ACTIVE members, no block either way, owner not hidden                   |
| `block_user` / `unblock_user` / `member_blocked_list`               | service_role                       | Member id from the session                                                   |
| `submit_report(reporter, target, category, description, photo)`     | service_role                       | Automatic actions (§17), rate limit `reports.per_user_per_day`               |
| `member_profile_for_viewer(viewer, owner)`                          | service_role                       | Public profile fields only (no DOB, phone, paths, status)                    |
| `staff_reports_queue` / `staff_report_detail` / `add_report_note`   | authenticated, `is_staff()`        | Priority-sorted queue; detail without reporter identity or paths             |
| `report_review_paths(report)`                                       | service_role                       | Reported member's photo paths for signing after `requireStaff()`             |
| `resolve_report(report, dismiss, restore_visibility, photo_reason)` | authenticated, `is_staff()`        | Close, decide a hidden photo, optionally unhide; audited `REPORT_RESOLVED`   |
| `suspend_user(target, until, report)`                               | authenticated, `is_staff()`        | ≤ 366 days; audited `USER_SUSPENDED`                                         |
| `ban_user(target, reason, report)` / `restore_user(target)`         | authenticated, `is_staff('ADMIN')` | Ban adds the phone to the blocklist; audited `USER_BANNED` / `USER_RESTORED` |
| `staff_flags_queue` / `resolve_flag(flag, dismiss)`                 | authenticated, `is_staff()`        | Audited `REPORT_RESOLVED` (entity `moderation_flag`)                         |

Settings: `reports.auto_hide_threshold`, `reports.per_user_per_day` (T-19) — no values in the migration.

### Phase 6 ✅ (`20261011000000_relationship_messaging.sql`)

| Table                  | Key columns                                                                                   | Client access | Notes                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------- |
| `likes`                | sender_id, receiver_id (unique pair, not self)                                                | none          | Cap `relationship.daily_like_cap` (OD-10) over any 24 h               |
| `passes`               | sender_id, receiver_id (unique; re-pass refreshes the time)                                   | none          | Back in Discover after `relationship.pass_cooldown_days`              |
| `matches`              | user_a_id < user_b_id (unique pair), status ACTIVE · UNMATCHED, unmatched by/at               | none          | Created only inside `like_user()` under a pair lock                   |
| `conversations`        | type RELATIONSHIP · CASUAL, match_id, status OPEN · CLOSED, closed_reason UNMATCHED · BLOCKED | none          | Closed for both by unmatch or block                                   |
| `conversation_members` | conversation_id, user_id, last_read_at                                                        | none          | Strictly two members                                                  |
| `messages`             | conversation_id, sender_id, body (1–1000), flagged, created_at, read_at                       | none          | Pushed to members as private Realtime broadcasts (no flag in payload) |
| `report_messages`      | report_id, message_id, sender_id, body copy, sent_at                                          | none          | The only message text staff ever see (OD-26)                          |

`reports` gains `conversation_id`. Audit enum gains `REPORTED_MESSAGES_VIEWED` (OD-33). Realtime: policy `wk_conversation_members_receive` on `realtime.messages` lets an authenticated member receive broadcasts on `conversation:<id>` only while they belong to that open conversation; there is no insert policy, so clients can't broadcast.

| Function                                                                                  | Callable by                 | Purpose                                                                                               |
| ----------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------- |
| `relationship_eligible(user)` / `relationship_compatible(a, b)`                           | internal                    | §15 eligibility (ACTIVE, VERIFIED, 3 approved incl. main, intent, not hidden); mutual "interested in" |
| `discover_candidates(viewer, area, min_age, max_age, interests, limit)`                   | service_role                | Cards + main photo path for signing; excludes liked, passed (cool-down), matched, blocked             |
| `like_user(viewer, target)` / `pass_user` / `likes_received` / `matches_list` / `unmatch` | service_role                | Atomic match on mutual like; cap; unmatch closes the conversation                                     |
| `conversations_list` / `conversation_view` / `send_message` / `mark_conversation_read`    | service_role                | BR-5, BR-23, BR-24 checks in `can_send_in()`; flagged messages raise `MONEY_TERMS` flags without text |
| `relationship_summary(viewer)`                                                            | service_role                | Home counts                                                                                           |
| `submit_report` / `submit_conversation_report`                                            | service_role                | Shared `file_report()`; chat reports copy the last `reports.messages_captured` messages               |
| `staff_report_messages(report)`                                                           | authenticated, `is_staff()` | Audits `REPORTED_MESSAGES_VIEWED`, then returns captured messages                                     |
| `can_join_conversation_topic(topic)`                                                      | authenticated               | Realtime join check for `auth.uid()` only                                                             |

Settings: `relationship.daily_like_cap` = 50 and `relationship.pass_cooldown_days` = 7 (owner, 2026-10-08); `messages.max_per_minute`, `reports.messages_captured` (T-19, no value in the migration).

### Phase 7 ✅ (`20261012000000_mobile_money.sql`)

| Table                | Key columns                                                                                                                                                                | Client access | Notes                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------- |
| `subscription_plans` | code, name, source (MOBILE_MONEY · CARD), duration_hours, price, currency (USD only, OD-2), renews, active                                                                 | none          | Mobile money never renews (check). Prices: OD-1 (DEV-ONLY in seed)                             |
| `merchant_accounts`  | provider (ORANGE_MONEY · MTN_MOMO), display_name, number_or_code, active                                                                                                   | none          | One active wallet per provider                                                                 |
| `payment_claims`     | user, plan, provider, wallet, reference_code, transaction_id, sender_phone, amount (locked), paid_at, evidence path + SHA-256, status, reason, staff_question, member_note | none          | Partial unique (provider, transaction_id) while PENDING_REVIEW · NEEDS_INFO · APPROVED (BR-35) |
| `payments`           | user, plan, source, provider, provider_transaction_id (unique per provider), claim_id, amount, currency, status, paid_at                                                   | read: service | Money fields immutable; status changes appended to `payment_events` (BR-29)                    |
| `payment_events`     | payment_id, claim_id, type, raw_payload, signature_valid, actor_id                                                                                                         | read: service | Append-only                                                                                    |
| `subscriptions`      | user, plan, source, status, starts_at, expires_at, auto_renew, cancel_at_period_end, source_payment_id                                                                     | read: service | Mobile money rows only inside `approve_payment_claim()` (insert guard)                         |
| `card_customers`     | user_id, processor, customer_ref                                                                                                                                           | none          | Phase 7b                                                                                       |

No role can write the money tables directly (grants revoked from anon, authenticated and service_role). Access is `has_casual_access(user)`: a subscription with `starts_at <= now() < expires_at` (BR-27, BR-30).

| Function                                                                       | Callable by                        | Purpose                                                                                                                                  |
| ------------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `submit_payment_claim` / `cancel_payment_claim` / `reply_payment_claim`        | service_role                       | §16 validation (format per provider from `claims.transaction_id_patterns`, pending limit, BR-41); duplicate screenshot / reused ID flags |
| `member_payment_options` / `member_claims` / `member_passes` / `public_plans`  | service_role                       | Get access, Subscription & payments, Pricing                                                                                             |
| `staff_claims_queue` / `staff_claim_detail` / `log_evidence_view`              | authenticated, `is_staff('ADMIN')` | Queue oldest first; every screenshot view audited (`EVIDENCE_VIEWED`)                                                                    |
| `approve_payment_claim(claim)`                                                 | authenticated, `is_staff('ADMIN')` | The only path to mobile money access: claim, payment, event, stacked subscription (BR-28), audit, notify                                 |
| `reject_payment_claim` / `request_claim_info`                                  | authenticated, `is_staff('ADMIN')` | Audited; repeated rejections flag the member (`claims.rejections_before_flag`)                                                           |
| `expire_subscriptions` / `evidence_due_for_deletion` / `mark_evidence_deleted` | service_role                       | Daily `/api/cron/payments`                                                                                                               |

Settings: `claims.max_pending` = 2 (OD-21, owner); `claims.transaction_id_patterns` (T-14), `claims.rejections_before_flag` (T-19), `claims.evidence_retention_days` (OD-18) — no values in the migration.

## Planned (spec §18)

| Table                              | Phase |     | Table                                                 | Phase |
| ---------------------------------- | ----- | --- | ----------------------------------------------------- | ----- |
| users ✅                           | 1     |     | payments                                              | 7     |
| profiles ✅                        | 1–2   |     | payment_events                                        | 7     |
| geo_checks ✅                      | 1     |     | payment_claims                                        | 7     |
| phone_blocklist ✅                 | 1     |     | merchant_accounts                                     | 7     |
| consents ✅                        | 1–2   |     | card_customers                                        | 7     |
| areas ✅                           | 2     |     | likes                                                 | 6     |
| interests / user_interests ✅      | 2     |     | passes                                                | 6     |
| user_settings ✅                   | 2     |     | matches                                               | 6     |
| profile_photos ✅                  | 3     |     | message_requests                                      | 9     |
| verifications ✅                   | 4     |     | conversations / conversation_members / messages       | 6     |
| notifications ✅                   | 4     |     | saved_profiles                                        | 9     |
| availability                       | 8     |     | blocks / reports / report_notes / moderation_flags ✅ | 5     |
| subscription_plans / subscriptions | 7     |     | geo pass (single-use, see plan §1.5)                  | 1     |
