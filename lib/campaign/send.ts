import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { campaigns, communications, segments } from "@/lib/db/schema";
import { segmentMembers, type SegmentMember } from "@/lib/domain/segmentEval";
import { enqueue } from "@/lib/queue/outbox";

/** Minimal token render: {{name}}, {{first_name}}. */
function render(template: string, m: SegmentMember): string {
  const first = m.name.split(" ")[0] ?? m.name;
  return template.replace(/\{\{\s*name\s*\}\}/g, m.name).replace(/\{\{\s*first_name\s*\}\}/g, first);
}

function recipientFor(channel: string, m: SegmentMember): string {
  if (channel === "email") return m.email;
  return m.phone ?? m.email;
}

export type DispatchResult =
  | { ok: true; enqueued: number }
  | { ok: false; status: number; error: string };

/**
 * Materialize one communication per segment member + enqueue an outbox row each,
 * in a single transaction, and flip the campaign to `live`. Shared by the
 * campaign send route and the agent execute route. Caller drives the drain
 * (e.g. via waitUntil) after this returns.
 */
export async function dispatchCampaign(campaignId: string): Promise<DispatchResult> {
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
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) return { ok: false, status: 404, error: "campaign not found" };
  if (campaign.status !== "draft" && campaign.status !== "approved") {
    return { ok: false, status: 409, error: `campaign is '${campaign.status}', expected draft/approved` };
  }

  const members = await segmentMembers(campaign.ruleJson);
  if (members.length === 0) {
    return { ok: false, status: 422, error: "segment has no members to send to" };
  }

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
    const ids = inserted.map((r) => r.id);
    // Enqueue INSIDE the same tx: a crash here rolls everything back. Committing
    // comms + a live campaign with an empty outbox would strand the campaign —
    // queued comms no worker would ever pick up.
    await enqueue(ids, tx);
    return ids;
  });

  return { ok: true, enqueued: commIds.length };
}
