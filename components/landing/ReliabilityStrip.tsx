"use client";

import { motion, useReducedMotion } from "framer-motion";

const RECEIPTS = [
  "transactional outbox",
  "FOR UPDATE SKIP LOCKED",
  "idempotent webhook",
  "monotonic state machine",
  "dead-letter queues, both sides",
  "exponential backoff",
  "inflight watchdog",
  "56 unit tests",
];

export default function ReliabilityStrip() {
  const reduce = useReducedMotion();

  return (
    <section className="border-y border-tile-line bg-roast-deep py-16">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="font-display text-2xl font-semibold text-steam">
          Built like infrastructure, not a demo
        </h2>
        <motion.ul
          initial={reduce ? false : "hidden"}
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
          className="mt-6 flex flex-wrap gap-2.5"
        >
          {RECEIPTS.map((r) => (
            <motion.li
              key={r}
              variants={{
                hidden: { opacity: 0, y: 10 },
                show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 24 } },
              }}
              className="rounded-full border border-tile-line px-3.5 py-1.5 font-mono text-xs text-steam/80"
            >
              {r}
            </motion.li>
          ))}
        </motion.ul>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-grounds">
          Two services: this CRM on Vercel and a channel simulator on Render that
          delays, drops, and reorders receipts on purpose. The pipeline survives all of
          it. That is the point.
        </p>
      </div>
    </section>
  );
}
