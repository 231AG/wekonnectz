# Sprint 06 — Relationship + messaging core

**Goal:** free Relationship mode works end to end: discover, like, match and chat in real time, with report and block from every conversation.

## Scope

- `likes`, `passes`, `matches` (ordered pair), `conversations`, `conversation_members`, `messages`, `report_messages`.
- Discover (member mock-up 02): one card, Like / Pass, filters (area, age range, interests; gender from "interested in" both ways). Eligibility (§15): ACTIVE, VERIFIED, 3 approved photos incl. an approved main photo, Relationship intent, not hidden by reports.
- `like_user()` atomic under a per-pair lock; daily like cap 50 (OD-10); pass cool-down 7 days (owner).
- Likes received, Matches, Home (mock-up 01) with counts and the Casual card in "get access" state; Messages list; Conversation (mock-up 06) live over private Realtime broadcasts with read receipts and the in-chat safety reminder.
- Send rules: text only, 1–1000 characters, no links, rate limit; OD-31 detection (money terms flagged and delivered; contact details not flagged); BR-5 suspended members read only.
- Unmatch and block close the conversation for both.
- Report from a conversation: recent messages captured; moderators open them with an audited `REPORTED_MESSAGES_VIEWED` view (OD-26, OD-33). Message flags in the Flags queue without text.
- My profile hub (edit via the onboarding steps, photos, blocked members, safety, log out); Casual placeholder.

## Out of scope

Casual requests, the Requests tab and read-only Casual conversations (Phase 9); notification inbox and push for likes, matches and messages (Phase 11); typing indicators (optional in §14).

## Acceptance checklist

- [x] Two simultaneous mutual likes → exactly one match (e2e concurrency test; pgTAP unique and ordered pair)
- [x] Non-matched users can't message (BR-23, pgTAP)
- [x] Unmatch / block close the conversation for both and its channel can't be joined (BR-24, pgTAP + e2e)
- [x] Flagged messages still delivered; flags carry no text (OD-31, OD-26, pgTAP + e2e)
- [x] Realtime: a non-member can't join or receive another conversation's broadcasts (pgTAP)
- [x] Live chat both ways with read receipts in two browsers (e2e)
- [x] Suspended members read but can't send, browse or like (BR-5, pgTAP)
- [x] Captured messages only, every view audited (OD-33, BR-34, pgTAP + e2e)
- [ ] Owner approves `messages.max_per_minute` and `reports.messages_captured` (T-19)

## Self-audit

- **Round 1** (0 HIGH, 4 MEDIUM, 10 LOW): a blocked member could still report the blocker from the closed chat (now only an open chat or one the reporter closed); messages sent while the live channel was connecting could be missed (catch-up fetch on every join, merged and ordered); a 404 after a block but not after an unmatch revealed blocks (unmatched pairs now can't see each other's profiles either); members hidden after an under-18 report could still be messaged (Q29); like cap could be exceeded in parallel (per-member lock); unread count included banned members; read receipts sent from background tabs; captured messages could become hidden after account purge; one flag per flagged message (now one open flag per sender); email addresses refused as links (now allowed, OD-31); unmatch now closes only its own conversation and sending needs an active match; copy fixes; Realtime public access added as owner task T-28. Fixed with tests.
- **Round 2** (2 MEDIUM, 2 LOW): together, two round-1 fixes left a member who was unmatched first with no way to report (chat reports now accepted from either member of an open or closed chat; a report from someone the other member blocked is reviewed but triggers no automatic hide and doesn't count toward the threshold); the email exception let links through ("a@bit.ly/…", "me@wa.me/…": only complete addresses on ordinary domains are now allowed). Trade-offs of Q29 and the unmatch rule recorded for sign-off. Fixed with tests.
