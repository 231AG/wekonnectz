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

## Planned (spec §18)

| Table                              | Phase |     | Table                                              | Phase |
| ---------------------------------- | ----- | --- | -------------------------------------------------- | ----- |
| users ✅                           | 1     |     | payments                                           | 7     |
| profiles ✅                        | 1–2   |     | payment_events                                     | 7     |
| geo_checks ✅                      | 1     |     | payment_claims                                     | 7     |
| phone_blocklist ✅                 | 1     |     | merchant_accounts                                  | 7     |
| consents ✅                        | 1–2   |     | card_customers                                     | 7     |
| areas                              | 2     |     | likes                                              | 6     |
| interests / user_interests         | 2     |     | passes                                             | 6     |
| user_settings                      | 2     |     | matches                                            | 6     |
| profile_photos                     | 3     |     | message_requests                                   | 9     |
| verifications                      | 4     |     | conversations / conversation_members / messages    | 6     |
| notifications                      | 4     |     | saved_profiles                                     | 9     |
| availability                       | 8     |     | blocks / reports / report_notes / moderation_flags | 5     |
| subscription_plans / subscriptions | 7     |     | geo pass (single-use, see plan §1.5)               | 1     |
