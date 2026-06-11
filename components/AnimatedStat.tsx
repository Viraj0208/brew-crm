"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion, useSpring } from "framer-motion";

/** Stat card whose value springs up from 0 when it enters the viewport. */
export default function AnimatedStat({ label, value }: { label: string; value: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  const spring = useSpring(0, { stiffness: 90, damping: 24 });
  const [shown, setShown] = useState(0);

  useEffect(() => spring.on("change", (v) => setShown(Math.round(v))), [spring]);
  useEffect(() => {
    if (inView) spring.set(value);
  }, [inView, value, spring]);

  return (
    <motion.div
      ref={ref}
      whileHover={reduce ? undefined : { y: -3 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="rounded-lg border border-stone-200 bg-white p-4"
    >
      <div className="text-3xl font-semibold tabular-nums">{reduce ? value : shown}</div>
      <div className="mt-1 text-sm text-stone-500">{label}</div>
    </motion.div>
  );
}
