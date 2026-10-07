# Sprint 04 — Verification

**Goal:** every member is checked by a person, and becomes ACTIVE only when verified with 3 approved photos.

## Scope

- `verifications`: server-chosen pose (`verification.pose_prompts`), in-app camera capture, the photo pipeline into the private `verification` bucket.
- Verification queue (admin mock-up 02): oldest first, selfie beside the profile photos, the §9 checklist, reject with reason; `SELFIE_VIEWED` audited per view before a URL is signed.
- Resubmission; escalation to ADMIN after N rejections or any doubt about age.
- `recompute_account_state`: PENDING → ACTIVE exactly when VERIFIED and 3 photos APPROVED.
- Under review screen (mock-up 08) with live progress; Home placeholder with the Verified badge.
- `notifications` + `notify()` for review outcomes.
- Selfie retention job (OD-6): daily Vercel Cron route.

## Out of scope

ID document (OD-5 — before Casual, Phase 8 if adopted); notification inbox, preferences and push (Phase 11); Verified badge on profiles and cards (with discovery, Phases 6/9).

## Acceptance checklist

- [x] ACTIVE exactly when verified ∧ ≥3 approved, in either order (BR-13, pgTAP + e2e)
- [x] Selfie never reachable by members (BR-10, pgTAP + e2e)
- [x] Each selfie view audited; listing the queue is not a view (BR-34, pgTAP + e2e)
- [x] Rejection reason shown neutrally; resubmission works (e2e)
- [x] Escalation after the threshold and on doubt about age; only ADMIN decides (pgTAP)
- [x] Pose chosen by the server and not re-rollable (pgTAP + e2e); camera only, no file input (e2e)
- [x] Retention deletes only expired images; decision kept (pgTAP + e2e)
- [ ] Owner approves the pose list and escalation threshold (T-19), retention (OD-6), OD-5
- [ ] `CRON_SECRET` set on Vercel (T-27)
