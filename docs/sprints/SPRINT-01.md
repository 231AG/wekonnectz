# Sprint 01 — Auth, geo & age gate

**Goal:** a Liberian adult can create an account with a +231 OTP; everyone else is stopped before an SMS is sent.

## Scope

- Tables: `users`, `profiles` (DOB), `geo_checks`, `geo_passes`, `phone_blocklist`, `consents` (table only), `rate_limit_counters`.
- Roles USER / MODERATOR / ADMIN / SUPER_ADMIN; account states PENDING / ACTIVE / SUSPENDED / BANNED / DELETED.
- Liberia pre-filter (`begin_signup`) → single-use geo pass → Supabase before-user-created hook; Send-SMS hook route with per-phone limit; per-IP limit for signup and login.
- Phone numbers stored only as HMAC hashes (Vault pepper). Country codes only, never raw IPs (OD-12).
- Screens: Welcome, Age gate, Phone + OTP, Login, Region blocked, Not eligible, About, Safety, Community rules, Terms (draft), Privacy (draft), onboarding placeholder.
- BANNED / DELETED mirrored into Supabase Auth so Auth itself refuses sign-in.

## Out of scope

Onboarding steps 4–8 (Phase 2), staff login and MFA (Phase 3), the ban/suspend actions themselves (Phase 5), real SMS provider (T-04).

## Acceptance checklist

- [x] Non-LR request country → region-blocked screen with the exact §3 copy; no OTP, no account; `geo_checks` row with country codes only (BR-1)
- [x] Non-+231 number refused in the action, in `begin_signup` and in the Auth hook (BR-2)
- [x] Direct Supabase API signup that skips our server is refused: no account, no SMS (plan §1.5)
- [x] Phone + password signUp is not auto-confirmed (OTP still required)
- [x] Public email signup closed
- [x] Banned number cannot register (BR-3); one account per phone (Supabase unique phone)
- [x] Under-18 blocked before phone entry; no account; result remembered 24 h on the device (BR-4)
- [x] DOB stored once and locked; members cannot change role, status or DOB (BR-4, BR-30)
- [x] BANNED / DELETED users cannot authenticate (BR-6, BR-7)
- [x] Expired suspension reads as ACTIVE (BR-5, §8)
- [x] OTP limits per phone and per IP (§22) — values DEV-ONLY until T-19
- [x] Login doesn't reveal whether a number has an account
- [x] pgTAP, unit and e2e tests name their rules
- [ ] Owner approves OTP limit values (T-19)
- [ ] Verified on hosted Supabase + Vercel with a real SMS provider (T-02, T-04, T-06, T-24)
