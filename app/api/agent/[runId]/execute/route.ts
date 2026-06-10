import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";
import { TOOL_EXECUTORS } from "@/lib/agent/tools";
import { dispatchCampaign } from "@/lib/campaign/send";
import { drainOutbox } from "@/lib/queue/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Execute an approved plan: launch_campaign (real campaign from plan_json),
 * dispatch the send, drain in the background, link the campaign to the run, and
 * move to monitoring.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);
  if (!run) return NextResponse.json({ error: "run not found" }, { status: 404 });

  const plan = (run.planJson ?? {}) as Record<string, unknown>;
  if (!plan.segment_id || !plan.channel || !plan.message_template) {
    return NextResponse.json(
      { error: "plan is missing segment_id, channel or message_template" },
      { status: 422 },
    );
  }

  let campaignId: string;
  try {
    const out = (await TOOL_EXECUTORS.launch_campaign({
      segment_id: plan.segment_id,
      channel: plan.channel,
      message_template: plan.message_template,
      schedule: plan.schedule ?? "",
    })) as { campaign_id: string };
    campaignId = out.campaign_id;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 422 },
    );
  }

  const dispatch = await dispatchCampaign(campaignId);
  if (!dispatch.ok) {
    return NextResponse.json({ error: dispatch.error }, { status: dispatch.status });
  }
  waitUntil(drainOutbox().catch(() => {}));

  await db
    .update(agentRuns)
    .set({ campaignId, status: "monitoring", updatedAt: new Date() })
    .where(eq(agentRuns.id, runId));

  return NextResponse.json({ campaignId, enqueued: dispatch.enqueued });
}
