"use client";

import { useEffect, useState, useCallback } from "react";

interface Funnel {
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  read: number;
  clicked: number;
  failed: number;
}
interface Attribution {
  attributedOrders: number;
  revenueCents: number;
  windowDays: number;
}
interface Stats {
  funnel: Funnel;
  attribution: Attribution;
}

const TIERS: { key: keyof Funnel; label: string; color: string }[] = [
  { key: "sent", label: "Sent", color: "bg-stone-400" },
  { key: "delivered", label: "Delivered", color: "bg-blue-400" },
  { key: "opened", label: "Opened", color: "bg-indigo-400" },
  { key: "read", label: "Read", color: "bg-violet-400" },
  { key: "clicked", label: "Clicked", color: "bg-green-500" },
];

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default function CampaignFunnel({
  campaignId,
  status,
}: {
  campaignId: string;
  status: string;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/stats`, { cache: "no-store" });
    if (res.ok) setStats(await res.json());
  }, [campaignId]);

  // Poll every 2s (no websockets — the brief explicitly scopes poll-refresh).
  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load]);

  const send = async () => {
    setSending(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/send`, { method: "POST" });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? `send failed (${res.status})`);
    }
    setSending(false);
    load();
  };

  const f = stats?.funnel;
  const denom = f && f.total > 0 ? f.total : 1;
  const canSend = status === "draft" || status === "approved";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={send}
          disabled={!canSend || sending}
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {sending ? "Enqueuing…" : canSend ? "Send campaign" : "Already sent"}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
        <span className="ml-auto text-xs text-stone-400">live · refreshes every 2s</span>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-medium text-stone-500">Delivery funnel</h2>
        {!f || f.total === 0 ? (
          <p className="text-sm text-stone-400">
            No communications yet — send the campaign to start the channel loop.
          </p>
        ) : (
          <div className="space-y-2">
            {TIERS.map((t) => {
              const n = f[t.key];
              const pct = Math.round((n / denom) * 100);
              return (
                <div key={t.key} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-stone-500">{t.label}</span>
                  <div className="h-6 flex-1 overflow-hidden rounded bg-stone-100">
                    <div
                      className={`h-full ${t.color} transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-24 text-right text-xs tabular-nums text-stone-600">
                    {n} · {pct}%
                  </span>
                </div>
              );
            })}
            {f.failed > 0 && (
              <div className="flex items-center gap-3 pt-1">
                <span className="w-20 text-xs text-red-500">Failed</span>
                <span className="text-xs text-red-500">{f.failed}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Stat label="Attributed orders" value={String(stats?.attribution.attributedOrders ?? 0)} />
        <Stat
          label={`Attributed revenue (${stats?.attribution.windowDays ?? 7}d window)`}
          value={money(stats?.attribution.revenueCents ?? 0)}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
