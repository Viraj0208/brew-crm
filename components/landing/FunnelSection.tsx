"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";

const Crm3D = dynamic(() => import("./Crm3D"), { ssr: false });

export interface FunnelNumbers {
  sent: number;
  delivered: number;
  opened: number;
  read: number;
  clicked: number;
}

const TIERS: { key: keyof FunnelNumbers; label: string }[] = [
  { key: "sent", label: "Sent" },
  { key: "delivered", label: "Delivered" },
  { key: "opened", label: "Opened" },
  { key: "read", label: "Read" },
  { key: "clicked", label: "Clicked" },
];

function Counter({ to, started }: { to: number; started: boolean }) {
  const spring = useSpring(0, { stiffness: 80, damping: 22 });
  const [shown, setShown] = useState(0);
  useEffect(() => spring.on("change", (v) => setShown(Math.round(v))), [spring]);
  useEffect(() => {
    if (started) spring.set(to);
  }, [started, to, spring]);
  return <span className="font-mono tabular-nums">{shown}</span>;
}

export default function FunnelSection({ funnel }: { funnel: FunnelNumbers }) {
  const sectionRef = useRef<HTMLElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const inView = useInView(barsRef, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const progress = useTransform(scrollYProgress, [0, 1], [0, 1]);

  const max = Math.max(funnel.sent, 1);

  return (
    <section ref={sectionRef} className="relative bg-roast py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-2">
        <div className="order-2 lg:order-1">
          <h2 className="font-display text-3xl font-semibold text-steam sm:text-4xl">
            Measured to the last click
          </h2>
          <p className="mt-4 max-w-md leading-relaxed text-grounds">
            Every send flows through a transactional outbox, a simulated channel that
            answers out of order on purpose, and an idempotent webhook that ranks
            receipts monotonically. The funnel below is real production data.
          </p>

          <div ref={barsRef} className="mt-10 space-y-4">
            {TIERS.map((t, i) => {
              const v = funnel[t.key];
              return (
                <div key={t.key}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-grounds">{t.label}</span>
                    <span className="text-steam">
                      <Counter to={v} started={inView} />
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-tile-line/50">
                    <motion.div
                      initial={reduce ? false : { scaleX: 0 }}
                      animate={inView ? { scaleX: v / max } : {}}
                      transition={{
                        type: "spring",
                        stiffness: 90,
                        damping: 24,
                        delay: i * 0.12,
                      }}
                      className="h-full origin-left rounded-full bg-crema"
                      style={reduce ? { scaleX: v / max } : undefined}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="order-1 h-[380px] lg:order-2 lg:h-[460px]">
          {!reduce && <Crm3D progress={progress} />}
        </div>
      </div>
    </section>
  );
}
