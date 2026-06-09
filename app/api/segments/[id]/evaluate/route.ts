import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { segments } from "@/lib/db/schema";
import { evaluateSegment, RuleError } from "@/lib/domain/segmentEval";

export const dynamic = "force-dynamic";

// Evaluate a stored segment against live data, refresh its cached member_count, return sample.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [seg] = await db.select().from(segments).where(eq(segments.id, id)).limit(1);
  if (!seg) return NextResponse.json({ error: "segment not found" }, { status: 404 });

  try {
    const { memberCount, sample } = await evaluateSegment(seg.ruleJson);
    await db.update(segments).set({ memberCount }).where(eq(segments.id, id));
    return NextResponse.json({ segment: { ...seg, memberCount }, memberCount, sample });
  } catch (e) {
    if (e instanceof RuleError) {
      return NextResponse.json({ error: `invalid rule: ${e.message}` }, { status: 400 });
    }
    throw e;
  }
}

export const POST = GET;
