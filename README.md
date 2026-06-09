# brew-crm

**Brew** — an AI-native Mini CRM for a D2C coffee chain. This is **Repo A**: the Next.js
UI + CRM API routes. The separate channel-simulation service is in
[`brew-channel`](../brew-channel).

> Most CRMs make the marketer do the thinking. Brew flips it: state a goal in plain English,
> an AI agent reasons over real shopper data, proposes a campaign with a visible reasoning
> trace, executes it, watches the receipts, and proposes the next campaign.

## Stack
Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 · Drizzle ORM · Neon Postgres ·
Gemini 2.0 Flash (runtime LLM, free) with Groq fallback.

## Quickstart
```bash
pnpm install
cp .env.example .env        # fill DATABASE_URL etc.
pnpm db:migrate             # apply schema to Neon
pnpm seed                   # storytelling coffee data
pnpm dev
```

## Scripts
| Command | Purpose |
|---|---|
| `pnpm dev` | local dev server |
| `pnpm build` | production build |
| `pnpm db:generate` | generate migration from `lib/db/schema.ts` |
| `pnpm db:migrate` | apply migrations |
| `pnpm seed` | seed data |

Full architecture, ADRs, and AI-workflow notes land in `docs/` (Day 6).
