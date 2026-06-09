# brew-crm — Claude Code context

**Brew** = AI-native Mini CRM for a D2C coffee chain (Xeno take-home). This repo is
**Repo A**: the Next.js UI + CRM API routes (App Router co-locates them). Deploys to Vercel.
The separate channel-simulation service lives in the `brew-channel` repo.

## Runtime LLM lock (DO NOT VIOLATE)
The deployed product runs on **Gemini 2.0 Flash free tier** (default) with **Groq
Llama-3.3-70B free** as fallback. Selected via `LLM_PROVIDER` env. Claude / OpenAI APIs
are **NOT** available at runtime (no API credits) — they are dev-time build tools only and
must never be imported into shipped code. The product ships $0.

## Stack
- Next.js **15.5.19** (App Router, stable — NOT 16 preview), React 19, TypeScript, Tailwind v4
- Drizzle ORM + Neon serverless Postgres (use the **pooled** connection string)
- pnpm

## Conventions
- Schema is the source of truth: `lib/db/schema.ts`. After editing, run `pnpm db:generate`.
- Pure domain logic (state machine, segment eval, attribution, funnel) lives in `lib/domain/`
  and must be unit-testable without a DB.
- API routes return fast: `/send` returns 202 + enqueues; `/receipts` returns 200 even on
  poison (route to dead_letter). Never make the channel retry a poison event forever.
- Conventional-commit messages. No AI co-author attribution in commits.

## Commands
- `pnpm dev` — local dev server
- `pnpm build` — production build (must pass before deploy)
- `pnpm lint` — eslint
- `pnpm db:generate` — generate migration from schema
- `pnpm db:migrate` — apply migrations to DATABASE_URL
- `pnpm seed` — seed storytelling coffee data

## Architecture pointers
- Two star systems: the **agentic loop** (`lib/agent/`) and the **channel callback loop**
  (`lib/queue/outbox.ts` + `lib/domain/stateMachine.ts` + `app/api/receipts`).
- Everything else (CRUD) is intentionally minimal.
- See `Xeno-Mini-CRM-Plan.md` in the parent workspace for the full build plan.
