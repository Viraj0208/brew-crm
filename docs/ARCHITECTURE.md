# Architecture

Two deployed services + Neon Postgres. All engineering depth lives in the two
"star" loops; everything else is intentionally thin.

## System diagram

```
            ┌──────────────────────────── brew-crm (Vercel, Next.js) ────────────────────────────┐
  marketer  │                                                                                     │
   ──goal──▶│  /agent ──▶ POST /api/agent/plan ──▶ agent loop (lib/agent/loop.ts)                 │
            │                 │  tools: query_customers, create_segment, pick_channel,            │
            │                 │         draft_message            (lib/agent/tools.ts)             │
            │                 ▼                                                                    │
            │            plan_json + reasoning_trace ──▶ approve ──▶ execute                       │
            │                                                          │                           │
            │                                          launch_campaign + dispatchCampaign          │
            │                                                          │                           │
            │   POST /api/campaigns/:id/send ──202──▶ communications + outbox rows (Postgres)      │
            │                                                          │  waitUntil(drainOutbox)   │
            │   POST /api/internal/worker (cron + kick) ──claim────────┤                           │
            │                                                          ▼                           │
            │                                              POST {CHANNEL_URL}/send ────────────┐   │
            │                                                                                  │   │
            │   POST /api/receipts ◀───────── out-of-order callbacks ───────────────────────┐ │   │
            │        idempotent + ordered + DLQ                                              │ │   │
            └────────────────────────────────────────────────────────────────────────────┼─┼───┘
                                                                                           │ │
            ┌──────────────────── brew-channel (Render, Hono) ──────────────────────────┐ │ │
            │  /send  dedupe on comm_id ──▶ simulate per-channel lifecycle              │◀┘ │
            │         (profiles + jitter, DELIBERATELY out-of-order) ──▶ callback ──────┼───┘
            │  /healthz                                with retry + backoff (callback.ts)│
            └───────────────────────────────────────────────────────────────────────────┘

                          Neon Postgres (pooled): customers · orders · order_items ·
                          segments · campaigns · communications · comm_events ·
                          outbox · dead_letter · agent_runs
```

## Why two services
The brief grades how volume, ordering, retries, and failures are handled. A
separate channel service with an HTTP callback is the honest way to exercise
that: the CRM cannot cheat by reaching into the channel's memory; it must handle
real out-of-order, retried, and poison callbacks over the wire. See ADR-001.

## System star — the channel callback loop

**Send path.** `POST /api/campaigns/:id/send` returns 202 immediately and, in one
transaction, materializes a `communications` row per opted-in segment member plus
an `outbox` row each, then flips the campaign to `live`. It does **not** call the
channel inline. The drain runs in the background via `waitUntil` (so it survives
the serverless function freezing after the response) and is also reachable as a
cron/kick at `/api/internal/worker`.

**Drain.** `drainOutbox()` claims due rows with `FOR UPDATE SKIP LOCKED` (so
parallel invocations never double-send), POSTs each to the channel `/send` with a
shared-secret header, and on success marks the outbox row `sent`. On failure it
increments attempts with exponential backoff (1s, 4s, 16s, …, capped) and after
`MAX_ATTEMPTS` writes a `dead_letter` row.

**Channel simulation.** `/send` dedupes on `comm_id`, then schedules a per-channel
lifecycle (WhatsApp/SMS/Email each have distinct deliver/open/read/click
probabilities and speeds). Jitter is added to each stage's emit time and the
events are **sorted by the jittered time**, so a later stage (e.g. `opened`) can
land on the wire before an earlier one (`delivered`). Callbacks POST to
`/api/receipts` with retry + exponential backoff; a permanently-unreachable CRM
drops to a channel-side dead log.

**The ordering guarantee (`lib/domain/stateMachine.ts`).** Each state has a
numeric rank:

```
queued=0  sent=1  delivered=2  failed=2  opened=3  read=4  clicked=5
```

An incoming event advances state **only if its target rank is strictly higher**
than the current rank. Equal/lower events are recorded for audit (`applied=false`)
but never regress state — a late `delivered(2)` arriving after `read(4)` is stored,
not demoted. `failed` only applies from rank ≤ 1 and is terminal (a later success
callback cannot resurrect it). `failed` and `delivered` share rank 2 so neither
overtakes the other. A higher event arriving first advances directly — gap-fill is
implicit because rank only moves up.

**Idempotency + ordering enforcement (`/api/receipts`).** Dedupe on
`comm_events.event_id UNIQUE` — a duplicate callback is a no-op. The insert-event +
conditional state-advance run in ONE transaction with `SELECT FOR UPDATE` on the
communication row, serializing concurrent callbacks per comm. Malformed payloads
and unknown `comm_id`s go to `dead_letter` and still return 200 — the channel is
never made to retry a poison event forever.

## Product star — the agentic loop

`runPlan(goal)` runs a provider-agnostic tool-use loop: send the goal + tool
declarations → execute every returned `functionCall` → feed `functionResponse`
back → repeat until the model returns a text-only plan or the tool-call budget
(8) is exhausted. Every step is captured into `reasoning_trace` (tool, input,
output, thought) and surfaced in the console as a timeline.

Tools return **real** ids/counts (`lib/agent/tools.ts`); the LLM never invents
customer ids. Recursive `rule_json` predicate trees are passed as JSON strings to
stay inside Gemini's OpenAPI schema subset. Message templates are validated
against a token allowlist (`{{first_name}}`, `{{name}}`). Opt-out customers are
excluded at segment-evaluate time. The marketer approves (and can edit) before
anything is sent — human-in-the-loop (ADR-005).

After launch, `propose-next` feeds the campaign's funnel + attribution back to the
LLM, which diagnoses the result and proposes the next campaign — the closed loop.

## LLM provider abstraction

One canonical interface (`lib/llm/provider.ts`): `chat({ systemInstruction,
messages, tools }) -> { text, toolCalls }`. `GeminiProvider` translates to the
OpenAPI-subset FunctionDeclarations, parses `functionCall` parts, and returns
results as `functionResponse` parts correlated by name + order.
`GroqProvider` is the OpenAI-compatible fallback (schema downcast,
`tool_calls`/`tool_call_id`). `getLlm()` selects by `LLM_PROVIDER`, reprompts once
on a safety blank / 429, then falls back to `LLM_FALLBACK`. Swapping providers is
one env var, zero call-site changes.

## Key queries
- **Funnel** — `GROUP BY communications.state` (index `comm_campaign_state_idx`),
  assembled cumulatively (a `clicked` comm also counts as delivered/opened/read;
  `failed` is excluded from the delivered tier).
- **Attribution** — non-refunded orders by recipients placed within a window after
  their communication's send time (`orders(customer_id, ordered_at)` index).
- **Segment eval** — `rule_json` compiled to a SQL boolean over `customers`, always
  AND-ed with `marketing_opt_in = true` (the opt-out guardrail).

## Scale notes (conscious tradeoffs)
Postgres-backed outbox/DLQ for this scope; at ~1M msgs/day move to Kafka/SQS with
the same idempotency + state-machine logic — the reliability code stays, the
transport changes. Poll-refresh every 2s now, websockets/SSE at higher
concurrency. In-process channel scheduler now, a durable timer store at scale.
Synchronous indexed funnel queries now, a materialized rollup at high volume.
