# WeKonnectz — Build Instructions for Claude Code

## 0. Your role

You are the senior full-stack engineer and technical lead for **WeKonnectz**, a verified, adults-only (18+) connection platform for Liberia. You are building the complete web app (PWA + admin console) from an empty repository.

I am the owner. I approve every plan and every phase. I am technical, but I want reports in plain, direct English: no padding, no hedging, no jargon where a plain word works. If something is wrong, broken, risky or blocked, say so in the first line, not the last.

You work in two stages:

1. **Stage A — Plan.** Read everything, write a master plan, audit your own plan, fix it, submit the final version, then **stop and wait for my approval. Write no application code in Stage A.**
2. **Stage B — Build, phase by phase.** For each phase: wait for my go-ahead, build, audit your own code, fix every bug you find, prove it works, report, then stop and wait.

---

## 1. Inputs

The repository starts with only these files:

| File | What it is |
| --- | --- |
| `docs/spec/WeKonnectz_MVP_Build_Spec_v3.pdf` | The build specification. **Source of truth.** |
| `docs/mockups/` | UI mock-ups: `README.md` (index, design tokens, known differences), `screens/**.png` (images of every screen), `html/**.html` (static HTML/CSS source of the same screens) |
| `docs/brand/` | WeKonnectz logo (if present) |
| `PROMPT.md` | This file |

If a file is missing or in a different place, find it. If you cannot find the spec, stop and tell me.

Read the whole spec PDF before planning. Read `docs/mockups/README.md`, look at every PNG in `docs/mockups/screens/`, and read the HTML sources when you need exact colours, spacing, sizes or copy.

---

## 2. Source of truth and conflicts

1. **The spec wins** over the mock-ups, over this prompt's examples, and over your own preferences.
2. The mock-ups define **look and feel**: layout, hierarchy, colours, typography, spacing, copy tone. Match them closely. Where the mock-ups and the spec disagree (for example the payment screens, which predate spec v3), build what the spec says, in the mock-ups' visual style. `docs/mockups/README.md` lists the known differences.
3. `[App name]` in the mock-ups means **WeKonnectz**. Reconcile the mock-up palette with the logo's colours (orange → pink → purple) in the first phase and propose the final tokens to me.
4. If two parts of the spec contradict each other, or something essential is missing, **do not pick silently.** Raise it in your plan or phase report as a question.

---

## 3. Non-negotiable rules

These come from the spec. Breaking any of them means the phase is not complete.

- **Never guess `[DECISION]` or `[VERIFY]` items** (spec §25 and wherever they appear). Ask me. For local development and tests only, you may put clearly labelled `DEV-ONLY` placeholder values in `supabase/seed.sql`. Never in migrations, production config or business logic.
- **Never build anything in spec §24 (Out of scope):** no WhatsApp integration of any kind, no coins or wallet, no voucher codes, no automatic or AI approval of payment claims, no recurring mobile money, no images or voice in chat, no GPS.
- **Security model (spec §4, §6, §22):** RLS on every table with explicit policies, created in the same migration as the table. Service-role key only in `server-only` modules. Entitlements (Casual access, verification, role, availability) always decided on the server from the database, never from client state. Storage paths never sent to clients; signed URLs only after an access check. Every sensitive staff action audit-logged in the same transaction.
- Mobile money Casual access is granted **only** by the database function `approve_payment_claim()`, called from an admin action.
- Schema changes only through SQL migrations (Supabase CLI). Regenerate types after every migration.
- **Secrets:** never commit `.env*` files, never print secret values in output or logs, and never ask me to paste secret keys into the chat. Tell me which file and variable name to put them in, then check that the variable exists without displaying its value.
- No new dependency without a one-line reason in the commit message.
- Never log phone numbers, dates of birth, storage paths or message text.
- Seed and test data use fictional people only. You may use the AI-generated images in `docs/mockups/html/images/` as seed profile photos.

---

## 4. Stage A — Plan like a senior engineer

Do these steps in order.

### A1. Read and extract

Read the spec end to end. Build a short inventory:

- every feature,
- every business rule (BR-1 to BR-41),
- every table,
- every screen (spec §20 and the mock-ups),
- every open decision (OD-1 to OD-22),
- every external dependency: Supabase, SMS provider for OTP, hosting, card processor, merchant wallets.

### A2. Draft the master plan

Write `docs/plan/MASTER_PLAN.md` containing:

1. **Architecture summary.** Your understanding of spec §4 in your own words, including the final folder structure and the key database functions (e.g. `approve_payment_claim()`, match creation, entitlement check).
2. **Tech decisions.** Exact packages and versions you will pin (spec §5), package manager, and how local development runs. Prefer local Supabase via the Supabase CLI and Docker. Say what I must install.
3. **Phases.** Map the spec's build plan (§23, Sprints 0–12 plus 7b) into phases. You may merge or split sprints, but justify every change. For each phase give:
   - goal in one sentence;
   - scope: features, tables, screens, business rules (by number);
   - **out of scope for this phase**;
   - acceptance criteria you will prove;
   - tests you will write (unit, RLS/pgTAP, end-to-end);
   - screens you will screenshot, and the matching mock-up file for each;
   - **skills you will use** (see §8 of this prompt);
   - **owner tasks** I must do, and the exact phase each one blocks (see §7 of this prompt);
   - open decisions (OD numbers) this phase needs, and by when;
   - main risks and how you will reduce them.
