import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { campaigns, segments } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [row] = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      segmentId: campaigns.segmentId,
      segmentName: segments.name,
      channel: campaigns.channel,
      messageTemplate: campaigns.messageTemplate,
      status: campaigns.status,
      agentRunId: campaigns.agentRunId,
      scheduledAt: campaigns.scheduledAt,
      createdAt: campaigns.createdAt,
    })
    .from(campaigns)
    .leftJoin(segments, eq(campaigns.segmentId, segments.id))
    .where(eq(campaigns.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "campaign not found" }, { status: 404 });
  return NextResponse.json({ campaign: row });
}
