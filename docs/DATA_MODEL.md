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

## Planned (spec §18)

| Table                              | Phase |     | Table                                              | Phase |
| ---------------------------------- | ----- | --- | -------------------------------------------------- | ----- |
| users                              | 1     |     | payments                                           | 7     |
| profiles                           | 1–2   |     | payment_events                                     | 7     |
| geo_checks                         | 1     |     | payment_claims                                     | 7     |
| phone_blocklist                    | 1     |     | merchant_accounts                                  | 7     |
| consents                           | 1–2   |     | card_customers                                     | 7     |
| areas                              | 2     |     | likes                                              | 6     |
| interests / user_interests         | 2     |     | passes                                             | 6     |
| user_settings                      | 2     |     | matches                                            | 6     |
| profile_photos                     | 3     |     | message_requests                                   | 9     |
| verifications                      | 4     |     | conversations / conversation_members / messages    | 6     |
| notifications                      | 4     |     | saved_profiles                                     | 9     |
| availability                       | 8     |     | blocks / reports / report_notes / moderation_flags | 5     |
| subscription_plans / subscriptions | 7     |     | geo pass (single-use, see plan §1.5)               | 1     |
