# Business rules

Copied verbatim from spec v3 §19. Code comments and tests reference these numbers (e.g. `// BR-26`).
Owner amendments are noted below the rule they change and recorded in `docs/DECISIONS.md`.

## Access

- **BR-1** Registration requires request country = LR at signup (§3).
- **BR-2** Registration requires a verified +231 phone number.
- **BR-3** One account per verified phone number. Banned numbers cannot register.

## Account

- **BR-4** User must be 18 or older. Date of birth is locked after entry.
- **BR-5** SUSPENDED users cannot use discovery, likes, requests or send messages.
- **BR-6** BANNED users cannot authenticate.
- **BR-7** DELETED users never appear anywhere and cannot be rediscovered.

## Photos

- **BR-8** Minimum 3 APPROVED photos to appear in any discovery.
- **BR-9** Only APPROVED photos count toward the minimum.
- **BR-10** Verification selfie is private and never appears in discovery.
- **BR-11** Photos are served only via signed URLs after a server-side access check.
- **BR-12** All uploads have EXIF metadata stripped.

## Verification

- **BR-13** Every member must be VERIFIED to appear in Relationship or Casual discovery.
- **BR-14** Verification status is shown as a badge.
- **BR-15** REJECTED verification prevents discovery and availability.

## Casual

- **BR-16** Casual discovery requires an active pass.
- **BR-17** A user appears in the pool only if AVAILABLE, inside their window, and holding an active pass.
- **BR-18** Availability windows end automatically; users can leave the pool at any time.
- **BR-19** Availability is never visible outside the pool.
- **BR-20** Exact location is never collected or exposed.

## Messaging

- **BR-21** Casual contact starts with a message request from a verified pass-holder to an AVAILABLE member.
- **BR-22** Recipient can accept, decline or block.
- **BR-23** Relationship messaging requires a mutual match.
- **BR-24** Blocked users cannot see or contact each other in any way.
- **BR-25** Without an active pass, CASUAL conversations are read-only.

## Subscription

- **BR-26** Casual access begins only after confirmed payment: an approved claim (mobile money) or a verified processor event (card).
- **BR-27** Access ends at expires_at.
- **BR-28** A mobile money pass bought during an active mobile money pass extends from the current expiry.
- **BR-29** Payment money fields are immutable; status changes are logged as events.
- **BR-30** Entitlement is derived from server-side state, never trusted from the client.

## Safety

- **BR-31** Bios and requests containing contact details or prices are rejected.
  - _Owner amendment (5 Oct 2026, OD-31):_ applies to bios and first message requests. In accepted conversations phone numbers and handles are **not** flagged; only price, payment and money-request patterns are flagged (delivered, not blocked).
- **BR-32** An under-18 report removes the user from discovery immediately pending review.
- **BR-33** Reaching the report threshold auto-hides a user pending review.
- **BR-34** Every sensitive staff action is audit-logged.

## Payment claims and cards

- **BR-35** A transaction ID can be approved only once per provider.
- **BR-36** A claim can be approved only if the amount equals the plan price exactly.
- **BR-37** Only ADMIN or SUPER_ADMIN may decide a claim, never on their own member account.
- **BR-38** An admin approves only after finding the transaction in the merchant wallet records; a screenshot alone is never enough.
- **BR-39** A member may have only a limited number of claims pending at once (OD-21).
- **BR-40** A cancelled card subscription keeps access until the period ends; a failed renewal enters PAYMENT_FAILED, then EXPIRED after the grace period.
- **BR-41** A mobile money pass cannot be bought while a card subscription is active.
