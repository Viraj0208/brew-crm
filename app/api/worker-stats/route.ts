import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deadLetter } from "@/lib/db/schema";
import { outboxCounts } from "@/lib/queue/outbox";

export const dynamic = "force-dynamic";

/** Reliability snapshot for the worker observability page. */
export async function GET() {
  const [outbox, dlRows] = await Promise.all([
    outboxCounts(),
    db
      .select({ source: deadLetter.source, n: sql<number>`count(*)::int` })
      .from(deadLetter)
      .groupBy(deadLetter.source),
  ]);
  const deadLetters: Record<string, number> = { outbox: 0, receipt: 0 };
  for (const r of dlRows) deadLetters[r.source] = r.n;
  return NextResponse.json({ outbox, deadLetters });
}
