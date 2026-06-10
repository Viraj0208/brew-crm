"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface TraceStep {
  step: number;
  tool: string | null;
  input: unknown;
  output: unknown;
  thought: string;
}
interface Plan {
  segment_id?: string;
  segment_name?: string;
  member_count?: number;
  channel?: string;
  channel_why?: string;
  message_template?: string;
  schedule?: string;
  summary?: string;
}
interface Funnel {
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  read: number;
  clicked: number;
  failed: number;
}

const EXAMPLES = [
  "Win back lapsed espresso drinkers who haven't ordered in 6 weeks",
  "Reward high-LTV subscribers with an early-access drop",
  "Convert new browsers who bought beans but never subscribed",
];

export default function AgentConsole() {
  const [goal, setGoal] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan>({});
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [status, setStatus] = useState<string>("idle");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [proposed, setProposed] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startPlan = async () => {
    setBusy(true);
    setError(null);
    setProposed(null);
    setCampaignId(null);
    setFunnel(null);
    setStatus("planning");
    try {
      const res = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? "planning failed");
      setRunId(b.runId);
      setPlan(b.plan ?? {});
      setTrace(b.trace ?? []);
      setStatus("awaiting_approval");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("idle");
    }
    setBusy(false);
  };

  const execute = async () => {
    if (!runId) return;
    setBusy(true);
    setError(null);
    try {
      await fetch(`/api/agent/${runId}/approve`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(plan),
      });
      const res = await fetch(`/api/agent/${runId}/execute`, { method: "POST" });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? "execute failed");
      setCampaignId(b.campaignId);
      setStatus("monitoring");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  const proposeNext = async () => {
    if (!runId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agent/${runId}/propose-next`, { method: "POST" });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error ?? "propose failed");
      setProposed(b.proposed ?? {});
      setStatus("proposed_next");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  const loadFunnel = useCallback(async () => {
    if (!campaignId) return;
    const res = await fetch(`/api/campaigns/${campaignId}/stats`, { cache: "no-store" });
    if (res.ok) setFunnel((await res.json()).funnel);
  }, [campaignId]);

  useEffect(() => {
    if (!campaignId) return;
    loadFunnel();
    const t = setInterval(loadFunnel, 2000);
    return () => clearInterval(t);
  }, [campaignId, loadFunnel]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Agent console</h1>
        <p className="mt-1 text-sm text-stone-500">
          State a goal → the agent plans a campaign with a visible reasoning trace → you approve →
          watch it run → it proposes the next move.
        </p>
      </div>

      {/* Goal box */}
      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="e.g. Win back lapsed espresso drinkers"
          rows={2}
          className="w-full resize-none rounded-md border border-stone-200 p-3 text-sm outline-none focus:border-stone-400"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            onClick={startPlan}
            disabled={busy || goal.trim().length < 5}
            className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {status === "planning" ? "Planning…" : "Plan campaign"}
          </button>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setGoal(ex)}
              className="rounded-full border border-stone-200 px-3 py-1 text-xs text-stone-500 hover:bg-stone-50"
            >
              {ex.slice(0, 38)}…
            </button>
          ))}
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {/* Reasoning trace */}
      {trace.length > 0 && (
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-medium text-stone-500">Reasoning trace</h2>
          <ol className="space-y-2">
            {trace.map((t, i) => (
              <li key={i} className="border-l-2 border-stone-200 pl-3">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-stone-100 px-2 py-0.5 font-mono text-xs text-stone-600">
                    {t.tool ?? "plan"}
                  </span>
                  {t.thought && <span className="text-xs text-stone-500">{t.thought.slice(0, 120)}</span>}
                </div>
                {t.tool && (
                  <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                    <pre className="overflow-x-auto rounded bg-stone-50 p-2 text-stone-600">
                      {JSON.stringify(t.input, null, 1)}
                    </pre>
                    <pre className="overflow-x-auto rounded bg-stone-50 p-2 text-stone-600">
                      {JSON.stringify(t.output, null, 1)}
                    </pre>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Editable plan */}
      {status !== "idle" && status !== "planning" && plan.message_template && (
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-medium text-stone-500">
            Proposed plan {status !== "awaiting_approval" && `· ${status}`}
          </h2>
          <div className="space-y-3 text-sm">
            <Field label="Segment">
              <span className="text-stone-700">
                {plan.segment_name ?? plan.segment_id}{" "}
                {plan.member_count != null && (
                  <span className="text-stone-400">· {plan.member_count} members</span>
                )}
              </span>
            </Field>
            <Field label="Channel">
              <select
                value={plan.channel ?? "whatsapp"}
                disabled={status !== "awaiting_approval"}
                onChange={(e) => setPlan({ ...plan, channel: e.target.value })}
                className="rounded border border-stone-200 px-2 py-1 text-sm disabled:opacity-60"
              >
                <option value="whatsapp">whatsapp</option>
                <option value="sms">sms</option>
                <option value="email">email</option>
              </select>
              {plan.channel_why && <span className="ml-2 text-xs text-stone-400">{plan.channel_why}</span>}
            </Field>
            <Field label="Message">
              <textarea
                value={plan.message_template ?? ""}
                disabled={status !== "awaiting_approval"}
                onChange={(e) => setPlan({ ...plan, message_template: e.target.value })}
                rows={2}
                className="w-full rounded border border-stone-200 p-2 text-sm disabled:opacity-60"
              />
            </Field>
            {plan.summary && <p className="text-xs text-stone-500">{plan.summary}</p>}
          </div>

          {status === "awaiting_approval" && (
            <button
              onClick={execute}
              disabled={busy}
              className="mt-4 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy ? "Launching…" : "Approve & launch"}
            </button>
          )}
        </div>
      )}

      {/* Live funnel */}
      {campaignId && funnel && (
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-stone-500">Live funnel</h2>
            <Link href={`/campaigns/${campaignId}`} className="text-xs text-stone-400 hover:underline">
              open campaign →
            </Link>
          </div>
          <div className="grid grid-cols-5 gap-2 text-center">
            {(["sent", "delivered", "opened", "read", "clicked"] as const).map((k) => (
              <div key={k} className="rounded bg-stone-50 p-2">
                <div className="text-lg font-semibold tabular-nums">{funnel[k]}</div>
                <div className="text-xs text-stone-500">{k}</div>
              </div>
            ))}
          </div>
          <button
            onClick={proposeNext}
            disabled={busy}
            className="mt-4 rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? "Analyzing…" : "Propose next campaign"}
          </button>
        </div>
      )}

      {/* Propose-next */}
      {proposed && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
          <h2 className="mb-2 text-sm font-medium text-indigo-700">Proposed next campaign</h2>
          <dl className="space-y-1 text-sm">
            {Object.entries(proposed).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="w-32 shrink-0 text-indigo-500">{k}</dt>
                <dd className="text-stone-700">{String(v)}</dd>
              </div>
            ))}
          </dl>
          {typeof proposed.next_goal === "string" && (
            <button
              onClick={() => {
                setGoal(proposed.next_goal as string);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="mt-3 rounded-md border border-indigo-300 px-3 py-1.5 text-xs text-indigo-700 hover:bg-indigo-100"
            >
              Use as next goal ↑
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-20 shrink-0 pt-1 text-xs text-stone-400">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}
