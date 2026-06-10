import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";
import { TOOL_EXECUTORS } from "@/lib/agent/tools";
import { getLlm } from "@/lib/llm";
import { extractJson } from "@/lib/agent/loop";
import { PROPOSE_SYSTEM } from "@/lib/agent/prompts";
import { LlmError } from "@/lib/llm/provider";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The differentiator: read the launched campaign's funnel + attribution, ask
 * the LLM to diagnose and propose the next campaign, store proposed_next_json.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);
  if (!run) return NextResponse.json({ error: "run not found" }, { status: 404 });
  if (!run.campaignId) {
    return NextResponse.json({ error: "run has no launched campaign yet" }, { status: 409 });
  }

  const stats = await TOOL_EXECUTORS.get_campaign_stats({ campaign_id: run.campaignId });

  try {
    const turn = await getLlm().chat({
      systemInstruction: PROPOSE_SYSTEM,
      messages: [
        {
          role: "user",
          text: `Original goal: ${run.goal}\nCampaign results: ${JSON.stringify(stats)}`,
        },
      ],
      tools: [],
    });
    const proposed = extractJson(turn.text);

    await db
      .update(agentRuns)
      .set({ proposedNextJson: proposed, status: "proposed_next", updatedAt: new Date() })
      .where(eq(agentRuns.id, runId));

    return NextResponse.json({ stats, proposed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = err instanceof LlmError ? 502 : 500;
    return NextResponse.json({ error: msg, stats }, { status: code });
  }
}
