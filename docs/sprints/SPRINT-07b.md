# Sprint 07b — Card subscriptions (scaffold)

**Goal:** card payments are designed and fully testable with a fake processor, ready for a real one (OD-4), without blocking launch.

## Scope

- `CardProcessor` interface (§16) with our checkout reference; `FakeCardProcessor` for local development and tests only (refuses production), signing its own webhooks (HMAC, timestamped).
- `/api/webhooks/card`: signature first; invalid deliveries 401 and logged; verified events stored in `payment_events` once (unique processor + event ID); 5-minute replay window; size cap.
- `apply_card_event()` state machine: PENDING → ACTIVE → renewal → CANCELLED / PAYMENT_FAILED → grace → EXPIRED; SUSPENDED (dispute) and REFUNDED; stale events ignored; rejected events recorded.
- `start_card_checkout()` (verified ACTIVE member, one card subscription at a time, OD-19, 5 an hour); cancel at period end; renewal reminder hook (`card_renewals_due()`, sent in Phase 11).
- UI behind `CARD_PAYMENTS_ENABLED`: Card tile on Get a pass → Pay by card (Weekly / Monthly, OD-19 warning) → hosted checkout → Subscription & payments (status, renewal date, failed-payment notice, cancel, manage link when the processor offers one, receipts per charge).
- Settings without values: `card.grace_hours` (OD-20), `card.allow_during_mobile_money_pass` (OD-19), `card.renewal_reminder_hours`.

## Out of scope

A real processor and its secrets (OD-4, Phase 7c); card prices (OD-1, OD-15); renewal reminder notifications (Phase 11); staff view of card events and refunds issued by staff (Phase 10).

## Acceptance checklist

- [x] Replayed event = no-op (pgTAP + e2e: second delivery returns DUPLICATE, one payment)
- [x] Bad signature = 401 + logged invalid (e2e; unit tests for wrong secret, changed body, bad header, replay window)
- [x] Failed renewal keeps access for the grace period (OD-20 setting) then expires (pgTAP time-travel; e2e status screen)
- [x] Cancelled keeps access to period end (pgTAP + e2e)
- [x] Card access only from a verified processor event (BR-26, pgTAP: direct insert refused for owner and server key; PENDING gives no access)
- [x] Card payments immutable, refunds logged as status events (BR-29, pgTAP)
- [x] Mobile money refused while a card subscription is active (BR-41, e2e)
- [ ] Owner decides OD-4, OD-15, OD-19, OD-20 (T-18)

## Self-audit

- **Round 1** (1 HIGH, 4 MEDIUM, 9 LOW): a failed retry after the grace period ran out gave a new grace period (now one grace period per paid period, `grace_for_period_end`); events arriving before the checkout or charge they refer to were rejected for good (now nothing is stored and the processor retries for up to three days); a second paid checkout, a charge that isn't the plan price, OD-19 at completion time and a charge on a refunded subscription now give no access, are kept as `CARD_NEEDS_REFUND` for staff, and renewals are cancelled at the processor (also after a refund); the fake processor needed only "not Vercel production" (now an explicit local opt-in, never on any Vercel deployment) and its test checkout took the plan from the form (now the member's own open checkout); a refund matched a charge from another subscription; period ends are capped to the plan length; a won dispute restores the previous state (incl. a running grace period) and dispute events follow event order; cancel from a suspended subscription; chunked webhook bodies are capped while reading; invalid deliveries keep a hash and 256-character prefix only, with an alert when logging pauses; the renewal-reminder query can't fail the payments job. Fixed with tests. Noted for Phase 10: cancel at the processor when an account is purged; staff tooling for `CARD_NEEDS_REFUND`.
