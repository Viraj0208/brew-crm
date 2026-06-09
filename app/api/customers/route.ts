import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { customers } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select()
    .from(customers)
    .orderBy(desc(customers.totalSpendCents))
    .limit(500);
  return NextResponse.json({ customers: rows });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.email) {
    return NextResponse.json({ error: "name and email are required" }, { status: 400 });
  }
  try {
    const [row] = await db
      .insert(customers)
      .values({
        name: body.name,
        email: body.email,
        phone: body.phone ?? null,
        city: body.city ?? null,
        marketingOptIn: body.marketingOptIn ?? true,
        preferredChannel: body.preferredChannel ?? null,
      })
      .returning();
    return NextResponse.json({ customer: row }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "insert failed";
    const conflict = msg.includes("duplicate") || msg.includes("unique");
    return NextResponse.json({ error: msg }, { status: conflict ? 409 : 500 });
  }
}
