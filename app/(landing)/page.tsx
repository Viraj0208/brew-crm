import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { customers, orders, campaigns } from "@/lib/db/schema";
import { campaignFunnel } from "@/lib/domain/funnel";
import Hero from "@/components/landing/Hero";
import TraceTheater from "@/components/landing/TraceTheater";
import FunnelSection, { type FunnelNumbers } from "@/components/landing/FunnelSection";
import ReliabilityStrip from "@/components/landing/ReliabilityStrip";

export const dynamic = "force-dynamic";

/** Verified production dry-run numbers — shown if the DB is cold/unreachable.
 *  The landing page must render even when the data layer doesn't. */
const FALLBACK = {
  stats: [
    { label: "Customers", value: 120 },
    { label: "Orders", value: 743 },
    { label: "Campaigns", value: 4 },
  ],
  funnel: { sent: 6, delivered: 6, opened: 6, read: 3, clicked: 2 } satisfies FunnelNumbers,
};

async function loadLive() {
  const [[{ n: customerCount }], [{ n: orderCount }], [{ n: campaignCount }], latest] =
    await Promise.all([
      db.select({ n: sql<number>`cast(count(*) as int)` }).from(customers),
      db.select({ n: sql<number>`cast(count(*) as int)` }).from(orders),
      db.select({ n: sql<number>`cast(count(*) as int)` }).from(campaigns),
      db.select({ id: campaigns.id }).from(campaigns).orderBy(desc(campaigns.createdAt)).limit(1),
    ]);

  let funnel = FALLBACK.funnel;
  if (latest[0]) {
    const f = await campaignFunnel(latest[0].id);
    if (f.sent > 0) {
      funnel = {
        sent: f.sent,
        delivered: f.delivered,
        opened: f.opened,
        read: f.read,
        clicked: f.clicked,
      };
    }
  }

  return {
    stats: [
      { label: "Customers", value: customerCount },
      { label: "Orders", value: orderCount },
      { label: "Campaigns", value: campaignCount },
    ],
    funnel,
  };
}

export default async function Landing() {
  let data = FALLBACK;
  try {
    data = await loadLive();
  } catch {
    // DB cold or unreachable — render with the verified dry-run numbers.
  }

  return (
    <main>
      <Hero stats={data.stats} />
      <TraceTheater />
      <FunnelSection funnel={data.funnel} />
      <ReliabilityStrip />
      <footer className="bg-roast py-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6">
          <p className="font-mono text-xs text-grounds">
            Next.js 15 · Drizzle · Neon · Hono channel sim · Gemini free tier · ships $0
          </p>
          <Link href="/dashboard" className="text-sm text-crema hover:text-crema-hot">
            Enter the CRM →
          </Link>
        </div>
      </footer>
    </main>
  );
}
