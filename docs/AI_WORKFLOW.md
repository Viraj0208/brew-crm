# AI-Native Development Workflow

How Brew was built. This is a graded axis distinct from the runtime LLM: these
tools BUILD the code and never run inside the deployed product (which is Gemini
free + Groq free only — see ADR-007).

## Division of labour

| Area | Owner | Why |
|---|---|---|
| Architecture, system design, ADRs, this plan | **Claude Code** | highest-leverage reasoning |
| The agent tool-use loop (`lib/agent/*`) | **Claude Code** | correctness-critical control flow |
| Reliability core: state machine + outbox/DLQ + receipts | **Claude Code** | the system star; must be exhaustively reasoned + tested |
| LLM provider abstraction (`lib/llm/*`) | **Claude Code** | dialect translation is subtle |
| Test strategy + reviews | **Claude Code** | tests gate everything |
| CRUD route handlers, Drizzle schema scaffolding | **Codex** | boilerplate |
| Seed-data generation, repetitive tests, UI shells | **Codex** | volume work |

## Direction → review → integration discipline

- **Plan-first, not vibe-coding.** Each component had a written spec/prompt before
  any code was generated (see `Xeno-Mini-CRM-Plan.md` in the workspace — §4 schema,
  §5 the two stars, §6 the agent design with the exact Gemini tool-calling quirks).
- **Test-first on the star paths.** `stateMachine.applyEvent` was built pure and
  test-first (15 cases: forward advance, out-of-order reject, duplicate no-op,
  failed-after-delivered ignored, clicked-before-delivered advances) before the
  `/receipts` route was wired.
- **Cross-review.** Claude Code reviewed the Codex-generated CRUD/seed; tests gate
  every path. 38 unit tests cover the state machine, outbox backoff, funnel
  assembly, the channel simulation, the callback retry, the agent loop (mock
  provider), and the hallucination guards.
- **Small reviewed commits**, never a giant unreviewed paste. Conventional-commit
  messages, each a coherent unit, **no AI co-author attribution** (clean history is
  graded).

## Concrete examples

1. **Verify on real infra, not the build.** The build went green but three
   prod-only bugs only showed up live: Vercel Hobby rejects sub-daily crons
   (`* * * * *` → `0 0 * * *`), Render's read-only FS broke `corepack enable`
   (dropped it; `pnpm install --prod=false`), and a fire-and-forget worker kick was
   killed when the serverless function froze after the 202 (fixed with
   `waitUntil(drainOutbox())`). Each was caught by sending a real campaign and
   watching the funnel, then committed as its own `fix(...)`.

2. **Designing around Gemini's tool-calling.** The spec captured the quirks up
   front — tool calls arrive as `functionCall` PARTS (not a top-level array),
   results go back as `functionResponse` parts correlated by name + order (no
   `tool_call_id`), schema is an OpenAPI subset (UPPERCASE types, no recursion).
   `GeminiProvider` isolates all of it; recursive `rule_json` is passed as a JSON
   string to fit the schema subset.

3. **Hallucination control as code.** Tools return real ids/counts; the message
   token allowlist and `launch_campaign`'s segment-existence check are unit-tested;
   the marketer approves before any send.

4. **Lazy DB client (ADR-009).** The first prod build failed with
   `DATABASE_URL is not set` during page-data collection. Fix: build the pool on
   first query via a proxy, verified by running `next build` with the var unset.

## Commit-history evidence
Both repos use conventional commits, each a coherent unit:
`feat(domain): comm state machine, funnel + attribution` ·
`feat(queue): postgres outbox + worker drainer` ·
`feat(api): receipts webhook + campaign send/stats` ·
`feat(llm): canonical provider abstraction with gemini + groq` ·
`feat(agent): 6 tools + planning tool-use loop + prompts` ·
`fix(queue): reliable serverless drain via waitUntil`.

## ~1-minute video narration (the build axis)
> "Brew was built plan-first. A written design doc fixed the schema, the two
> reliability/agent 'stars', and even Gemini's tool-calling quirks before any code.
> Claude Code owned the hard reasoning — the out-of-order state machine, the
> Postgres outbox/DLQ, the provider abstraction, and the agent loop — all
> test-first; Codex handled CRUD, schema scaffolding, seed, and UI shells. Every
> change is a small, reviewed, conventional commit with no AI co-author noise. And
> critically, correctness was proven by running the real thing: the build passed,
> but sending an actual campaign surfaced three production-only bugs — a Hobby cron
> limit, Render's read-only filesystem, and a serverless fire-and-forget that got
> frozen after the response — each fixed and re-verified live. The runtime itself
> ships $0 on Gemini free with a Groq fallback; Claude and Codex never run inside
> the product."
