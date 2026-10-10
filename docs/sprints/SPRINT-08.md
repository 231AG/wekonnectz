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

- **Round 1** (0 HIGH, 4 MEDIUM, 5 LOW): the daily tidy cleared scheduled or paused windows of members only briefly ineligible (now only ended windows and banned, deleted or staff accounts — `is_in_pool()` keeps the others out meanwhile); leaving early evaded the short-window signal and editing a live window created false short windows (now measured by time actually spent, a live window's end is extended in place, a schedule changed before it starts doesn't count, and leaving runs the check); Home said "Scheduled from <past time>" for a live window outside the pool; a window starting after the pass ends was "saved" (now refused); Resume shown to ineligible members; locks on pause and leave; a time that passed moments ago no longer means tomorrow; window changes rate-limited (T-19 setting); Q43 records that the cap is per window. Tests added for a REJECTED verification (BR-15), the report auto-hide, paused windows that ended, the tidy keeping windows, the signal cases and the Home card with Nobody. Fixed with tests.
- **Round 2** (0 HIGH, 1 MEDIUM, 5 LOW): changing the end of a paused window silently put the member back in the pool (a paused live window is now extended in place and stays paused); the change limit no longer blocks editing a live window; a time that has just passed gets its own message. Accepted and recorded: a window kept paused until it ends isn't counted as short (it was never in the pool); passes can't leave gaps (mobile money stacks, card runs alongside), so a window can't fall in a gap. Fixed with tests.
- **Round 3** (0 HIGH, 1 MEDIUM, 2 LOW): the round-2 "replaced windows don't count" exemption let a member hide short stints by switching to a schedule (removed: a started window replaced early counts; a quick change of plan is one short window, which the threshold absorbs); the "just passed" message only for well-formed times; "Available now" on a paused scheduled window replaces it and resumes (the member asked to be available now). The migration was edited in place: it has only ever run on the local stack (no hosted project yet, T-06). Fixed with tests.
