# Sprint 09 — Casual discovery & requests

**Goal:** pass-holders browse the Available Now pool and start conversations only through accepted requests.

## Scope

- `message_requests`, `saved_profiles`.
- Available Now (member mock-up 03): grid of members in the viewer's pool; filters (area, age, interests, window; gender preset from "interested in" both ways); fair rotation; cursor pagination of 20; empty and no-pass states.
- Exclusions (§13): self, blocks, "interested in" both ways, suspended / hidden accounts, Nobody setting, decline cool-down.
- Casual member profile (mock-up 04): photos, "Available until", area, Casual, bio, interests; Save; report / block; Send a request (300 characters, detection in profile mode — BR-31).
- Requests tab (mock-up 05): accept (CASUAL conversation opens with the request), decline (private), block; count on the tab.
- One pending request per pair; daily cap and decline cool-down (OD-9 settings); request expiry when the recipient's window ends (OD-24).
- CASUAL conversations read-only without an active pass, history kept (BR-25), with a "Get a pass" link.
- Saved list (only members still in the pool); §17 signals: request bursts, same text to many members.

## Out of scope

Notifications for requests (Phase 11); staff views of requests (Phase 10).

## Acceptance checklist

- [x] No pass → no pool data at all (BR-16, pgTAP + e2e)
- [x] NOBODY users hidden (pgTAP)
- [x] Mutual "interested in" required (pgTAP)
- [x] One pending request per pair (pgTAP)
- [x] Cool-down after decline, and the decline stays private (pgTAP)
- [x] Conversation becomes read-only the moment access ends, history kept (BR-25, pgTAP + e2e)
- [x] Request with contact details refused (BR-31, unit + e2e); accept opens a chat (e2e)
- [ ] Owner sets OD-9 (daily cap, cool-down) and the request signal thresholds (T-19)

## Self-audit

- **Round 1** (0 HIGH, 3 MEDIUM, 9 LOW): request expiry was copied once, so extending a window dropped requests early and shortening or replacing it left them answerable (requests now follow the recipient's window through a trigger: same window → expiry moves, new window or leaving → they end); crossed requests, two conversations for one pair and an accept racing a block were possible (pair locks in send, answer and block; accepting also answers the reverse request); the pool ran a dozen function calls per member (one set-based query, checked against `pool_visible()` in pgTAP); the window end showed for a request sender outside the viewer's pool; choosing Nobody and blocking now end open requests; Block on the Requests page now asks first; Casual chats link to the Casual profile (opens while the chat is open); pagination keeps one shuffle day in the cursor and fetches 21 rows to decide "More people"; the recipient's read state is set on accept; docs corrected on declines and BR-31. Tests added for a rejected-verification sender, a suspended sender, window extend / shorten / replace, Nobody, a block closing a Casual chat, request bursts, BR-19 for a request recipient and accepting without a pass. Open for the owner: while OD-9 has no value, a decline hides the member indefinitely (Q45).
