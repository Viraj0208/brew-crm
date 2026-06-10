"use client";

import { useEffect, useState } from "react";

interface WorkerStats {
  outbox: Record<string, number>;
  deadLetters: Record<string, number>;
}

const OUTBOX_TILES = [
  { key: "pending", label: "Pending", color: "text-amber-600" },
  { key: "inflight", label: "In-flight", color: "text-blue-600" },
  { key: "sent", label: "Sent", color: "text-green-600" },
  { key: "dead", label: "Dead", color: "text-red-600" },
];

export default function WorkerPage() {
  const [s, setS] = useState<WorkerStats | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/worker-stats", { cache: "no-store" });
      if (res.ok) setS(await res.json());
    };
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Worker &amp; reliability</h1>
        <p className="mt-1 text-sm text-stone-500">
          Postgres-backed outbox drains to the channel with exponential backoff; exhausted
          sends and poison receipts land in the dead-letter table.
        </p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-stone-500">Outbox</h2>
        <div className="grid grid-cols-4 gap-4">
          {OUTBOX_TILES.map((t) => (
            <div key={t.key} className="rounded-lg border border-stone-200 bg-white p-4">
              <div className="text-xs text-stone-500">{t.label}</div>
              <div className={`mt-1 text-3xl font-semibold tabular-nums ${t.color}`}>
                {s?.outbox[t.key] ?? 0}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-stone-500">Dead letter</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="text-xs text-stone-500">From outbox (send gave up)</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums text-red-600">
              {s?.deadLetters.outbox ?? 0}
            </div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="text-xs text-stone-500">From receipts (poison events)</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums text-red-600">
              {s?.deadLetters.receipt ?? 0}
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-stone-400">live · refreshes every 2s</p>
    </div>
  );
}
