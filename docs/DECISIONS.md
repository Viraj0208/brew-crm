# Architecture Decision Records

Short ADRs for the choices that shaped Brew. Each: context → decision →
consequence.

## ADR-001 — Two separate services for the channel loop
**Context.** The brief grades how delivery volume, ordering, retries, and failures
are handled.
**Decision.** Run the channel as a separate deployed service (brew-channel on
Render) that calls back over HTTP, rather than an in-process module of the CRM.
**Consequence.** The CRM must handle genuinely out-of-order, retried, and poison
callbacks over the wire — it cannot cheat by sharing memory. Costs a second
deploy + a shared secret; buys an honest reliability story. Also satisfies the
submission's separate frontend/backend repo requirement.

## ADR-002 — Postgres-backed outbox + DLQ instead of a queue SaaS
**Context.** Need at-least-once delivery, backoff, and a dead-letter path.
**Decision.** Use an `outbox` table claimed with `FOR UPDATE SKIP LOCKED` and a
`dead_letter` table, not SQS/Kafka/a queue SaaS.
**Consequence.** Zero extra infra, transactional with the domain data, trivially
inspectable on the /worker page. At ~1M msgs/day this swaps for Kafka/SQS — the
idempotency + state-machine logic stays, only the transport changes.

## ADR-003 — Monotonic-rank state machine for out-of-order receipts
**Context.** Callbacks arrive out of order, duplicated, and sometimes stale.
**Decision.** Give each state a numeric rank and advance only on a strictly higher
rank; record everything else for audit without regressing. `failed` is terminal
and shares rank 2 with `delivered`.
**Consequence.** Ordering is a pure, exhaustively unit-tested function
(`applyEvent`); gap-fill is implicit (rank only moves up). The DB layer only adds
a `SELECT FOR UPDATE` + an `event_id` UNIQUE for serialization + dedupe.

## ADR-004 — LLM provider abstraction
**Context.** Gemini and Groq have different tool-calling dialects; we want to swap
freely and add Claude/OpenAI later if credits existed.
**Decision.** One canonical `chat({systemInstruction, messages, tools})` interface;
each provider translates to its own dialect behind it.
**Consequence.** The agent loop never sees a provider-specific shape; switching is
one env var. Slight upfront cost writing two adapters + translation tests.

## ADR-005 — Human-in-the-loop agent (approve before execute)
**Context.** An agent that sends marketing messages autonomously is a liability.
**Decision.** The plan phase is read-mostly (it may create a segment, but never
sends). Sending happens only via a separate `execute` after the marketer approves
and can edit segment/channel/message.
**Consequence.** Safety + trust + a natural demo beat. The plan and execute phases
expose different tool subsets.

## ADR-006 — Poll-refresh over websockets
**Context.** The funnel and agent run need to update live.
**Decision.** Poll `/stats` every 2s from the client; no websockets/SSE.
**Consequence.** Trivial on serverless, no connection management. Fine at this
scope (one marketer, tens of campaigns); revisit at higher concurrency.

## ADR-007 — Gemini 2.0 Flash free as the locked $0 runtime LLM
**Context.** No API-console credits for Claude/OpenAI; the product must run $0.
**Decision.** Runtime LLM is Gemini free (default) with Groq free as a live
fallback. Claude/OpenAI are excluded from shipped code by convention (enforced in
both repos' CLAUDE.md).
**Consequence.** $0 hosting end-to-end. The provider abstraction (ADR-004) means
a paid model would drop in as one more class if credits appeared.

## ADR-008 — AI-native dev workflow: Claude Code + Codex, reviewed, small commits
**Context.** How the app was built is itself a graded axis.
**Decision.** Claude Code owns architecture, the agent loop, and the reliability
core (state machine + outbox/DLQ); Codex owns CRUD/schema-scaffolding/seed/UI
shells. Every component got a written spec before generation; output was
cross-reviewed; integration via small conventional commits.
**Consequence.** Clean, coherent commit history in both repos and a documented
labour split (`docs/AI_WORKFLOW.md`). See also the serverless drain fix
(`waitUntil`) and the prod-only deploy fixes, all caught by verifying on real
infra rather than trusting the build.

## ADR-009 — Drizzle DB client is lazy
**Context.** `next build` evaluates route modules during page-data collection;
unit tests import domain files that transitively pull the DB client.
**Decision.** Build the connection pool on first query via a proxy, not at module
import.
**Consequence.** Build and unit tests run with no `DATABASE_URL`; the error only
surfaces at actual query time. (This fixed the first production build failure.)
