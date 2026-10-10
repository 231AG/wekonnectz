## Phase 9 — Casual discovery & requests: COMPLETE

### ⛔ Blockers

None.

### What I built

- **Available Now (mock-up 03).** Members with a pass see a grid of verified members who are in the pool right now. Each card shows the main photo, name and age, a verified badge, "Until 11 PM" and their area.
  - Filters: area, age, interests and availability (Any time, Next 2 hours, Tonight). Gender comes from "interested in", checked both ways.
  - 20 cards at a time, with "More people".
  - Fair rotation: people who went available most recently come first, shuffled within each hour, in a different order each day.
  - Never shown: yourself, blocked members, suspended or hidden accounts, people who chose "Nobody", and anyone who recently declined you.
- **Casual profile (mock-up 04).** Photos, "Available until…", area, Casual, bio and interests. You can Save, Report or Block, and "Send a request".
  - A request is up to 300 characters.
  - Phone numbers, handles, links and prices are refused on the server (BR-31).
- **Requests tab (mock-up 05).** Messages now has Chats and Requests (with a count).
  - **Accept** opens a Casual chat that starts with the request.
  - **Decline** is private: the sender is never told, and you simply drop out of their pool for the cool-down.
  - **Block** asks first.
- **Request rules:**
  - One open request per pair.
  - A daily cap.
  - A cool-down after a decline.
  - A request expires when the recipient's availability window ends. Changing the end of the window moves the expiry; a new window or leaving the pool ends it.
  - Choosing Nobody, or blocking someone, ends open requests.
- **Saved list.** Shows only saved members who are still in your pool.
- **Casual chats without a pass are read-only (BR-25).** History is kept, and there's a "Get a pass" button.
- **Behaviour flags (§17).** Many requests in a short time, or the same text sent to many members, flags the sender for review. The flag holds counts only, never the text.
- **Daily job.** The existing availability job now also records expired requests.

### Screenshots

All in `docs/progress/phase-09/screenshots/`:

- `member-casual-available-now.png` (compare mock-up member/03)
- `member-casual-available-now-empty.png`
- `member-casual-available-now-no-pass.png`
- `member-casual-profile.png` (compare member/04)
- `member-message-requests.png` (compare member/05)
- `member-saved.png`
- `member-casual-chat-read-only.png`

### How I checked it

| Check                                                          | Result                             |
| -------------------------------------------------------------- | ---------------------------------- |
| Unit tests                                                     | 544 passed                         |
| Database tests                                                 | 840 passed, 78 of them for Phase 9 |
| End-to-end tests                                               | 63 passed                          |
| Build, lint, type and format checks; client-bundle secret scan | Clean                              |

- **Acceptance checklist (all proven by tests):**
  - No pass means no pool data at all.
  - Members who chose Nobody are hidden.
  - "Interested in" must match both ways.
  - One open request per pair.
  - The cool-down applies after a decline, and the decline stays private.
  - A Casual chat becomes read-only the moment access ends, and its history is kept.
- **The new browser test covers the full journey:**
  - no pass;
  - the grid;
  - the profile;
  - a request refused for a phone number, then sent;
  - Saved;
  - the other member accepting into a chat;
  - read-only after the pass ends.

### Problems found and fixed during self-audit

There were 2 rounds; the second was clean.

**Round 1:**

- A request's expiry was copied once, so extending a window dropped requests too early. Requests now follow the window.
- Two members requesting each other at the same moment, or an accept racing a block, could create crossed requests, duplicate chats or an open chat between a blocked pair. Sending, answering and blocking now lock both members.
- The pool did about a dozen lookups per member. It is now one query, and a test checks it gives the same answer as the per-member rule.
- A sender's window end could show to a recipient outside their pool.
- Choosing Nobody and blocking didn't end open requests.
- Block on the Requests tab had no confirmation.
- A Casual chat's header opened the Relationship profile.
- Pagination could skip or repeat cards at midnight, and could show an empty last page.

**Round 2:** clean. I strengthened two tests.

**Full suite:** one Phase 7 test expected the old pass card. Eligible members now land on Available Now, so I updated the test.

### Known limitations / not verified

- There are no request notifications yet. They come in Phase 11.
- There are no staff views of requests yet. They come in Phase 10.
- Someone using a second account could notice that a member who declined them is still available. This is accepted and recorded as Q45.

### Your tasks

- 🔴 **Blocking:** none.
- 🟠 **Needed to fully test:** OD-9, and the request-flag thresholds (T-19) below.
- 🟢 **Before launch:** the items carried over from earlier phases.
- ↪ **Carried over:**
  - T-18: card decisions OD-19 and OD-20.
  - OD-8: availability.
  - T-19: limits.
  - T-22: create `main` so phases can go in as PRs.
  - T-27: `CRON_SECRET`.
  - T-28: turn Realtime public access off.
  - T-29: prices, retention and transaction formats.

### Decisions I need from you

- **OD-9: daily request cap and decline cool-down.** These are your call; the spec gives no recommendation.
  - Until you set them, no requests can be sent at all.
  - Until then, a decline also hides that member from the sender indefinitely.
  - Local testing uses 20 a day and 7 days.
- **T-19: request flags.** I recommend:
  - 10 requests within 10 minutes;
  - the same text sent to 5 members in 24 hours.
- **Sign-off on Q44–Q47:**
  - Q44: browsing the pool needs the same eligibility as being in it.
  - Q45: declines stay private.
  - Q46: how accepting a request works.
  - Q47: the rotation order and the "Tonight" filter.

### Next: Phase 10 — Admin console (complete) + account lifecycle

This phase covers:

- the Dashboard;
- Users;
- Subscriptions;
- Payments and events, including staff tools for card charges that need a refund;
- Analytics;
- Audit logs;
- Settings;
- Staff;
- members deleting their account and exporting their data.

**This finishes the run you asked for (Phases 7b, 8 and 9).** Reply "Start Phase 10" to continue.

### Whole-app progress

89 items done, 18 in progress, 22 not started and 7 blocked. See `docs/progress/TODO.md`.
