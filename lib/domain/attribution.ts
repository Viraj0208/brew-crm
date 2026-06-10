import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export interface Attribution {
  attributedOrders: number;
  revenueCents: number;
  windowDays: number;
}

/**
 * Orders attributed to a campaign: a non-refunded order placed by a recipient
 * within `windowDays` AFTER their communication was created (the send time).
 * Orders before the send or outside the window don't count; refunds are
 * excluded. DISTINCT guards against double-counting if a customer somehow has
 * two comms in the same campaign (the unique index prevents that, but be safe).
 *
 * Indexes: communications(campaign_id), orders(customer_id, ordered_at).
 */
export async function campaignAttribution(
  campaignId: string,
  windowDays = 7,
): Promise<Attribution> {
  const rows = await db.execute(sql`
    SELECT
      count(DISTINCT o.id)::int            AS attributed_orders,
      coalesce(sum(o.total_cents), 0)::int AS revenue_cents
    FROM communications c
    JOIN orders o ON o.customer_id = c.customer_id
    WHERE c.campaign_id = ${campaignId}
      AND o.status <> 'refunded'
      AND o.ordered_at >  c.created_at
      AND o.ordered_at <= c.created_at + (${windowDays} * interval '1 day')
  `);
  const row = rows.rows[0] as { attributed_orders: number; revenue_cents: number } | undefined;
  return {
    attributedOrders: row?.attributed_orders ?? 0,
    revenueCents: row?.revenue_cents ?? 0,
    windowDays,
  };
}
