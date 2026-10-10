## Phase 10 — Admin console + account lifecycle: COMPLETE

### ⛔ Blockers

None.

### What I built

**Admin console.** Every §21 screen, each limited to the roles in §7.

- **Dashboard.** Admins see:
  - members and how many are verified;
  - who has Casual access, by plan;
  - who is available now;
  - revenue by payment method (last 30 days and all time);
  - card charges waiting for a refund;
  - every queue with its oldest item.

  Moderators see only the queues.

- **Users.**
  - Search by name, account ID, status, verification, access or availability.
  - **Find by phone** is sent as a form, so the number never appears in a web address or a log, and it is never shown back.
  - A member's page shows reports and flags. Admins also see subscriptions, payments and the audit trail.
  - Suspend, ban and lift work as before.
  - **Correct a date of birth** needs proof and a reason. The new date is never logged. A correction can't make anyone under 18.
- **Subscriptions.**
  - Every status, with filters.
  - **Extend** a running mobile money pass, with a reason. The total added per pass is capped (OD-30), and only the member's last pass can be extended.
  - Card plans are extended at the card processor.
- **Payments & events.**
  - Every payment with its full history.
  - The card webhook log.
  - A "needs refund" filter.
  - **Record a refund** after paying it back by hand. The access it bought ends, and a card plan stops renewing straight away.
- **Analytics.** Daily figures:
  - sign-ups and verifications;
  - passes by payment method, and revenue;
  - likes and matches;
  - requests and how many were accepted;
  - reports.
- **Audit logs.** Filter by staff member, action, item and dates. Read-only.
- **Settings.**
  - Every limit, threshold, detection term and feature flag, each checked before saving: whole numbers in a sensible range, patterns that work, text lists.
  - Plans and prices, merchant wallets (one active per provider), interests and areas.
  - System settings are super-admin only. These include the location check, minimum photos, sign-in limits, the deletion retention period, the extension cap and the card grace period.
  - Every change is logged with the old and new value.
- **Staff (super admin).**
  - Add a staff member by email and role. A one-time temporary password is shown once; they set up their authenticator app and then change the password under **Your account**.
  - Change roles, and turn accounts off or on. You can't change your own account.

**Members.** My profile now links to Verification, Privacy & messaging and Settings.

- **Download my data.** Your own profile, messages and requests you sent, payments, passes and more, as a file. Nothing from the other side of a chat, and no file locations.
- **Delete account.** You type DELETE to confirm.
  - A card plan is stopped at the processor first.
  - You disappear from everywhere at once and are logged out.
  - Your matches, chats and requests end.

**Daily purge job.** After the retention period (OD-7), a deleted member's photos, selfie, chats and account are removed. Payment records, claims, reports and the audit log are kept, unlinked from the account. Nothing is purged until you set OD-7.

### Screenshots

All in `docs/progress/phase-10/screenshots/`.

- **Admin (1440×900):**
  - `admin-dashboard.png`
  - `admin-users.png`
  - `admin-user-detail.png`
  - `admin-subscriptions.png`
  - `admin-payments-events.png`
  - `admin-webhook-log.png`
  - `admin-analytics.png`
  - `admin-audit-logs.png`
  - `admin-settings.png`
  - `admin-settings-plans.png`
  - `admin-staff.png`
- **Member (390×844):**
  - `member-me.png`
  - `member-verification.png`
  - `member-privacy.png`
  - `member-settings.png`
  - `member-delete-account.png`
  - `member-goodbye.png`

### How I checked it

| Check                                                          | Result                                  |
| -------------------------------------------------------------- | --------------------------------------- |
| Unit tests                                                     | 553 passed                              |
| Database tests                                                 | 1,000 passed, 158 of them for Phase 10  |
| End-to-end tests                                               | 66 passed, including 3 new for Phase 10 |
| Build, lint, type and format checks; client-bundle secret scan | Clean                                   |

The database tests cover:

- **Who can do what (§7).** One check for each row of the permissions table, for each role: moderator, admin, admin without the authenticator, super admin, member and the server key.
- **Deleted members disappear everywhere (BR-7).** Discover, Likes, Matches, Chats, Available Now, the Casual profile, Requests, Saved and blocked lists.
- **Every staff change is logged (BR-34).**
- **Validation and money rules:**
  - settings are checked before saving;
  - the extension cap and refunds behave correctly;
  - staff management follows its rules;
  - the export contains no file locations;
  - the purge removes the right things and keeps the right things.

