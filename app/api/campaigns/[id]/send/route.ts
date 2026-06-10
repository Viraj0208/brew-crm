import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { dispatchCampaign } from "@/lib/campaign/send";
import { drainOutbox } from "@/lib/queue/worker";

export const dynamic = "force-dynamic";

/**
 * Returns 202 Accepted immediately. Materializes communications + enqueues
 * outbox rows (no inline channel call), then drains in the background via
 * waitUntil so the drain survives past the response on serverless.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const result = await dispatchCampaign(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  waitUntil(drainOutbox().catch(() => {}));
  return NextResponse.json({ accepted: true, enqueued: result.enqueued }, { status: 202 });
}
