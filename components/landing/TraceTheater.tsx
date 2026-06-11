"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/** A real reasoning trace shape from lib/agent/loop.ts, replayed as theater. */
const TRACE = [
  {
    tool: "query_customers",
    thought: "Goal mentions lapsed espresso drinkers. Pulling shoppers whose last espresso order is older than 6 weeks.",
    output: "214 customers match · avg LTV $86",
  },
  {
    tool: "create_segment",
    thought: "Cohort is coherent. Naming it so the team can reuse it.",
    output: 'segment "Lapsed espresso, 6w+" created · 214 members',
  },
  {
    tool: "pick_channel",
    thought: "High historical open rate on WhatsApp for this cohort; email fatigued.",
    output: "whatsapp (62% read rate for cohort)",
  },
  {
    tool: "draft_message",
    thought: "Win-back tone, one concrete offer, no discounting the whole catalog.",
    output: '"Your espresso misses you: 20% off your old favorite this week."',
  },
  {
    tool: "launch_campaign",
    thought: "Plan approved by the operator. Enqueueing sends through the outbox.",
    output: "campaign live · 214 queued",
  },
  {
    tool: "get_campaign_stats",
    thought: "Receipts are arriving out of order; the state machine ranks them correctly.",
    output: "sent 214 · delivered 209 · read 131 · clicked 47",
  },
];

const STEP_MS = 2600;

export default function TraceTheater() {
  const [idx, setIdx] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % (TRACE.length + 1)), STEP_MS);
    return () => clearInterval(t);
  }, [reduce]);

  const visible = reduce ? TRACE : TRACE.slice(0, idx);

  return (
    <section className="relative bg-roast-deep py-24">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <h2 className="font-display text-3xl font-semibold text-steam sm:text-4xl">
            Watch it think
          </h2>
          <p className="mt-4 max-w-md leading-relaxed text-grounds">
            The agent is a Gemini function-calling loop over six real tools. Every step
            of its reasoning is stored and shown. The operator approves the plan before
            a single message leaves the building.
          </p>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-grounds">
            This is a replay of an actual run against seeded shopper data.
          </p>
        </div>

        <div className="min-h-[420px] rounded-xl border border-tile-line bg-roast p-5 font-mono text-sm">
          <div className="mb-4 flex items-center gap-2 text-xs text-grounds">
            <span className="h-2.5 w-2.5 rounded-full bg-crema/70" />
            agent run · win back lapsed espresso drinkers
          </div>
          <AnimatePresence initial={false}>
            {visible.map((step, i) => (
              <motion.div
                key={step.tool}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 220, damping: 26 }}
                className="mb-4"
              >
                <div className="flex items-center gap-2">
                  <motion.span
                    initial={{ scale: 0.6 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 18 }}
                    className="rounded bg-crema/15 px-1.5 py-0.5 text-xs text-crema"
                  >
                    {step.tool}
                  </motion.span>
                  <span className="text-xs text-grounds">step {i + 1}</span>
                </div>
                <p className="mt-1.5 leading-relaxed text-steam/85">{step.thought}</p>
                <p className="mt-1 text-xs text-grounds">→ {step.output}</p>
              </motion.div>
            ))}
          </AnimatePresence>
          {!reduce && visible.length < TRACE.length && (
            <span className="inline-block h-4 w-2 animate-pulse bg-crema/80" aria-hidden="true" />
          )}
        </div>
      </div>
    </section>
  );
}
