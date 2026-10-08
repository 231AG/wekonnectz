# Sprint 07 — Mobile money access

**Goal:** a member pays by Orange Money / MTN MoMo outside the app, submits a claim, an admin verifies it in the wallet records, and Casual access starts — with no other way to get it.

## Scope

- `subscription_plans`, `merchant_accounts`, `payment_claims`, `payments`, `payment_events`, `subscriptions`, `card_customers` (table only).
- Get a pass (member mock-up 07; card shown as "soon" until Phase 7b) → instructions (wallet number, exact amount, reference code) → claim (transaction ID, sender number, locked amount, time, screenshot) → Subscription & payments (status, needs-info reply, withdraw, receipts). Casual page and Home show the pass; public Pricing page.
- Evidence pipeline with SHA-256 duplicate flag; reused transaction flag; repeated-rejection flag.
- Payment claims queue (ADMIN+): oldest first, audited screenshot view, four wallet-record checks, approve / reject with reason / ask the member; dashboard counter.
- `approve_payment_claim()`; stacking from current expiry; access by time comparison; daily `/api/cron/payments` (expiry tidy, screenshot retention).

## Out of scope

Card subscriptions (Phase 7b); refunds as events and manual extension (Phase 10, OD-13, OD-30); notification inbox (Phase 11); the Available Now pool that the pass unlocks (Phases 8–9).

## Acceptance checklist

- [x] No path other than `approve_payment_claim()` creates mobile money access — direct insert denied for member, admin JWT, server key and owner; function denied to moderators, admins without TOTP, the server key and own claims (pgTAP)
- [x] Same transaction ID can't be approved twice per provider (BR-35, pgTAP)
- [x] Amount ≠ price → approval refused (BR-36, pgTAP)
- [x] A second pass stacks from the current expiry (BR-28, pgTAP)
- [x] Access ends exactly at `expires_at` (BR-27, pgTAP)
- [x] Payment money columns immutable; events append-only (BR-29, pgTAP)
- [x] Member submits → admin views screenshot, checks, approves → pass active; needs-info reply; rejection with neutral reason (e2e)
- [ ] Owner sets prices, retention and transaction-ID formats (T-29)

## Self-audit

- **Round 1** (1 HIGH, 5 MEDIUM, 10 LOW): one payment could become two passes with differently written transaction IDs (now a canonical key — letters and digits, no leading zeros — unique across providers, and the owner's pattern is anchored); a stale screenshot view counted after the member replaced it (views now name the exact screenshot); BR-36 only caught price edits (approval now takes the amount from the wallet record); rejection reasons reached members through notifications (now only "refund: yes/no"); a replaced screenshot and its hash were deleted (append-only evidence history, retention job only); payment flags could be dismissed before the claim was decided (refused; flags shown on the claim, labelled, linked); rejecting failed while T-19 was unset and the payments job failed while OD-18 was unset (both skip until set); receipt-specific image limits; original file hashed (no client re-encode); subscriptions can't be edited, deleted (except an account purge) or created as CARD outside their functions; truncate guards; pending limit from the setting; no-wallet message; a11y on the screenshot field. Fixed with tests. Known limitation: the hash catches only byte-identical files (a perceptual hash is a later improvement); a crash between storing a screenshot and saving the claim can leave an orphan file (rare; swept with the bucket in Phase 12).
- **Round 2**: clean. Notes taken: an account-purge test now proves a member with passes and payments can still be deleted (payments kept, unlinked). Noted for later: admins can't yet open replaced screenshots (only see how many there were); the transaction key is unique across Orange Money and MTN (recheck when T-14 sets the formats; Phase 7b card keys will get a prefix).
