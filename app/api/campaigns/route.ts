import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { campaigns, segments } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      segmentId: campaigns.segmentId,
      segmentName: segments.name,
      channel: campaigns.channel,
      status: campaigns.status,
      createdAt: campaigns.createdAt,
    })
    .from(campaigns)
    .leftJoin(segments, eq(campaigns.segmentId, segments.id))
    .orderBy(desc(campaigns.createdAt));
  return NextResponse.json({ campaigns: rows });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.segmentId || !body?.channel || !body?.messageTemplate) {
    return NextResponse.json(
      { error: "name, segmentId, channel, messageTemplate are required" },
      { status: 400 },
    );
  }
  // Guard against orphan campaigns — the segment must exist.
  const [seg] = await db.select().from(segments).where(eq(segments.id, body.segmentId)).limit(1);
  if (!seg) return NextResponse.json({ error: "segment not found" }, { status: 400 });

  const [row] = await db
    .insert(campaigns)
    .values({
      name: body.name,
      segmentId: body.segmentId,
      channel: body.channel,
      messageTemplate: body.messageTemplate,
      status: "draft",
      agentRunId: body.agentRunId ?? null,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
    })
    .returning();
  return NextResponse.json({ campaign: row }, { status: 201 });
}
