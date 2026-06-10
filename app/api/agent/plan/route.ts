import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { runPlan } from "@/lib/agent/loop";
import { LlmError } from "@/lib/llm/provider";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // the tool-use loop makes several LLM round-trips

/**
 * Start an agent run: persist the goal, run the planning tool-use loop, store
 * the plan_json + reasoning_trace, and move to awaiting_approval.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const goal = typeof body?.goal === "string" ? body.goal.trim() : "";
  if (!goal) return NextResponse.json({ error: "goal is required" }, { status: 400 });

  const [run] = await db
    .insert(agentRuns)
    .values({ goal, status: "planning" })
    .returning({ id: agentRuns.id });

  try {
    const { plan, trace } = await runPlan(goal);
    await db
      .update(agentRuns)
      .set({
        planJson: plan,
        reasoningTrace: trace,
        status: "awaiting_approval",
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, run.id));
    return NextResponse.json({ runId: run.id, plan, trace });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = err instanceof LlmError ? 502 : 500;
    await db
      .update(agentRuns)
      .set({ planJson: { error: msg }, status: "planning", updatedAt: new Date() })
      .where(eq(agentRuns.id, run.id));
    return NextResponse.json({ runId: run.id, error: msg }, { status: code });
  }
}
