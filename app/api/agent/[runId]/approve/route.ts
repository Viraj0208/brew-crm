import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const EDITABLE = ["segment_id", "channel", "message_template", "schedule", "segment_name", "summary"];

/**
 * Marketer edits to the plan before execute. Merges allowed fields into
 * plan_json. Status stays awaiting_approval until execute is called.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);
  if (!run) return NextResponse.json({ error: "run not found" }, { status: 404 });

  const plan = { ...(run.planJson as Record<string, unknown>) };
  for (const k of EDITABLE) {
    if (k in body) plan[k] = body[k];
  }

  await db
    .update(agentRuns)
    .set({ planJson: plan, updatedAt: new Date() })
    .where(eq(agentRuns.id, runId));

  return NextResponse.json({ ok: true, plan });
}
