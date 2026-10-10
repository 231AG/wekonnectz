## Phase 8 — Availability: COMPLETE

### ⛔ Blockers

None.

### What I built

- **Availability screen (mock-up 08):**
  - "Available now" until a time you choose.
  - Schedule a future window.
  - Pause (hidden, window kept), Resume and Leave the pool.
  - "Who can send you requests": Anyone in the pool, or Nobody.
  - All times are Liberia time (GMT).
- **Who can go available:** an active, verified member with 3 approved photos (including the main photo), Casual turned on, and an active pass. If something is missing, the screen says what and links to the fix. It never mentions reports.
- **Pool membership is worked out at the moment it's needed.** A member leaves the pool straight away when:
  - their window ends;
  - their pass runs out;
  - they are suspended or hidden after reports (including an under-18 report);
  - they drop below 3 approved photos;
  - they choose Nobody.
- **One window at a time.** Changing the end of a live window keeps it as the same window.
- **Refused windows:**
  - Longer than the cap (OD-8).
  - Too far ahead (OD-8).
  - Starting after the pass ends.
  - Changed too often in an hour.
- **Home card:** "Available until 11 PM", "Scheduled from…", "Paused" or "Not in the pool right now". The Casual page links to Availability.
- **Daily tidy job:** `/api/cron/availability`, at 03:47 GMT.
- **Behaviour flag (§17):** members who keep opening short windows are flagged for review. It counts the time actually spent in the pool.
- **Privacy:** no other member's availability is ever readable outside the pool, and no location is stored anywhere.

### Screenshots

In `docs/progress/phase-08/screenshots/`; compare with mock-up `member/08`.

- `member-availability-no-pass.png`
- `member-availability-now.png`
- `member-availability-paused.png`
- `member-availability-schedule.png`
- `member-home-available.png`

### How I checked it

| Check                                                | Result                                  |
| ---------------------------------------------------- | --------------------------------------- |
| Unit tests                                           | 539 passed                              |
| Database tests                                       | 761 passed, 70 of them for availability |
| Browser tests                                        | 62 passed                               |
| Build, lint, type, format, client-bundle secret scan | Clean                                   |

The database tests include:

- A time-travel test: a pass that ends mid-window removes the member at once.
- A REJECTED verification (BR-15).
- A schema-wide check that no location column exists (BR-20).
- Proof that the server key itself can't read the availability table (BR-19).

### Problems found and fixed during self-audit

Four review rounds; the fourth is still running and I'll add its result here.

- **Round 1:**
  - The daily tidy wiped scheduled windows of members who were only briefly ineligible.
  - Leaving early dodged the short-window flag, and editing a live window caused false flags.
  - Home could show a "Scheduled from" time that had already passed.
  - A window starting after the pass ended was accepted and shown as saved.
  - Resume was shown to members who couldn't use it.
  - Pause and Leave lacked locks.
  - A just-passed time was silently read as tomorrow.
  - Changes weren't rate-limited.
- **Round 2:**
  - Changing the end of a paused window quietly put the member back in the pool.
  - The change limit blocked edits to a live window.
- **Round 3:** my round-2 exemption for replaced windows let members hide short stints. I removed it.

### Known limitations / not verified

- The Available Now pool itself comes in Phase 9.
- A window kept paused until it ends doesn't count as a short window.
- The tidy job runs daily (Vercel Cron). Access itself is decided live, so this is bookkeeping only.

### Your tasks

- 🔴 **Blocking:** none.
- 🟠 **Needed to fully test:** approve the OD-8 values and the T-19 availability values (below).
- 🟢 **Before launch:**
  - Set `CRON_SECRET` in Vercel (T-27). It covers the new availability job too.
- ↪ **Carried over:** T-18, T-19, T-22, T-27, T-28, T-29.

### Decisions I need from you

- **OD-8 — longest window and lead time.** Recommended: 12 hours, 7 days ahead. Settings: `availability.max_window_hours`, `availability.max_lead_days`.
- **T-19 — short-window flag.** Recommended: windows under 30 minutes, 5 times in 24 hours. Settings: `availability.short_window_minutes`, `availability.short_windows_per_day`.
- **T-19 — window changes per hour.** Recommended: 30. Setting: `availability.max_changes_per_hour`.
- **Sign-off: Q40–Q43.** These cover:
  - The window rules.
  - Nobody hides you from the pool.
  - How short windows are counted.
  - The cap applies per window, not per day.

### Next: Phase 9 — Casual discovery & requests

The Available Now grid with filters, Casual member profiles, message requests (accept, decline, block), the Saved list, and read-only Casual chats without a pass.

### Whole-app progress

82 items done, 17 in progress, 28 not started, 8 blocked. See `docs/progress/TODO.md`.
