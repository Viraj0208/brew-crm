# Brew — an AI-native Mini CRM for a D2C coffee brand

State a marketing goal in plain English. An agent plans a campaign against real
customer data (with a visible reasoning trace), you approve it, it launches over
a reliability-grade channel pipeline, you watch the delivery funnel fill live,
and the agent proposes the next campaign from the results.

Built for the Xeno take-home. Ships **$0** on free tiers.

- **Live app:** https://brew-crm.vercel.app
- **Channel service:** https://brew-channel.onrender.com
- **Repos:** [brew-crm](https://github.com/Viraj0208/brew-crm) (this) · [brew-channel](https://github.com/Viraj0208/brew-channel)

## The two things worth grading

This deliberately concentrates all engineering depth in **two systems** and keeps
everything else (CRUD, UI) intentionally minimal.

### 1. System star — the channel callback loop (reliability)
`POST /campaigns/:id/send` returns **202** and enqueues an `outbox` row per
recipient; it never calls the channel inline. A worker drains the outbox to the
separate channel service, which simulates per-channel lifecycles and fires
**deliberately out-of-order** callbacks to `/api/receipts`. Receipts are
**idempotent** (dedupe on `event_id`), **ordered** (a monotonic-rank state
machine under `SELECT FOR UPDATE` never lets a late `delivered` overtake `read`),
and **poison-tolerant** (malformed/unknown events → `dead_letter` + 200). Failed
sends retry with exponential backoff, then dead-letter.

### 2. Product star — the agentic learning loop
A goal drives a Gemini function-calling loop over six tools that return **real
ids and counts** (`query_customers → create_segment → pick_channel →
draft_message`). The plan + full reasoning trace are shown for human approval
(edit any field), then executed. The agent monitors the funnel and **proposes
the next campaign** from the actual results — the differentiator.

## Quickstart (local)

```bash
pnpm install
# bring up a local Postgres (or point DATABASE_URL at Neon)
docker run -d --name brew-pg -p 5433:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=brew postgres:16
cp .env.example .env            # fill DATABASE_URL + secrets + LLM keys
pnpm db:migrate
pnpm seed                       # 42 storytelling customers + 3 opinionated segments
pnpm dev                        # http://localhost:3000
pnpm test                       # 38 unit tests (state machine, outbox, funnel, agent loop, guards)
```

Run the channel service ([brew-channel](https://github.com/Viraj0208/brew-channel))
alongside it and set `CHANNEL_URL` + matching `WORKER_SECRET`.

## Environment

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string |
| `CHANNEL_URL` | base URL of the channel service |
| `CRM_PUBLIC_URL` | this app's public URL (callbacks + worker kick) |
| `WORKER_SECRET` | shared secret guarding `/worker` and the channel `/send` |
| `CRON_SECRET` | on Vercel, set equal to `WORKER_SECRET` (Cron sends it as Bearer) |
| `LLM_PROVIDER` | `gemini` (default) |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | free AI Studio key · `gemini-2.0-flash` |
| `LLM_FALLBACK` / `GROQ_API_KEY` / `GROQ_MODEL` | `groq` · free key · `llama-3.3-70b-versatile` |
| `LLM_MAX_TOOL_CALLS` | tool-call budget per plan (default 8) |

**Runtime LLM is locked to Gemini free (Groq free fallback).** Claude/OpenAI are
dev-time build tools only — never imported into shipped code. The product runs $0.

## Demo script (≈90s)

1. **/agent** → type *"Win back lapsed espresso drinkers who haven't ordered in over a month"* → **Plan**.
2. Watch the reasoning trace: `query_customers → create_segment → pick_channel → draft_message`. Real segment, real count.
3. Tweak the channel/message → **Approve & launch**.
4. The funnel fills live (sent → delivered → opened → read → clicked). **/worker** shows outbox + dead-letter counts.
5. **Propose next campaign** → the agent diagnoses the result and proposes the next goal. Click to load it.

## Scripts
| Command | Purpose |
|---|---|
| `pnpm dev` | local dev server |
| `pnpm build` | production build |
| `pnpm test` | unit tests |
| `pnpm db:generate` | generate a migration from `lib/db/schema.ts` |
| `pnpm db:migrate` | apply migrations |
| `pnpm seed` | seed storytelling data + 3 segments |

## Docs
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system diagram, the two loops, state machine, queries
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — ADRs
- [`docs/AI_WORKFLOW.md`](docs/AI_WORKFLOW.md) — how the app was built with AI (graded axis)

## Stack
Next.js 15 (App Router) · React 19 · TypeScript · Drizzle ORM · Postgres (Neon) ·
Tailwind v4 · Vercel. Channel service: Hono on Node (Render).
