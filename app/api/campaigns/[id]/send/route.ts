import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { campaigns, communications, segments } from "@/lib/db/schema";
import { segmentMembers, type SegmentMember } from "@/lib/domain/segmentEval";
import { enqueue } from "@/lib/queue/outbox";

export const dynamic = "force-dynamic";

/** Minimal token render: {{name}}, {{first_name}}. Keeps the demo legible. */
function render(template: string, m: SegmentMember): string {
  const first = m.name.split(" ")[0] ?? m.name;
  return template.replace(/\{\{\s*name\s*\}\}/g, m.name).replace(/\{\{\s*first_name\s*\}\}/g, first);
}

function recipientFor(channel: string, m: SegmentMember): string {
  if (channel === "email") return m.email;
  return m.phone ?? m.email; // sms/whatsapp prefer phone, fall back to email
}

/**
 * Returns 202 Accepted immediately. It does NOT call the channel inline:
 * it materializes one `communications` row per segment member and enqueues an
 * `outbox` row each, then fires a best-effort kick at the worker so the demo
 * starts draining without waiting for the next cron tick. Re-sending a campaign
 * already past draft is rejected (idempotent — the unique (campaign, customer)
 * index also prevents duplicate comms).
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const [campaign] = await db
    .select({
      id: campaigns.id,
      channel: campaigns.channel,
      messageTemplate: campaigns.messageTemplate,
      status: campaigns.status,
      ruleJson: segments.ruleJson,
    })
    .from(campaigns)
    .innerJoin(segments, eq(campaigns.segmentId, segments.id))
    .where(eq(campaigns.id, id))
    .limit(1);

  if (!campaign) return NextResponse.json({ error: "campaign not found" }, { status: 404 });
  if (campaign.status !== "draft" && campaign.status !== "approved") {
    return NextResponse.json(
      { error: `campaign is '${campaign.status}', expected draft/approved` },
      { status: 409 },
    );
  }

  const members = await segmentMembers(campaign.ruleJson);
  if (members.length === 0) {
    return NextResponse.json({ error: "segment has no members to send to" }, { status: 422 });
  }

  // Materialize comms + enqueue in one transaction so a crash can't leave
  // half-created communications without outbox rows.
  const commIds = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(communications)
      .values(
        members.map((m) => ({
          campaignId: campaign.id,
          customerId: m.id,
          recipient: recipientFor(campaign.channel, m),
          renderedMessage: render(campaign.messageTemplate, m),
        })),
      )
      .returning({ id: communications.id });
    await tx.update(campaigns).set({ status: "live" }).where(eq(campaigns.id, campaign.id));
    return inserted.map((r) => r.id);
  });

  await enqueue(commIds);

  // Best-effort kick — don't block the 202 on it.
  const base = process.env.CRM_PUBLIC_URL;
  const secret = process.env.WORKER_SECRET;
  if (base && secret) {
    void fetch(`${base.replace(/\/$/, "")}/api/internal/worker`, {
      method: "POST",
      headers: { "x-worker-secret": secret },
    }).catch(() => {});
  }

  return NextResponse.json({ accepted: true, enqueued: commIds.length }, { status: 202 });
}
