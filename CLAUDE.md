@AGENTS.md

# WeKonnectz — agent guide

Verified, adults-only (18+) connection platform for Liberia. Spec: `docs/spec/WeKonnectz_MVP_Build_Spec_v3.pdf` (**source of truth**). Plan: `docs/plan/MASTER_PLAN.md`. Owner workflow: `PROMPT.md`.

**Current phase:** Phase 9 — Casual discovery & requests, complete (see `docs/sprints/SPRINT-09.md`). Next: Phase 10 — Admin console (complete) + account lifecycle; waiting for owner go-ahead.

## Stack (pinned exactly; record changes here)

| Package                               | Version           | Notes                                                                                                                                                  |
| ------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node                                  | 22 LTS            |                                                                                                                                                        |
| pnpm                                  | 10.28.0           | `packageManager` field                                                                                                                                 |
| next                                  | 16.3.8            | App Router, Turbopack. **Read `node_modules/next/dist/docs/` before using an API** — v16 differs from older versions (e.g. `middleware` → `proxy.ts`). |
| react / react-dom                     | 19.3.0            |                                                                                                                                                        |
| typescript                            | 6.0.3             | `strict: true`. TS 7.0 not used: typescript-eslint supports `<6.1`.                                                                                    |
| tailwindcss / @tailwindcss/postcss    | 4.3.3             | Tokens in `app/globals.css`                                                                                                                            |
| shadcn/ui conventions                 | `components.json` | Primitives in `components/ui`. Deps: radix-ui 1.6.7, class-variance-authority 0.7.1, clsx 2.1.1, tailwind-merge 3.7.0, lucide-react 1.52.0             |
| zod                                   | 4.6.5             | One schema per form, reused on the server                                                                                                              |
| @supabase/supabase-js / @supabase/ssr | 2.117.2 / 0.12.7  |                                                                                                                                                        |
| supabase (CLI)                        | 2.119.0           | dev dependency; local stack needs Docker                                                                                                               |
| @sentry/nextjs                        | 11.4.0            | Disabled until a DSN is set                                                                                                                            |
| vitest / @playwright/test             | 5.0.3 / 1.63.0    |                                                                                                                                                        |
| eslint / eslint-config-next           | 9.39.5 / 16.3.8   | ESLint 10 not used: React plugins don't support it yet                                                                                                 |
| prettier                              | 3.9.9             | printWidth 120                                                                                                                                         |

Also installed: libphonenumber-js 1.13.14 (Phase 1, +231 validation), sharp 0.35.5 (Phase 3, image processing).

Planned, not yet installed (added in the phase that needs them, with a reason in the commit): react-hook-form, @tanstack/react-query, framer-motion.

## Commands

```bash
pnpm install
pnpm db:start            # writes gitignored supabase/.env + .env.local (random dev secrets), starts local Supabase (Docker)
pnpm env:setup           # re-create/refresh .env.local and supabase/.env without printing secrets
pnpm db:reset            # re-apply migrations + supabase/seed.sql
pnpm db:types            # regenerate lib/supabase/database.types.ts — run after EVERY migration
pnpm admin:create-first --email you@x [--env-file F]   # first SUPER_ADMIN (hidden password prompt; once only)
pnpm dev                 # http://localhost:3000 ; ENABLE_UI_KIT=1 pnpm dev for /ui-kit
pnpm lint | pnpm typecheck | pnpm format:check
pnpm test                # Vitest unit tests (tests/unit)
pnpm test:db             # pgTAP (supabase/tests/database) — needs db:start
pnpm build && pnpm check:bundle   # production build + client-bundle secret scan
pnpm test:e2e            # Playwright against `next start` on port 3000 (build first; stop `pnpm dev`). Uses the local Supabase
                         # stack; OTP codes come from the fake SMS outbox (.dev-sms-outbox/). Cloud: PW_CHROMIUM_PATH is set by the hook.
```

New migration: `pnpm exec supabase migration new <name>` → write SQL (table + RLS + policies + tests together) → `pnpm db:reset` → `pnpm db:types` → `pnpm test:db`.

## Folder conventions

```
app/(public) (onboarding) (member) admin api   routes and UI only — no business logic in components
components/ui/          shared primitives (only component library)
lib/domain/             pure business rules — NO next/* or supabase imports (reused by mobile later)
lib/validation/         Zod schemas
lib/auth, lib/permissions   session, role + MFA checks; first call in every server action
lib/payments/claims, lib/payments/card
lib/storage/            upload pipeline, signed URLs — `import "server-only"`
lib/supabase/           clients; admin client is `server-only`; database.types.ts is generated
lib/observability/      Sentry options + PII scrubber
lib/security/           headers
supabase/migrations/    the ONLY way the schema changes
supabase/tests/database pgTAP
supabase/seed.sql       fictional data + clearly labelled DEV-ONLY settings
tests/unit, tests/e2e
docs/                   BUSINESS_RULES, DATA_MODEL, SECURITY, DECISIONS, sprints/, plan/, progress/
```

## Hard rules (spec §6 + owner prompt)

1. One phase at a time. Finish: tests, acceptance checklist, phase report, then **stop** for owner go-ahead.
2. Never create a table without enabling RLS and writing explicit policies in the same migration. (`000_rls_guard.test.sql` fails otherwise.)
3. Service-role key only in modules marked `import "server-only"`. Never `NEXT_PUBLIC_*` for secrets.
4. Never decide entitlement (Casual access, availability, verification, role) from client state.
5. Never return a storage path to the client. Signed URL only after an access check.
6. Every sensitive staff mutation writes `audit_logs` in the same transaction (call `audit()` inside the DB function).
7. Never log phone numbers, dates of birth, selfie/storage paths or message text.
8. No new dependency without a one-line reason in the commit message.
9. `[DECISION]`/`[VERIFY]` values: stop and ask. Use `app_settings` keys with **no value**; `get_setting()` raises. DEV-ONLY values only in `supabase/seed.sql`.
10. Each business rule touched gets a test that names its number (e.g. `it("BR-26 …")`).
11. Mobile money Casual access is created only by `approve_payment_claim()`, called from an admin action.
12. Never build spec §24: WhatsApp, coins/wallet, vouchers, automatic/AI claim approval, recurring mobile money, images/voice/links in chat, GPS.
13. Secrets: never commit `.env*` (except `.env.example`), never print secret values, never ask the owner to paste keys in chat.
14. Seed/test data: fictional people only. AI-generated mock-up photos in `docs/mockups/html/images/` may be used.

## Design

Dark only. Tokens v1 in `app/globals.css` (mock-up neutrals + logo accents: primary gradient `#FF9A03 → #F9315F`, Relationship `#C78BFF`, Casual `#FFA24C`, Verified `#8EB0FF`, Pending `#E3C28E`). Display font Sora 600/700, body Manrope 400–700. Touch targets ≥ 44 px. Contrast ≥ 4.5:1 (`tests/unit/tokens.test.ts`). Match `docs/mockups/` closely; where they conflict with the spec, the spec wins.

## Delivery

One draft PR per phase into `main` (OD-32). Develop on the designated session branch; after a phase PR merges, restart the branch from `main`.
