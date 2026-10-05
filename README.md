# WeKonnectz

Verified, adults-only (18+) connection platform for Liberia. Next.js + Supabase.

- Build spec (source of truth): `docs/spec/WeKonnectz_MVP_Build_Spec_v3.pdf`
- Master plan: `docs/plan/MASTER_PLAN.md`
- Progress: `docs/progress/TODO.md` · Owner tasks: `docs/progress/OWNER_TASKS.md`
- Agent and developer guide (stack, commands, rules): `CLAUDE.md`

## Quick start

Requires Node 22, pnpm 10, Docker.

```bash
pnpm install
pnpm db:start        # local Supabase
pnpm dev             # http://localhost:3000
```

Checks: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:db && pnpm build && pnpm check:bundle && pnpm test:e2e`.
