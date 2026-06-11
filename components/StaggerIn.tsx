"use client";

import { motion, useReducedMotion } from "framer-motion";

/** Staggers direct children in on mount (40ms apart). Server pages wrap lists in
 *  this instead of becoming client components themselves. */
export default function StaggerIn({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : "hidden"}
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 10 },
        show: {
          opacity: 1,
          y: 0,
          transition: { type: "spring", stiffness: 260, damping: 26 },
        },
      }}
      whileHover={{ y: -3 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
