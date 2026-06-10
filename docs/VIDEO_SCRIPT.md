# Brew — 6-minute demo video script

Word-for-word narration + on-screen actions. Target **5:45**. Two tabs open:
**A** = https://brew-crm.vercel.app, **B** = the campaign/worker pages.

## Pre-flight (do 2 min before recording)
1. Ping the channel so Render isn't cold: open https://brew-channel.onrender.com/healthz → must show `{"status":"ok"}`.
2. Open https://brew-crm.vercel.app/agent (goal box empty).
3. Have https://brew-crm.vercel.app/worker ready in a second tab.
4. One dry plan beforehand to warm Gemini + the functions (then refresh /agent clean).
5. Close other apps; full-screen the browser.

---

## 0:00–0:25 · Hook + thesis
**On screen:** /agent page, goal box.
> "Most CRMs make the marketer do the thinking — build the segment, write the
> copy, pick the channel. Brew flips that. It's an AI-native mini-CRM for a
> direct-to-consumer coffee brand: you state a goal in plain English, an agent
> plans the whole campaign against real data, you approve, and it runs over a
> reliability-grade delivery pipeline. The whole thing ships at zero dollars."

## 0:25–2:05 · Product star — the agent loop
**Action:** type *"Win back lapsed espresso drinkers who haven't ordered in over a
month"* → click **Plan campaign**.
> "I give it a goal. Now watch the reasoning trace — this isn't a black box."

**Action:** point at each trace row as it appears.
> "It calls query_customers to size real audiences, creates a segment — and this
> is a real segment id with a real member count, not a hallucination — then picks
> a channel with a rationale, and drafts the copy. Every tool returns real ids and
> counts; the model never invents a customer."

**Action:** scroll to the plan card. Edit the message slightly.
> "It proposes a full plan — segment, channel, message — and I stay in control: I
> can edit any field before anything sends. That human-in-the-loop approval is
> deliberate. I'll tweak the copy and approve."

**Action:** click **Approve & launch**. Funnel appears, numbers climb.
> "On approve it launches a real campaign and the funnel fills live — sent,
> delivered, opened, read, clicked — as delivery callbacks stream back."

**Action:** click **Propose next campaign**.
> "And here's the differentiator — the closed loop. The agent reads its own
> results and proposes the next campaign: it diagnoses, say, a high open rate but
> low clicks, and suggests a stronger call-to-action. One click loads that as the
> next goal. The CRM learns."

## 2:05–3:35 · System star — the channel reliability loop
**Action:** switch to tab B → /worker page.
> "Behind that funnel is the part I'm most proud of — the delivery pipeline. Send
> doesn't call the channel inline. It returns 202 and writes an outbox row per
> recipient in Postgres. A worker drains that outbox to a *separate* deployed
> channel service — so callbacks cross a real network boundary."

**Action:** gesture at outbox + dead-letter counts.
> "This is the worker page — outbox pending/sent and the dead-letter count. Three
> guarantees make it reliability-grade. One: idempotency — every callback is
> de-duplicated on a unique event id, so a retried callback is a no-op. Two:
> ordering — the channel fires callbacks *deliberately out of order*, so an
> 'opened' can arrive before 'delivered'. A monotonic-rank state machine only ever
> advances state; a late 'delivered' after 'read' is recorded for audit but never
> demotes. It's a pure function with fifteen unit tests. Three: poison tolerance —
> malformed or unknown events go to a dead-letter table and still return 200, so a
> bad event never makes the channel retry forever. Failed sends retry with
> exponential backoff, then dead-letter."

## 3:35–4:20 · Architecture + scale
**On screen:** docs/ARCHITECTURE.md diagram (or the repo).
> "Two services and Neon Postgres. The outbox and dead-letter live in Postgres on
> purpose — zero extra infra, transactional with the data, and inspectable. The
> conscious trade-off: at a million messages a day this swaps to Kafka or SQS, but
> the idempotency and state-machine logic stay identical — only the transport
> changes. Funnel is an indexed group-by now; a materialized rollup at high volume.
> Poll-refresh now; websockets at higher concurrency. Scope is one brand, one
> marketer — so no auth sprawl."

## 4:20–5:15 · LLM abstraction + AI-native build (the build axis)
> "On the AI side, the runtime is locked to Gemini 2.0 Flash on the free tier, with
> Groq as a live fallback, behind one provider-agnostic interface — switching is a
> single env var. Claude and OpenAI never run in the product; they were the
> *build* tools. This was built plan-first: a written design doc fixed the schema,
> the two stars, even Gemini's tool-calling quirks before any code. Claude Code
> owned the hard reasoning — the state machine, the outbox, the agent loop — all
> test-first; Codex did CRUD, seed, and UI shells. Small reviewed commits, clean
> history. And correctness came from running the real thing: the build passed, but
> sending an actual campaign surfaced three production-only bugs — a Hobby cron
> limit, Render's read-only filesystem, and a serverless fire-and-forget that froze
> after the response — each fixed and re-verified live."

## 5:15–5:45 · Close
**On screen:** the live app, funnel filled.
> "So: an agent that plans, explains, and learns; a delivery pipeline that's
> idempotent, ordered, and fault-tolerant; two live services; thirty-eight tests;
> and it all runs at zero dollars on free tiers. That's Brew. Links to both repos
> and the live apps are in the description. Thanks for watching."

---

## Timing cheatsheet
| Beat | End |
|---|---|
| Hook | 0:25 |
| Agent loop | 2:05 |
| Reliability loop | 3:35 |
| Architecture/scale | 4:20 |
| LLM + build axis | 5:15 |
| Close | 5:45 |

## If you run long, cut in this order
1. Trim the architecture/scale lines to two sentences.
2. Drop the message edit in the agent demo.
3. Shorten the build-axis to the plan-first + three-bugs lines only.

## Backup if Gemini rate-limits mid-record
- Say: "the runtime falls back to Groq automatically" — it does; re-run the plan.
- Or pre-record the agent segment earlier when quota is fresh and stitch.
