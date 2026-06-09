import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, orderItems } from "@/lib/db/schema";
import { recomputeRfm } from "@/lib/domain/rfm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const customerId = new URL(req.url).searchParams.get("customerId");
  const q = db.select().from(orders).orderBy(desc(orders.orderedAt)).limit(500);
  const rows = customerId
    ? await db.select().from(orders).where(eq(orders.customerId, customerId)).orderBy(desc(orders.orderedAt))
    : await q;
  return NextResponse.json({ orders: rows });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.customerId || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "customerId and non-empty items are required" }, { status: 400 });
  }
  const totalCents = body.items.reduce(
    (s: number, it: { unitPriceCents: number; qty: number }) => s + it.unitPriceCents * it.qty,
    0,
  );
  const [order] = await db
    .insert(orders)
    .values({
      customerId: body.customerId,
      orderedAt: body.orderedAt ? new Date(body.orderedAt) : new Date(),
      totalCents,
      status: body.status ?? "placed",
    })
    .returning();
  await db.insert(orderItems).values(
    body.items.map((it: { productName: string; category: string; qty: number; unitPriceCents: number }) => ({
      orderId: order.id,
      productName: it.productName,
      category: it.category as never,
      qty: it.qty,
      unitPriceCents: it.unitPriceCents,
    })),
  );
  await recomputeRfm(body.customerId);
  return NextResponse.json({ order }, { status: 201 });
}
