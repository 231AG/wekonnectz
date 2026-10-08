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
