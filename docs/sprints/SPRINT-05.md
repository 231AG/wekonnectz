# Sprint 05 — Safety core

**Goal:** members can report and block from any profile in two taps; staff work a priority-sorted Reports queue and a Flags queue; suspend, ban and restore are role-checked and audited.

## Scope

- `blocks` (silent, symmetric through `can_view_profile`), member profile view (member mock-up 04) with report and block sheets, Blocked members list with unblock.
- `reports` with the §17 categories and priorities; automatic actions: under-18 hides at once (BR-32), HIGH categories hide at the distinct-reporter threshold within 24 h (BR-33), inappropriate photo hides that photo.
- `report_notes`; Reports queue (admin mock-up 03): filters, detail with photos and the reporter's details (never the reporter), notes, dismiss / resolve, photo decision, make visible again.
- `moderation_flags`: `MANY_REPORTS` (threshold) and `AGE_DOUBT` (Q23); Flags queue with account actions.
- Suspension as an overlay on PENDING / ACTIVE (fixes the Phase 4 finding: an expired suspension returns the account to its real status). Suspend (moderator, only lengthens), ban and lift (admin), phone blocklist on ban (BR-3, BR-6).
- Dashboard counts for reports and flags.

## Out of scope

Reporting from conversations and reported-message access (Phase 6, OD-26 / OD-33); hiding from availability (Phase 8); burst, duplicate-text and short-window signals (Phases 8–9); the Users page (Phase 10).

## Acceptance checklist

- [x] Blocks hide both ways and are never revealed (BR-24, pgTAP + e2e)
- [x] Under-18 report hides immediately (BR-32, pgTAP + e2e)
- [x] Threshold hide counts distinct reporters with open HIGH reports in 24 h; dismissed reports never count again (BR-33, pgTAP)
- [x] Inappropriate-photo report hides that photo; the member can't delete it before review (pgTAP + e2e)
- [x] Suspension blocks discovery and reporting, ends by itself back to the real status (BR-5, pgTAP + e2e)
- [x] Ban signs out, refuses sign-in and blocks the phone; lift reverses it (BR-6, BR-3, pgTAP + e2e)
- [x] Moderators can't ban, lift or shorten; staff can't act on staff or their own account (§7, pgTAP)
- [x] Every staff decision audited in the same transaction, without member text (BR-34, pgTAP + e2e)
- [ ] Owner approves `reports.auto_hide_threshold` and `reports.per_user_per_day` (T-19) and Q23–Q28

## Self-audit

- **Round 1** (2 HIGH, 7 MEDIUM, 6 LOW): dismissed reports still counted toward auto-hide, so a moderator's decision could be undone; unverified or suspended accounts could report by blocking first; a moderator could shorten an admin's suspension; a reported photo could be deleted before review; hiding a main photo pulled another photo back into review; ban/restore could revive a deleted account and drop a report hide; no way to unhide after a report closed; flags had no actions; partial audit metadata; plus queue flooding, hidden members browsing, sheet reset and copy. All fixed with tests.
- **Round 2** (1 HIGH, 2 MEDIUM, 4 LOW): requiring a visible target for blocks broke "Also block" after an under-18 report and stopped members blocking hidden or suspended harassers (blocks now allowed for any member; only a block made while the target was visible opens the report path); a reported main photo could still lose main status when the member changed other photos (kept as main while its report is open); a deleted reporter account deleted their reports (now kept, reporter set to null; notes likewise); member filter moved into SQL; the profile refreshes after a report; suspended reporters recorded as an open question (Q25). Fixed with tests.
