import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { communications } from "@/lib/db/schema";
import type { CommState } from "./stateMachine";

export type StateCounts = Record<CommState, number>;

export interface Funnel {
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  read: number;
  clicked: number;
  failed: number;
}

/**
 * Assemble a cumulative funnel from per-state counts. Pure.
 *
 * `communications.state` is the MAX rank a comm reached, so each funnel tier is
 * the sum of its own state plus everything past it (a clicked comm also counts
 * as delivered+opened+read). `failed` is a side branch off sent and is excluded
 * from the delivered tier.
 */
export function assembleFunnel(c: StateCounts): Funnel {
  const total =
    c.queued + c.sent + c.delivered + c.failed + c.opened + c.read + c.clicked;
  return {
    total,
    sent: c.sent + c.delivered + c.failed + c.opened + c.read + c.clicked,
    delivered: c.delivered + c.opened + c.read + c.clicked,
    opened: c.opened + c.read + c.clicked,
    read: c.read + c.clicked,
    clicked: c.clicked,
    failed: c.failed,
  };
}

const ZERO: StateCounts = {
  queued: 0,
  sent: 0,
  delivered: 0,
  failed: 0,
  opened: 0,
  read: 0,
  clicked: 0,
};

/** Campaign funnel via a single GROUP BY state (indexed: comm_campaign_state_idx). */
export async function campaignFunnel(campaignId: string): Promise<Funnel> {
  const rows = await db
    .select({ state: communications.state, n: sql<number>`count(*)::int` })
    .from(communications)
    .where(eq(communications.campaignId, campaignId))
    .groupBy(communications.state);

  const counts: StateCounts = { ...ZERO };
  for (const r of rows) counts[r.state] = r.n;
  return assembleFunnel(counts);
}
