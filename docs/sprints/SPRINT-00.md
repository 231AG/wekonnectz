# Sprint 00 — Foundation & agent docs

**Goal:** an empty-but-real app that builds, runs every kind of test locally and in CI, with the docs and rules in place.

## Scope

- Next.js 16 App Router, TypeScript strict, Tailwind 4, shadcn/ui conventions, design tokens v1 (mock-ups + logo), Sora/Manrope.
- Base primitives: Button, Input/Label, Card, Pill, Badge, BottomNav, StepHeader, AdminShell, Logo.
- Supabase CLI local stack; migration `foundation` (`app_settings`, `audit_logs`, `get_setting`, `audit`).
- Vitest, Playwright (390×844 @2x and 1440×900), pgTAP; GitHub Actions CI.
- Sentry with PII scrubber; baseline security headers; client-bundle secret check.
- CLAUDE.md, BUSINESS_RULES, DATA_MODEL, SECURITY, DECISIONS; session-start hook.

## Out of scope

Any feature screen, authentication, member data.

## Acceptance checklist

- [x] `pnpm lint`, `typecheck`, `test`, `test:db`, `test:e2e`, `build`, `check:bundle` pass locally
- [ ] Same checks pass in GitHub Actions (needs `main` branch + Actions enabled, T-03)
- [x] pgTAP: every public table has RLS enabled and ≥1 explicit policy
- [x] pgTAP: `audit_logs` append-only for every role; clients can't read/write it or call `audit()`
- [x] pgTAP: `get_setting()` raises on missing or undecided key; clients can't read settings
- [x] Bundle check passes on the real build and fails on a planted service_role JWT
- [x] Unit: PII scrubber (rule 7), token contrast ≥ 4.5:1, security headers
- [x] E2E: home renders, §22 headers present, UI kit controls ≥ 44 px, visible keyboard focus, admin nav hides Payments/Settings for moderators, no console/CSP errors
- [x] Screenshots in `docs/progress/phase-00/screenshots/`
- [ ] Owner sign-off on design tokens v1
