"use client";

import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

const Spline = lazy(() => import("@splinetool/react-spline"));

/**
 * Lazy Spline mount: loads the WebGL runtime only once the section is near the
 * viewport, and falls back to `fallback` if the scene fails to load (the asset
 * packs ship editor .spline files; the runtime parses the same MessagePack
 * scene format, but we never bet the hero on it) or if the user prefers
 * reduced motion.
 */
export default function SplineScene({
  scene,
  className,
  fallback,
  onLoad,
}: {
  scene: string;
  className?: string;
  fallback?: React.ReactNode;
  onLoad?: (app: unknown) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [failed, setFailed] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const showFallback = failed || reduce;

  return (
    <div ref={ref} className={className}>
      {showFallback
        ? fallback
        : near && (
            <Suspense fallback={fallback ?? null}>
              <Spline scene={scene} onError={() => setFailed(true)} onLoad={onLoad} />
            </Suspense>
          )}
    </div>
  );
}
