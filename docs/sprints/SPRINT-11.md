# Sprint 11 — Notifications

**Goal:** members hear about everything that matters, in the app and (once the keys are set) on their phone, without any notice revealing who or what.

## Scope

- Notifications screen (bell on Home with the unread count; mock-up member/01 shows the bell): newest first, a dot on new ones; opening it reads them; each notice links to its screen.
- Triggers: message request received and accepted (never declined — Q45), match, new messages (one notice per chat, "3 new messages"; reading the chat reads it), review outcomes (Phase 4) and claim decisions (Phase 7), a pass about to end, a card plan about to renew (§16).
- Reminders: own daily job at 09:07 GMT (`/api/cron/reminders`), each sent once, an hour of slack, stacking-aware (BR-28).
- Preferences (§18 `notification_prefs`): requests, matches, messages, reminders; account notices always on (Q59).
- Web push (OD-25): `push_subscriptions` (server-only), service worker `public/push-sw.js`, generic text only, sent after the response, claim-once outbox with retry; off until the VAPID keys are set (T-20). Signing out stops push on that phone.
- Privacy: no names, no message or request text, no phone numbers in any notice or push (Q58); nothing for deleted or banned accounts; closed chats and finished requests take their notices with them.

## Out of scope

SMS or email notifications (OD-25: SMS only for OTP; WhatsApp excluded by §24). Likes on their own (Home shows them).

## Acceptance checklist

- [x] Each trigger creates exactly one notice for the right member, with no text or names (pgTAP)
- [x] Declines never notified (Q45); deleted / banned get nothing (BR-7) (pgTAP)
- [x] Preferences switch categories off; account notices stay on (pgTAP + e2e)
- [x] Reminders once, stacking-aware, card renewals separate (pgTAP)
- [x] Push: only real push services, claimed once, retried on failure, devices forgotten when gone (pgTAP + unit)
- [x] Inbox, bell count, read on open, notice opens the chat (e2e)
- [ ] Owner adds the web push keys (T-20) and approves the reminder time (T-19); signs off Q58–Q61

## Self-audit

- **Round 1** (0 HIGH, 4 MEDIUM, 9 LOW): later messages in a chat were never pushed (the bump now re-queues the push; one unread notice per chat is enforced by a unique index); one member's bogus push address could stall delivery and be used to make the server call any https URL (push-service allowlist in the action and the database, timeouts, parallel sends, retry when every device fails); reminders could be skipped by a daily job with a short warning time (own mid-morning job, 24-hour minimum, an hour of slack, all batches pushed); a shared phone kept getting the previous member's pushes (sign-out removes this phone's registration; the toggle checks the device belongs to the member signed in now). Also: closed chats and finished requests clear their notices, `notify()` skips deleted / banned accounts, the service worker refuses `//` links.
- **Round 2** (1 MEDIUM, 7 LOW): the triggers that clear notices scanned the whole table (two partial indexes, confirmed with EXPLAIN); a busy chat now re-pushes at most every two minutes.
- **Round 3**: clean. Noted: a message arriving within two minutes of a push, with nothing after it, updates the in-app count but isn't pushed on its own.
