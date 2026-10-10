## Phase 7b — Card subscriptions (scaffold): COMPLETE

### ⛔ Blockers

None. Real card payments wait on your processor choice (OD-4, Phase 7c), which doesn't block launch.

### What I built

- **The card machinery, fully working with a pretend card provider.** A member picks Weekly or Monthly. They go to the provider's own payment page, so WeKonnectz never sees card details. When the provider confirms the payment, the Casual pass starts.
- **The card states from the spec:**
  - Started (no access yet).
  - Active.
  - Renewed.
  - Cancelled: keeps access until the paid period ends.
  - Payment failed: keeps access for a grace period, then ends.
  - On hold during a dispute.
  - Refunded: access ends.
- **The webhook the provider calls.** It checks the provider's signature first. Forged calls are refused and logged. Each provider event is stored and applied exactly once, so a repeated or replayed event changes nothing. Events that arrive out of order are handled.
- **Safety rules:**
  - Only one card subscription at a time.
  - No mobile money pass while a card subscription is active (BR-41).
  - The price is locked when checkout starts.
  - A charge we can't honour gives no access. Examples: a second paid checkout, or a wrong amount. Such a charge is kept for a staff refund, and further renewals are stopped at the provider.
- **Screens, hidden behind a switch** (`CARD_PAYMENTS_ENABLED`, off in production):
  - A "Card" option on Get a pass, leading to a Pay by card page.
  - On Subscription & payments:
    - Status and renewal date.
    - A "payment failed" notice.
    - Cancel.
    - Receipts for every charge.
- **Renewal reminders:** the daily job now lists renewals that are due a reminder. Sending the reminders comes in Phase 11.

### Screenshots

In `docs/progress/phase-07b/screenshots/`. The spec has no card mock-up, so these follow the Get-a-pass design (mock-up 07).

- `member-card-choose-plan.png`
- `member-card-hosted-checkout-fake.png` (the pretend provider's test page)
- `member-card-subscription-active.png`
- `member-card-subscription-cancelled.png`
- `member-card-payment-failed.png`

### How I checked it

- **Automated tests:**

  | Suite                                           | Result     |
  | ----------------------------------------------- | ---------- |
  | Unit tests                                      | 532 passed |
  | Database tests (pgTAP), including 111 for cards | 691 passed |
  | End-to-end browser tests                        | 61 passed  |

- **Other checks:** build, lint, type and format checks are clean. The client-bundle secret scan is clean.
- **Acceptance items, each proven by a test:**
  - A replayed event is a no-op.
  - A bad signature gets 401 and is logged as invalid.
  - A failed renewal keeps access for the grace period, then expires (time-travel test).
  - A cancelled subscription keeps access until the period ends.

### Problems found and fixed during self-audit

Five review rounds; the fifth was clean.

- **Grace period:** a failed retry after the grace period could give a second grace period. Now there is one grace period per paid period.
- **Out-of-order events:** a renewal or refund that arrived before its checkout was lost. Now the provider retries it for up to 3 days.
- **Charges with no access:** a second paid checkout, a wrong amount, or a charge on a refunded subscription now gives no access. It is kept for a refund and renewals are stopped.
- **Price changes:** charges were checked against today's price, so a price change would have cancelled every subscriber. The price is now locked per subscription.
- **Disputes:** two disputes could settle each other, and a lost chargeback could leave access. Disputes are now tracked one by one.
- **Pretend provider:** it could be switched on by mistake in a deployed site. It now needs an explicit local-only setting.
- **Smaller fixes:** caps on body size and invalid-log size, and stopping a possible endless retry loop.
- **Full suite:** one older staff test failed only when the whole suite ran. The cause was the local Supabase limit of 30 texts an hour. I raised it for the local test stack only.

### Known limitations / not verified

- No real provider yet. The pretend one can't run on Vercel.
- Staff tooling for "needs refund" charges, and cancelling at the provider when an account is deleted, come in Phase 10.
- A lost dispute about a charge we never received stays open after 3 days. Staff will resolve it from the Payments page (Phase 10).

### Your tasks

- 🔴 **Blocking:** none.
- 🟠 **Needed to fully test:**
  - T-18: choose a card provider (OD-4).
  - Decide OD-19 and OD-20 (see below).
- 🟢 **Before launch:** keep `CARD_PAYMENTS_ENABLED=0` in Vercel until Phase 7c.
- ↪ **Carried over:** T-29 (prices, transaction formats, retention), T-19 limits, T-22 (`main` branch), T-28.

### Decisions I need from you

- **OD-20 — grace period after a failed renewal.** Recommended: 48 hours. Setting: `card.grace_hours`.
- **OD-19 — card subscription while a mobile money pass is active.** Recommended: allow it; both run at the same time and the member is warned. Setting: `card.allow_during_mobile_money_pass`.
- **OD-15 — offer Monthly on card as well as Weekly.** Recommended: yes.
- **Q38 — renewal reminder lead time.** Recommended: 24 hours.
- **Sign-off: Q34–Q37 and Q39.** These cover:
  - The webhook is a Next.js route, not a Supabase Edge Function.
  - Checkout carries our own reference.
  - Checkout rules.
  - Disputes and refunds.
  - Prices locked per subscription.

### Next: Phase 8 — Availability

Available now, Schedule, Pause, "Who can send you requests", and automatic removal from the pool (BR-17–20).

### Whole-app progress

76 items done, 16 in progress, 34 not started, 9 blocked. See `docs/progress/TODO.md`.
