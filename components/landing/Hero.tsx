"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import SplineScene from "./SplineScene";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } },
};
const rise = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 120, damping: 20 } },
};

export default function Hero({
  stats,
}: {
  stats: { label: string; value: number }[];
}) {
  const reduce = useReducedMotion();

  return (
    <section className="relative isolate flex min-h-screen flex-col overflow-hidden">
      {/* Layer 0: pointer-reactive tile field (Spline), dimmed so copy wins. */}
      <SplineScene
        scene="/landing/reactive-tiles.spline"
        className="absolute inset-0 -z-20 opacity-40"
        fallback={<div className="absolute inset-0 bg-roast" />}
      />
      {/* Radial vignette keeps the center readable over the tiles. */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 35%, transparent 0%, var(--roast) 78%)",
        }}
      />

      {/* Minimal landing nav */}
      <motion.header
        initial={reduce ? false : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5"
      >
        <span className="flex items-center gap-2 font-semibold text-steam">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-crema" aria-hidden="true">
            <path d="M4 10h12v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-5Z" />
            <path d="M16 11h2a2.5 2.5 0 0 1 0 5h-2" />
            <path d="M8 2.5c-.8 1.2-.8 2.3 0 3.5M12 2.5c-.8 1.2-.8 2.3 0 3.5" />
          </svg>
          Brew
        </span>
        <Link
          href="/dashboard"
          className="rounded-full border border-tile-line px-4 py-1.5 text-sm text-steam transition-colors hover:border-crema hover:text-crema"
        >
          Open dashboard
        </Link>
      </motion.header>

      {/* Copy block */}
      <motion.div
        variants={container}
        initial={reduce ? false : "hidden"}
        animate="show"
        className="z-10 mx-auto mt-10 flex max-w-3xl flex-col items-center px-6 text-center"
      >
        <motion.p variants={rise} className="text-sm text-grounds">
          AI-native mini CRM for a D2C coffee chain
        </motion.p>
        <motion.h1
          variants={rise}
          className="mt-4 font-display text-5xl font-semibold leading-[1.05] tracking-[-0.02em] text-steam sm:text-7xl"
          style={{ textWrap: "balance" }}
        >
          Campaigns that brew themselves
        </motion.h1>
        <motion.p variants={rise} className="mt-5 max-w-xl text-base leading-relaxed text-grounds">
          State a goal in plain English. The agent segments real shoppers, drafts the
          message, picks the channel, runs the send, and measures the funnel, with its
          reasoning on screen the whole time.
        </motion.p>
        <motion.div variants={rise} className="mt-8 flex gap-3">
          <motion.span whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link
              href="/agent"
              className="inline-block rounded-full bg-crema px-6 py-2.5 text-sm font-medium text-roast-deep transition-colors hover:bg-crema-hot"
            >
              Open the agent
            </Link>
          </motion.span>
          <motion.span whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Link
              href="/campaigns"
              className="inline-block rounded-full border border-tile-line px-6 py-2.5 text-sm text-steam transition-colors hover:border-crema hover:text-crema"
            >
              See live campaigns
            </Link>
          </motion.span>
        </motion.div>

        {/* Live stat strip — real DB numbers, rendered server-side. */}
        <motion.dl variants={rise} className="mt-10 flex gap-8 text-left">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-xs text-grounds">{s.label}</dt>
              <dd className="font-mono text-xl tabular-nums text-steam">{s.value}</dd>
            </div>
          ))}
          <div>
            <dt className="text-xs text-grounds">Status</dt>
            <dd className="flex items-center gap-1.5 text-xl text-steam">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-crema opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-crema" />
              </span>
              <span className="text-sm">live</span>
            </dd>
          </div>
        </motion.dl>
      </motion.div>

      {/* Layer 1: the tower scene anchors the lower half, like a product on a plinth. */}
      <div className="pointer-events-none relative z-0 mx-auto -mt-4 h-[46vh] w-full max-w-4xl">
        <SplineScene
          scene="/landing/tower.spline"
          onLoad={(app) => {
            // The asset pack's scene ships with the template's own headline baked
            // in as two Text objects — hide them, keep only the 3D model.
            const a = app as {
              getAllObjects?: () => { name: string; visible: boolean }[];
              setZoom?: (zoom: number) => void;
              setBackgroundColor?: (color: string) => void;
            };
            for (const o of a.getAllObjects?.() ?? []) {
              if (o.name === "Text") o.visible = false;
            }
            a.setBackgroundColor?.("transparent");
            a.setZoom?.(1.6);
          }}
          className="absolute inset-x-0 -top-[18%] bottom-0 [&_canvas]:!h-full [&_canvas]:!w-full"
          fallback={
            <video
              src="/landing/tower-fallback.mp4"
              autoPlay
              muted
              loop
              playsInline
              className="mx-auto h-full object-contain opacity-90"
            />
          }
        />
      </div>
    </section>
  );
}