The new browser tests walk through:

- an admin using every screen;
- a super admin creating a moderator, who signs in with the authenticator, changes the password and is then promoted and turned off;
- a member downloading their data and deleting their account.

### Problems found and fixed during self-audit

There were 4 review rounds; the fourth was clean.

**Round 1.**

- 🔴 A deleted member could keep being charged by card. Their card plan is now stopped first.
- 🔴 The purge would have erased reports made against the member. Reports are now kept, and the purge waits until open reports are decided.
- 🟠 An admin could raise their own extension cap.
- 🟠 Some settings could be saved with values that would break payments or messaging.
- 🟠 Extending a card plan would have been undone at its next renewal.
- 🟠 Editing a plan could break card checkouts or claims already waiting.
- Smaller fixes:
  - a recorded refund now stops card renewals straight away;
  - links to a payment or subscription outside the current list now open it;
  - forms keep what you typed when there's an error;
  - staff password changes are logged;
  - deleted members no longer show in blocked lists or exports;
  - analytics no longer count refunded passes.

**Round 2.**

- 🔴 My round-1 form change could have put a typed password into the web address on a slow connection. Forms now always submit as a POST.
- 🟠 A checkout paid after deletion still gave access. The charge now goes on the refund list.
- 🟠 An old card plan could block deleting an account forever. Only plans that can still renew are now stopped.
- 🟠 A deleted account couldn't be banned from the console, so its phone could register again. It can now be banned (Q54).
- Smaller fixes: zero allowed where it means "none", and the photo minimum can't exceed the photo maximum.

**Round 3.**

- 🟠 Opening a report about a purged member crashed the page.

**Round 4.** Clean.

### Known limitations / not verified

- Report categories are a fixed list. Changing them needs a release.
- Abandoned sign-ups that never finished verification aren't purged yet. That comes in Phase 12.
- A mobile money claim left waiting when its member deletes their account has to be rejected and refunded by hand (Q57).
- New staff get a one-time temporary password on screen; email invitations aren't built.
- Card cancellation is only tested against the fake processor. A real one must treat "already cancelled" as success; that contract is written into the code.

### Your tasks

- 🔴 **Blocking:** none.
- 🟠 **Needed to fully test:** OD-7 retention, the OD-30 cap and the export limit (T-19), below.
- 🟢 **Before launch:**
  - T-27: `CRON_SECRET`. It now also covers the purge job.
  - T-07: your first staff list. Once a super admin exists, they create the others on the Staff page.
- ↪ **Carried over:**
  - T-15: OD-13 refund policy.
  - T-18: card decisions.
  - OD-8 and OD-9.
  - T-19: limits.
  - T-22: create `main`.
  - T-28: turn off public Realtime access.
  - T-29: prices, retention and transaction formats.

### Decisions I need from you

- **OD-7: how long after deletion to purge.**
  - I recommend 30 days.
  - Local testing uses 30.
  - Setting: `account.deletion_purge_days` (super admin only).
- **OD-30: most days an admin can add to one pass, in total.**
  - I recommend 7 days.
  - The allowed range is 1–30.
- **T-19: data downloads per member per day.** I recommend 5.
- **OD-13: refund policy.** This is still open. The tools are built; when to refund is your call.
- **Sign-off on Q48–Q57.**
  - Q48: moderators see only the queues on the Dashboard.
  - Q49: how recording a refund works.
  - Q50: which settings are super-admin only.
  - Q51: new staff and the temporary password.
  - Q52: what deleting an account does.
  - Q53: what the data download contains.
  - Q54: a deleted account can still be banned. This is the one to look at closely: §8 doesn't list it.
  - Q55: extension rules.
  - Q56: plan rules.
  - Q57: claims waiting when a member deletes.

### Next: Phase 11 — Notifications

This phase covers:

- the Notifications screen;
- alerts for new requests, matches and messages, review outcomes, claim decisions, a pass about to expire and card renewal reminders;
- per-member preferences;
- in-app notifications, plus web push once you add the keys (T-20).

You asked me to continue automatically, so I'm starting it now.

### Whole-app progress

100 items done, 19 in progress, 11 not started and 6 blocked. See `docs/progress/TODO.md`.
