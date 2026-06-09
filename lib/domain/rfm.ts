import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

/**
 * Recompute cached RFM fields on `customers` from live order data.
 * Pass a `customerId` to recompute one row (e.g. after creating an order), or omit to
 * recompute everyone (used by the seed). Customers with no orders are reset to defaults.
 */
export async function recomputeRfm(customerId?: string): Promise<void> {
  const oneCustomer = customerId ? sql`and c.id = ${customerId}` : sql``;
  const oneCustomerJoin = customerId ? sql`c.id = ${customerId} and ` : sql``;

  // Reset rows with no orders to defaults (handles refund-to-zero / never-ordered).
  await db.execute(sql`
    update customers c set
      order_count = 0, total_spend_cents = 0, last_order_at = null,
      avg_days_between_orders = null, is_subscriber = false
    where not exists (select 1 from orders o where o.customer_id = c.id)
    ${oneCustomer}
  `);

  await db.execute(sql`
    update customers c set
      order_count = sub.cnt,
      total_spend_cents = sub.spend,
      last_order_at = sub.last_at,
      avg_days_between_orders = sub.avg_gap,
      is_subscriber = sub.is_sub
    from (
      select o.customer_id,
        count(*)::int as cnt,
        coalesce(sum(o.total_cents) filter (where o.status <> 'refunded'), 0)::int as spend,
        max(o.ordered_at) as last_at,
        case when count(*) > 1
          then (extract(epoch from (max(o.ordered_at) - min(o.ordered_at))) / 86400.0 / (count(*) - 1))::int
          else null end as avg_gap,
        bool_or(exists (select 1 from order_items oi where oi.order_id = o.id and oi.category = 'subscription')) as is_sub
      from orders o group by o.customer_id
    ) sub
    where ${oneCustomerJoin} sub.customer_id = c.id
  `);
}
