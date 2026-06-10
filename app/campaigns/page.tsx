import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { campaigns, segments } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-stone-100 text-stone-600",
  approved: "bg-blue-100 text-blue-700",
  launching: "bg-amber-100 text-amber-700",
  live: "bg-green-100 text-green-700",
  done: "bg-stone-200 text-stone-700",
};

export default async function CampaignsPage() {
  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      segmentName: segments.name,
      channel: campaigns.channel,
      status: campaigns.status,
      createdAt: campaigns.createdAt,
    })
    .from(campaigns)
    .leftJoin(segments, eq(campaigns.segmentId, segments.id))
    .orderBy(desc(campaigns.createdAt));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Campaigns</h1>
        <p className="mt-1 text-sm text-stone-500">
          Each campaign sends through a separate channel service; receipts stream back into a
          per-recipient funnel.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-stone-500">
            <tr>
              <th className="px-4 py-2 font-medium">Campaign</th>
              <th className="px-4 py-2 font-medium">Segment</th>
              <th className="px-4 py-2 font-medium">Channel</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-stone-50">
                <td className="px-4 py-3 font-medium">
                  <Link href={`/campaigns/${c.id}`} className="text-stone-900 hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-stone-500">{c.segmentName ?? "—"}</td>
                <td className="px-4 py-3 text-stone-500">{c.channel}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[c.status]}`}>
                    {c.status}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-stone-400">
                  No campaigns yet. The agent will create the first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