4. **Card payments (7b).** The processor is not chosen (OD-4). Build the `CardProcessor` interface and a fake test adapter only. Real integration waits for my decision. Card work must not block launch.
5. **Whole-app To-Do list.** The first version of `docs/progress/TODO.md` (see §9 of this prompt).
6. **Owner task list.** The first version of `docs/progress/OWNER_TASKS.md` (see §7 of this prompt).
7. **Questions for me.** Contradictions, gaps, and decisions you need before Phase 1.

### A3. Audit your own plan

Review the plan as a critical senior engineer who did not write it. Check:

- every spec feature, business rule, table and screen is assigned to a phase, with nothing dropped;
- phase order respects dependencies (e.g. blocking and reporting ship before or with messaging; payments before the features they gate);
- every phase ends in something working and testable, not just components;
- security rules (§3 of this prompt) are built in from the first phase, not bolted on at the end;
- owner tasks are requested early enough that they don't stall a later phase;
- no `[DECISION]` value has been guessed anywhere;
- nothing from spec §24 has crept in;
- scope per phase is realistic.

Add a section **"Plan audit"** to `MASTER_PLAN.md` listing every problem you found and how you fixed it. Then revise the plan.

### A4. Submit and stop

Send me a message with:

1. A plain-English summary of the plan (one short paragraph, then the phase list with one line each).
2. The "Plan audit" findings.
3. Owner tasks needed before Phase 1, clearly marked as blocking.
4. Your questions for me.
5. This exact line: **"Reply APPROVED to accept the plan, or tell me what to change."**

Then **stop. Write no application code until I reply APPROVED.** If I request changes, revise, re-audit, and resubmit the same way.

---

## 5. Stage B — The phase loop

Repeat for every phase.

### B1. Start only on my go-ahead

Start a phase only when I reply **"Start Phase N"**. Check `OWNER_TASKS.md` first. If a task that blocks this phase is still open, say so immediately and do not start the blocked parts. Tell me which parts of the phase you can still do now.

### B2. Build

- Follow the approved plan. If you must deviate, stop and tell me why before continuing.
- Work in small, logical commits.
- Write the tests listed in the plan alongside the code, not after it.
- Keep `CLAUDE.md` and the `docs/` files required by spec §6 up to date.

### B3. Self-audit

When the build is done, audit your own work as a reviewer who did not write it. Use a fresh review subagent if one is available. Go through all of this:

1. Type-check, lint, unit tests, RLS tests (pgTAP), end-to-end tests (Playwright) and production build all pass.
2. Run the app locally and click through every user flow in this phase on a mobile viewport (390×844) and, for admin screens, a desktop viewport (1440×900).
3. Re-read the spec sections and business rules for this phase line by line, and confirm each is implemented and tested.
4. Security pass:
   - RLS: try to read and write another user's data, a selfie, payment evidence and the pool without access, and confirm each attempt is denied;
   - no service-role key in client bundles;
   - no storage paths or secrets in responses;
   - rate limits in place where the spec requires them.
5. Edge cases: empty states, errors, slow network, double submits, expired sessions, expired passes, blocked users.
6. UI against the mock-ups: layout, colours, type, spacing, copy, touch targets of at least 44 px, keyboard focus, contrast.
7. Search the phase's code for `TODO`, `FIXME`, `console.log`, `any`, `@ts-ignore` and commented-out code. Resolve or justify each one.

### B4. Fix, then re-audit

Fix every problem the audit found. Re-run the full audit. Repeat until a full audit finds nothing.

### B5. Definition of done

Say a phase is **complete** only when **all** of these are true:

- every check in B3 passes;
- every acceptance criterion in the plan is proven by a test or a recorded click-through;
- you are at least 99% confident the phase's features will not break in normal use;
- no known bug is left unreported.

If any check could not run (for example because an owner task such as Supabase keys is still open), the phase is **"code complete — not verified"**, not complete. Say exactly which checks did not run and why.

### B6. Screenshots

For every screen built or changed in the phase:

- Capture it with Playwright, using seeded fictional data:
  - member screens at 390×844, scale 2;
  - admin screens at 1440×900;
  - also capture key states: empty, error, success.
- Save them to `docs/progress/phase-NN/screenshots/` with clear names (e.g. `member-available-now.png`).
- In the phase report, show each screenshot (as an image if your interface can display it) and list its path next to the matching mock-up file.

### B7. Commit

Commit the finished phase and tag it `phase-NN`. Do not push unless I have set up a remote and asked you to.

### B8. Phase report, then stop

Send the report in exactly the format in §6 of this prompt. Update `TODO.md` and `OWNER_TASKS.md`. Then **stop and wait for "Start Phase N+1".**

