# Sprint 10 — Admin console (complete) + account lifecycle

**Goal:** every §21 screen works for the right roles, every staff change is audited, and members can download their data and delete their account.

## Scope

- Dashboard (§21): members, verified, Casual access by plan, available now, revenue by source (30 days, all time), card charges to refund, queue sizes and oldest items. Moderators see the queues only (Q48).
- Users: search by name, account ID, status, verification, access (admins), availability; find by phone (POST, matched in the database, never shown or put in a URL). Member detail: account, reports, flags; for admins also subscriptions, payments and the audit trail. Suspend / ban / restore (Phase 5 actions), date-of-birth correction with a reason (BR-4 kept; the date never logged).
- Subscriptions: every status; manual extension of a running mobile money pass with a reason, capped in total per pass (OD-30), last pass only (BR-28). Card periods are extended at the processor (Q55).
- Payments & events: every payment with its history; card webhook log; "needs refund" filter; record a refund paid out by hand (Q49) — the access ends and card renewals stop.
- Analytics: daily sign-ups, verified, passes by method, revenue, likes, matches, requests (accepted), reports.
- Audit logs: filter by staff email, action, entity, dates; keyset paging; read-only.
- Settings: limits, thresholds, detection terms and feature flags with per-key validation and bounds; super-admin-only system config (Q50); plans and prices (Q56); merchant wallets (one active per provider); interests; areas. Report categories stay a fixed list.
- Staff (SUPER_ADMIN): create a staff account with a one-time temporary password (Q51), change role, turn off / on; Your account: change password (audited).
- Member: My profile links; Verification status; Privacy & messaging (who can send requests, blocked members); Settings; Download my data (§22, Q53); Delete account (§8, Q52) — card plans stopped at the processor first, hidden at once (BR-7).
- Daily purge (`/api/cron/account-purge`, OD-7): conversations and matches, photos, selfie, quarantine leftovers, then the Auth account; payments, claims, reports and audit rows kept, unlinked; waits while reports are open.

## Out of scope

Notifications (Phase 11). Purging abandoned never-verified sign-ups (Phase 12). Editable report categories.

## Acceptance checklist

- [x] One pgTAP test per row of the §7 matrix (moderator / admin / admin without MFA / super admin / member / server key)
- [x] BR-7: a deleted account vanishes from Discover, Likes, Matches, Chats, Available Now, Casual profile, Requests, Saved and blocked lists at once (pgTAP + e2e)
- [x] BR-34: every staff change writes an audit row in the same transaction (pgTAP + e2e audit filter)
- [x] Settings validated by kind, bounds and contents; super-admin-only keys enforced in the database
- [x] Extension cap, last-pass rule, card refusal; refunds end access and stop card renewals
- [x] Data export holds the member's own data and no storage paths (pgTAP + e2e)
- [x] Delete account stops card renewals first; a late card payment goes on the refund list (pgTAP + e2e)
- [x] Purge keeps payments and reports, removes everything personal (pgTAP)
- [ ] Owner sets OD-7 (retention), OD-30 (extension cap) and the export limit (T-19); signs off Q48–Q57

## Self-audit

- **Round 1** (2 HIGH, 4 MEDIUM, 9 LOW): a deleted member could keep being billed by card (deletion now stops every renewable card plan first, closes open checkouts, and `card_cancel_needed` covers deleted / banned owners); the purge cascaded away reports about the member (reports now outlive the account, the purge waits for open reports, and a deleted account can still be banned — Q54); an admin could raise their own extension cap (cap and card grace are super-admin settings with upper bounds; the cap is a total per pass); settings were shape-checked only (patterns must compile, term groups kept, text lists, minimums); card extensions were undone by the next renewal (refused; mobile money only, last pass only); plan edits could break card checkouts and claims (price ID rules, length locked once used); plus refund → stop renewals now, deep links, form values kept on error, password change audited, blocked list and export names, cross-site export refused, analytics counted refunded passes.
- **Round 2** (1 HIGH, 3 MEDIUM, 5 LOW): my round-1 form change had no POST fallback before hydration (a password or date could reach the URL — `method="post"`); a checkout paid after deletion still activated (ACCOUNT_CLOSED refund reason in checkout and renewal; banning stops renewals); old ended card plans could block deletion forever (only renewable plans are stopped); the console couldn't ban a deleted account and deleted-then-banned accounts were never purged; closed reports about purged members vanished from the queue; plus stored-source price-ID check, zero minimums where they mean "none", photo min ≤ max, stacked-pass check mobile money only, unaudited password change reported.
- **Round 3** (1 MEDIUM, 3 LOW): the report detail of a purged member crashed the page (status now "DELETED"); DOB correction and restore actions hidden for deleted accounts.
- **Round 4**: clean (no HIGH or MEDIUM). Lifting a ban on a deleted account (back to DELETED) is covered by the Phase 5 safety test.
