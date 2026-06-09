import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { segments } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const KIND_STYLE: Record<string, string> = {
  rule: "bg-stone-100 text-stone-600",
  ai: "bg-amber-100 text-amber-700",
};

export default async function SegmentsPage() {
  const rows = await db.select().from(segments).orderBy(sql`${segments.createdAt} asc`);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Segments</h1>
        <p className="mt-1 text-sm text-stone-500">
          Behavioural audiences. Both rule-based and AI-authored segments share one declarative
          rule representation. Opted-out customers are always excluded at evaluate time.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-stone-500">
            <tr>
              <th className="px-4 py-2 font-medium">Segment</th>
              <th className="px-4 py-2 font-medium">Kind</th>
              <th className="px-4 py-2 font-medium">Author</th>
              <th className="px-4 py-2 text-right font-medium">Members</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((s) => (
              <tr key={s.id} className="hover:bg-stone-50">
                <td className="px-4 py-3">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-stone-500">{s.description}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${KIND_STYLE[s.kind]}`}>
                    {s.kind}
                  </span>
                </td>
                <td className="px-4 py-3 text-stone-500">{s.author}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                  {s.memberCount}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-stone-400">
                  No segments yet. Run the seed.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
