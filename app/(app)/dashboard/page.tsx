import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { customers, orders, segments, campaigns } from "@/lib/db/schema";
import AnimatedStat from "@/components/AnimatedStat";
import StaggerIn, { StaggerItem } from "@/components/StaggerIn";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [[{ n: customerCount }], [{ n: orderCount }], [{ n: campaignCount }], segRows] =
    await Promise.all([
      db.select({ n: sql<number>`cast(count(*) as int)` }).from(customers),
      db.select({ n: sql<number>`cast(count(*) as int)` }).from(orders),
      db.select({ n: sql<number>`cast(count(*) as int)` }).from(campaigns),
      db.select().from(segments).orderBy(sql`${segments.createdAt} asc`),
    ]);

  const stats = [
    { label: "Customers", value: customerCount },
    { label: "Orders", value: orderCount },
    { label: "Segments", value: segRows.length },
    { label: "Campaigns", value: campaignCount },
  ];

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-500">
          State a goal in plain English. The agent reasons over real shopper data, proposes a
          campaign with a visible trace, runs it, and proposes the next one.
        </p>
        <Link
          href="/agent"
          className="mt-4 inline-block rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800"
        >
          Open the agent →
        </Link>
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <AnimatedStat key={s.label} label={s.label} value={s.value} />
        ))}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Seed segments</h2>
        <StaggerIn className="mt-3 grid gap-3 sm:grid-cols-3">
          {segRows.map((s) => (
            <StaggerItem key={s.id}>
              <Link
                href="/segments"
                className="block h-full rounded-lg border border-stone-200 bg-white p-4 hover:border-amber-300"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.name}</span>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                    {s.memberCount}
                  </span>
                </div>
                <p className="mt-2 text-sm text-stone-500">{s.description}</p>
              </Link>
            </StaggerItem>
          ))}
        </StaggerIn>
      </section>
    </div>
  );
}
