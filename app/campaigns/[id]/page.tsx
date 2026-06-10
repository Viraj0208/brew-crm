import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { campaigns, segments } from "@/lib/db/schema";
import CampaignFunnel from "./CampaignFunnel";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [c] = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      channel: campaigns.channel,
      status: campaigns.status,
      messageTemplate: campaigns.messageTemplate,
      segmentName: segments.name,
    })
    .from(campaigns)
    .leftJoin(segments, eq(campaigns.segmentId, segments.id))
    .where(eq(campaigns.id, id))
    .limit(1);

  if (!c) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/campaigns" className="text-xs text-stone-400 hover:text-stone-600">
          ← Campaigns
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{c.name}</h1>
        <p className="mt-1 text-sm text-stone-500">
          {c.segmentName ?? "—"} · {c.channel}
        </p>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <div className="text-xs text-stone-500">Message template</div>
        <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{c.messageTemplate}</p>
      </div>

      <CampaignFunnel campaignId={c.id} status={c.status} />
    </div>
  );
}
