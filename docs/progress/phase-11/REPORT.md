## Phase 11 — Notifications: COMPLETE

### ⛔ Blockers

None. Phone (web push) notifications are built and switch on once you add the keys (T-20).

### What I built

**Notifications screen.** The bell on Home (as in mock-up 01) shows how many are unread. It opens a list, newest first, with a dot on new ones. Opening the list marks them read, and each notice opens the right screen.

**Members are told about:**

- a new message request, and when their own request is accepted;
- a match;
- new messages — one notice per chat ("3 new messages"), cleared when they read the chat;
- verification and photo outcomes, and payment approved / rejected / needs info (these existed already and now show in the list);
- a Casual pass about to end, and a card plan about to renew. These come from a new daily job at 09:07 Liberia time, so nobody is woken at night. Each is sent once, and a stacked pass counts as access continuing.

**Privacy.**

- No notice names another member or shows what anyone wrote, in the app or on a phone's lock screen.
- A declined request is never notified.
- Deleted or banned accounts get nothing.
- When a chat closes or a request ends, its notices go with it.

**Settings.** Four switches, all on by default: message requests, matches, messages, reminders. Account, verification and payment updates are always sent.

**Phone notifications (web push).**

- "Turn on phone notifications" in Settings → Notifications.
- They are sent straight after the action that caused them.
- Only real browser push services are used.
- Signing out stops them on that phone, so a shared phone never shows the previous person's notices.
- Until you add the keys, the screen says phone notifications aren't available yet.

### Screenshots

All in `docs/progress/phase-11/screenshots/` (no mock-up exists for the list, so I designed it in the same style):

- `member-home-bell.png`
- `member-notifications.png`
- `member-notifications-empty.png`
- `member-notification-settings.png`

### How I checked it

| Check                                                          | Result                                |
| -------------------------------------------------------------- | ------------------------------------- |
| Unit tests                                                     | 561 passed                            |
| Database tests                                                 | 1,048 passed, 48 of them for Phase 11 |
| End-to-end tests                                               | 68 passed, 2 of them new              |
| Build, lint, type and format checks; client-bundle secret scan | Clean                                 |

The database tests cover:

- every trigger, and that notices carry no text and no names;
- declines staying private;
- deleted accounts getting nothing;
- preferences;
- reminders being sent once and respecting stacked passes;
- the push queue: sent once, retried after a failure, and only to real push services.

The browser test walks through:

- a match and messages appearing under the bell;
- opening a notice into the chat;
- turning messages off.

### Problems found and fixed during self-audit

There were 3 review rounds; the third was a confirmation.

**Round 1.**

- 🟠 After the first push, later messages in the same chat were never pushed.
- 🟠 A member could register a fake push address. That could stall delivery for everyone, or make our server call any web address. Only real push services are now accepted, sends time out, and failures are retried.
- 🟠 Reminders could be skipped completely with a short warning time. They now have their own job, a 24-hour minimum and an hour of slack.
- 🟠 A shared phone kept getting the previous member's notices. Signing out now stops push on that phone.
- Smaller fixes:
  - closed chats and finished requests clear their notices;
  - older account notices skip deleted accounts;
  - the phone only opens our own pages.

**Round 2.**

- 🟠 Clearing notices scanned the whole table each time. Two indexes fix that.
- A busy chat now pushes at most every two minutes.

**Round 3.** Confirmation.

### Known limitations / not verified

- **Real phone delivery isn't tested here.** It needs the keys and a real browser push service. Unit tests cover the payload and the address checks.
- **On iPhone,** phone notifications only work after adding WeKonnectz to the Home Screen; the screen says so. Phase 12 adds the app install.
- **Members still being reviewed** see their review notices on the waiting screen and by push, not in the list.
- **The list shows the latest 50.** Opening it marks all as read.
- **A message within two minutes of a push,** with nothing after it, shows in the app but isn't pushed on its own (anti-buzz throttle).

### Your tasks

- 🔴 **Blocking:** none.
- 🟠 **To turn on phone notifications:** T-20, the web push keys. Steps are in `OWNER_TASKS.md`; put the keys in Vercel, never in chat.
- 🟢 **Before launch:** T-27. `CRON_SECRET` now also covers the reminders job.
- ↪ **Carried over:**
  - OD-7, OD-30 and OD-13.
  - T-15, T-18, T-19, T-22, T-28 and T-29.

### Decisions I need from you

- **T-19: how long before a pass ends to remind members.**
  - I recommend 24 hours.
  - The allowed range is 24–168.
  - Local testing uses 24.
- **Sign-off on Q58–Q61:**
  - Q58: notices never name anyone.
  - Q59: the four switches.
  - Q60: one notice per chat.
  - Q61: reminder timing.

### Next: Phase 12 — Hardening & launch

- A full security test pass.
- Security headers with a strict content policy.
- A rate-limit review and a dependency audit.
- A backup restore drill (needs T-08).
- App install and offline screen.
- An accessibility pass.
- Legal sign-off (T-12).

**This finishes the run you asked for (Phases 10 and 11).** Reply "Start Phase 12" to continue.

### Whole-app progress

103 items done, 19 in progress, 8 not started and 6 blocked. See `docs/progress/TODO.md`.
