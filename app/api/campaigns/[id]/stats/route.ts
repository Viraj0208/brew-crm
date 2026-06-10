import { NextResponse } from "next/server";
import { campaignFunnel } from "@/lib/domain/funnel";
import { campaignAttribution } from "@/lib/domain/attribution";

export const dynamic = "force-dynamic";

/**
 * Campaign stats for the live funnel poll + the agent's get_campaign_stats tool.
 * Returns the cumulative funnel and attributed orders/revenue in one shot.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [funnel, attribution] = await Promise.all([
    campaignFunnel(id),
    campaignAttribution(id),
  ]);
  return NextResponse.json({ funnel, attribution });
}
