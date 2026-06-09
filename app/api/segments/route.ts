import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { segments } from "@/lib/db/schema";
import { evaluateSegment, RuleError } from "@/lib/domain/segmentEval";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(segments).orderBy(desc(segments.createdAt));
  return NextResponse.json({ segments: rows });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.ruleJson) {
    return NextResponse.json({ error: "name and ruleJson are required" }, { status: 400 });
  }
  // Validate + materialize member_count by evaluating the rule immediately.
  try {
    const { memberCount } = await evaluateSegment(body.ruleJson);
    const [row] = await db
      .insert(segments)
      .values({
        name: body.name,
        description: body.description ?? null,
        kind: body.kind ?? "rule",
        author: body.author ?? "user",
        ruleJson: body.ruleJson,
        memberCount,
      })
      .returning();
    return NextResponse.json({ segment: row, memberCount }, { status: 201 });
  } catch (e) {
    if (e instanceof RuleError) {
      return NextResponse.json({ error: `invalid rule: ${e.message}` }, { status: 400 });
    }
    throw e;
  }
}