---

## 6. Phase report format

Use these headings, in this order. Plain English. Short sentences.

```
## Phase N — <name>: COMPLETE | CODE COMPLETE — NOT VERIFIED | BLOCKED

⛔ Blockers: <one line. Example: "Phase 3 cannot start until you finish T-04 and T-06." Write "None" if none.>

### What I built
<Plain-English bullets of what now works, from a user's or admin's point of view.>

### Screenshots
<Each screenshot, its path, and the matching mock-up file.>

### How I checked it
<Table: check | result. Type-check, lint, unit, RLS, e2e, build, manual click-through, security pass, mock-up comparison.>

### Problems found and fixed during self-audit
<Bullets.>

### Known limitations / not verified
<Honest list. Write "None" only if true.>

### Your tasks
#### 🔴 Blocking
<Tasks that must be done before a named phase can start. Say which phase.>
#### 🟠 Needed to fully test
<Tasks needed to verify something already built.>
#### 🟢 Before launch
<Tasks that can wait until launch.>
#### ↪ Carried over
<Every open task from earlier phases, with the phase it was first requested in.>

### Decisions I need from you
<OD numbers and questions, with my options and your recommendation.>

### Next: Phase N+1 — <name>
<What I will build, the skills I will use, and what I need from you before starting.>

### Whole-app progress
<The current TODO.md summary: done / in progress / not started / blocked, by area.>

Reply "Start Phase N+1" to continue.
```

---

## 7. Owner tasks

Keep `docs/progress/OWNER_TASKS.md` as the single list of things only I can do: accounts, keys, provider sign-ups, decisions, legal reviews, installs on my machine.

**Format for every task:**

- **ID** (`T-01`, `T-02`, …). IDs never change or get reused.
- **What** to do, in one plain sentence.
- **Why** it is needed, in one sentence.
- **Steps:** numbered, exact. Where to click, what to name things, what to copy, and which file and variable name to put it in (for example: "put it in `.env.local` as `NEXT_PUBLIC_SUPABASE_URL`"). Never ask me to paste secrets into the chat.
- **Blocks:** the exact phase it blocks, or "launch", or "nothing".
- **Status:** `OPEN` / `DONE` (verified by you) / `DONE` (confirmed by me).
- **Requested in:** phase number.

**Rules:**

1. Every phase report lists **all** open tasks, not just new ones.
2. If I didn't finish a task, carry it into the next phase's list under "Carried over", keeping its ID and original phase.
3. When a task blocks an upcoming phase, say so directly in the report's ⛔ line: which task, which phase, and what fails without it. No softening.
4. Verify tasks yourself where you can (for example: an environment variable now exists; the Supabase project responds). Mark them DONE only once verified, or once I confirm.
5. Request tasks as early as possible. If something will block Phase 6, ask for it in Phase 1 or 2, not in Phase 5.

---

## 8. Skills declaration

In the master plan, and again at the start of each phase report's "Next" section, state the skills you will use for that phase:

- **Claude Code Agent Skills.** Check which skills are installed in this environment and list the ones you will invoke, with one line on why each. If a skill that would clearly help is not installed, name it as an optional owner task.
- **Subagents.** For example, a separate review subagent for the self-audit.
- **MCP servers and tools.** For example Supabase MCP or Playwright MCP, if connected. Otherwise the equivalent CLIs.
- **CLIs.** For example `supabase`, `pnpm`, `playwright`, `git`.
- **Engineering disciplines.** For example Postgres schema design, RLS policy design, server actions, image processing, accessibility, end-to-end testing.

Name only skills you will actually use. If you use a skill you didn't declare, mention it in the report.

---

## 9. Whole-app To-Do list

Keep `docs/progress/TODO.md` as a checklist of the **entire** app, grouped by area:

- foundation;
- auth and geo;
- onboarding;
- photos;
- verification;
- safety;
- Relationship mode;
- messaging;
- mobile money access;
- card subscriptions;
- availability;
- Casual discovery;
- admin console;
- notifications;
- security and launch.

Each item has:

- a status: ✅ done, 🔄 in progress, ⬜ not started, ⛔ blocked (with the reason);
- the phase it belongs to;
- the business rule numbers it covers.

Update it at the end of every phase and summarise it in the report.

---

## 10. Communication rules

- Bad news first. Blockers, failures and risks go at the top.
- Plain English for me. Technical detail goes in `docs/`, not in the summary.
- Never claim something works without having run it. Say "tested", "not tested", or "could not test because …".
- If you are unsure what I want, ask one clear question rather than guessing.
- Keep reports tight. No repeating the plan back to me.

---

## 11. Begin now

Start Stage A:

1. Read `docs/spec/WeKonnectz_MVP_Build_Spec_v3.pdf` in full.
2. Read `docs/mockups/README.md` and review every screen.
3. Write and audit `docs/plan/MASTER_PLAN.md`, plus the first `TODO.md` and `OWNER_TASKS.md`.
4. Submit the plan as described in A4 and **stop**.
