# Sprint 08 — Availability

**Goal:** a pass-holder can go Available now or schedule a window, and leaves the pool automatically.

## Scope

- `availability` (one row per member) and `availability_windows` (history for the §17 signal).
- Availability screen (member mock-up 08): Available now (until a time), Schedule (from / until), Pause / Resume, Leave the pool, "Who can send you requests" (Anyone in the pool / Nobody). Liberia time (GMT).
- Eligibility (§12): ACTIVE and not suspended or hidden, VERIFIED, 3 approved photos incl. the main photo, Casual intent, active pass.
- `is_in_pool()` at query time (BR-17); caps from OD-8 settings; one active-or-scheduled window; daily tidy job `/api/cron/availability`; "frequent short windows" flag (T-19).
- Home availability card; Casual page links to Availability.

## Out of scope

The Available Now pool itself, requests and saved profiles (Phase 9); notifications (Phase 11); staff view of availability history (Phase 10).

## Acceptance checklist

- [x] Window outside caps rejected (OD-8 settings; pgTAP + e2e + unit)
- [x] Pass expiry mid-window removes the member from the pool immediately (pgTAP time-travel)
- [x] Availability never returned outside pool functions; no client or server-key access to the table (BR-19, pgTAP)
- [x] No location stored (BR-20, schema-wide pgTAP check)
- [x] Leaves the pool at once on fewer than 3 photos, suspension, under-18 hide; Nobody hides from the pool (pgTAP)
- [x] Now / Schedule / Pause / Resume / Leave / permission in the browser (e2e)
- [ ] Owner approves OD-8 values and the short-window thresholds (T-19)

## Self-audit

(in progress)
