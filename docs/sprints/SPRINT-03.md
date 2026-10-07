# Sprint 03 — Photos & private storage (+ staff console shell)

**Goal:** members upload photos safely; moderators approve or reject them; nobody can fetch a photo without an access check.

## Scope

- Private buckets `photos-quarantine`, `photos` (+ `verification`, `payment-evidence` for Phases 4 and 7).
- `profile_photos` with the §11 states; upload pipeline: slot (count + rate limit) → signed upload to quarantine → server processing (magic bytes, size cap, decode, orientation, resize, WebP, no metadata) → `PENDING_REVIEW`.
- Main photo, remove; signed read URLs (120 s) after `can_view_profile` / staff checks.
- Photos onboarding step (mock-up 06); placeholder verification step (Phase 4).
- Staff accounts: email + password + TOTP (OD-27), aal2 required by every page, action and staff function; admin shell; dashboard queue count; Photo queue; first SUPER_ADMIN script.

## Out of scope

Verification selfie and Under review (Phase 4); blocks in `can_view_profile` (Phase 5); leaving discovery / availability when approved photos drop below 3 (Phases 4 and 8); staff management screen (Phase 10); drag-to-reorder (main photo can be chosen; order otherwise follows upload).

## Acceptance checklist

- [x] A non-image renamed `.jpg` is rejected (unit + e2e)
- [x] EXIF, including GPS, is absent from the stored file (BR-12, unit + e2e)
- [x] Only APPROVED photos count; a rejected photo no longer counts toward the 3 (BR-9, pgTAP + e2e)
- [x] Rejecting needs a reason (pgTAP + e2e)
- [x] A member can't read another member's object by path or by API, signed in or not (BR-11, pgTAP + e2e)
- [x] Admin routes refuse without aal2; staff functions refuse an aal1 session (pgTAP + e2e)
- [x] Every decision is audited in the same transaction, without paths (BR-34)
- [x] No bucket is public (guard test)
- [ ] Owner approves `photos.max_uploads_per_hour` (T-19)
- [ ] Owner creates the first SUPER_ADMIN on the hosted project (T-07, after T-06)

## Self-audit

Three rounds; the last clean.

- **Round 1** (12 findings, 0 HIGH, 5 MEDIUM): email magic links could skip the staff password; Auth doesn't run the before-user-created hook for admin-API creates (Phase 1 gap — now a trigger on `auth.users`); members could add an email; rejected main photo stayed main; face check skippable by reordering; orphaned quarantine files; staff login limit shared by all staff; double-finish race; expired-link refresh; upload error messages; test fragility. All fixed with tests.
- **Round 2** (1 MEDIUM, 4 LOW): a stranger knowing a staff email could lock them out → only failures count, per (account, IP) plus a loose account-wide backstop; review/member lock order; quarantine sweep vs. a tab mid-processing; re-queued main photo now audited; soft-delete note for Phase 10. All fixed.
- **Round 3**: clean. Accepted LOW: simultaneous wrong attempts can overshoot a limit by a few before they are recorded.
