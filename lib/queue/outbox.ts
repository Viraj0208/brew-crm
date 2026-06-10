// Postgres-backed outbox (SYSTEM STAR send path).
//
// ADR-002: a Postgres-backed outbox + dead_letter table instead of a queue
// SaaS. At this scope it gives at-least-once delivery, exponential backoff and a
// DLQ with zero extra infra. At ~1M msgs/day this swaps for Kafka/SQS — the
// idempotency + state-machine logic stays, only the transport changes.
//
// Claiming uses FOR UPDATE SKIP LOCKED so concurrent worker invocations (Vercel
// Cron + the post-execute kick) never grab the same row.

import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  campaigns,
  communications,
  customers,
  deadLetter,
  outbox,
} from "@/lib/db/schema";

export const MAX_ATTEMPTS = 5;

/**
 * Exponential backoff for a failed send. `attempts` = number of tries already
 * made (1 after the first failure). 1s, 4s, 16s, 64s, … capped at 5 min. Pure.
 */
export function backoffMs(attempts: number): number {
  const base = 1000;
  const ms = base * Math.pow(4, Math.max(0, attempts - 1));
  return Math.min(ms, 5 * 60 * 1000);
}

/** A claimed unit of work, enriched with everything the channel /send needs. */
export interface ClaimedSend {
  outboxId: string;
  communicationId: string;
  attempts: number;
  recipient: string;
  message: string;
  channel: "whatsapp" | "sms" | "email";
}

/**
 * Enqueue one pending outbox row per communication. Idempotent at the caller's
 * discretion — communications are created once per (campaign, customer).
 */
export async function enqueue(communicationIds: string[]): Promise<void> {
  if (communicationIds.length === 0) return;
  await db
    .insert(outbox)
    .values(communicationIds.map((communicationId) => ({ communicationId })));
}

/**
 * Atomically claim up to `limit` due rows. Flips them pending → inflight inside
 * a transaction with SKIP LOCKED so parallel workers don't double-send, then
 * joins the comm/campaign/customer rows for the channel payload.
 */
export async function claimBatch(limit = 25): Promise<ClaimedSend[]> {
  return db.transaction(async (tx) => {
    const due = await tx.execute(sql`
      SELECT id FROM ${outbox}
      WHERE ${outbox.status} = 'pending'
        AND ${outbox.nextAttemptAt} <= now()
      ORDER BY ${outbox.nextAttemptAt} ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `);
    const ids = (due.rows as { id: string }[]).map((r) => r.id);
    if (ids.length === 0) return [];

    await tx
      .update(outbox)
      .set({ status: "inflight", attempts: sql`${outbox.attempts} + 1` })
      .where(inArray(outbox.id, ids));

    const rows = await tx
      .select({
        outboxId: outbox.id,
        communicationId: outbox.communicationId,
        attempts: outbox.attempts,
        recipient: communications.recipient,
        message: communications.renderedMessage,
        channel: campaigns.channel,
      })
      .from(outbox)
      .innerJoin(communications, eq(outbox.communicationId, communications.id))
      .innerJoin(campaigns, eq(communications.campaignId, campaigns.id))
      .innerJoin(customers, eq(communications.customerId, customers.id))
      .where(inArray(outbox.id, ids));

    return rows as ClaimedSend[];
  });
}

/** Mark a claimed row delivered-to-channel. The lifecycle now runs over /receipts. */
export async function markSent(outboxId: string): Promise<void> {
  await db.update(outbox).set({ status: "sent", lastError: null }).where(eq(outbox.id, outboxId));
}

/**
 * Record a failed send attempt. Below MAX_ATTEMPTS → back to pending with
 * backoff. At/over the cap → dead + a dead_letter audit row (source=outbox).
 */
export async function markFailed(
  claim: ClaimedSend,
  error: string,
): Promise<{ dead: boolean }> {
  const attempts = claim.attempts; // already incremented at claim time
  if (attempts >= MAX_ATTEMPTS) {
    await db.transaction(async (tx) => {
      await tx
        .update(outbox)
        .set({ status: "dead", lastError: error })
        .where(eq(outbox.id, claim.outboxId));
      await tx.insert(deadLetter).values({
        source: "outbox",
        payload: { outboxId: claim.outboxId, recipient: claim.recipient, channel: claim.channel },
        reason: error,
        communicationId: claim.communicationId,
      });
    });
    return { dead: true };
  }

  await db
    .update(outbox)
    .set({
      status: "pending",
      lastError: error,
      nextAttemptAt: new Date(Date.now() + backoffMs(attempts)),
    })
    .where(eq(outbox.id, claim.outboxId));
  return { dead: false };
}

/** Reliability counters for the worker observability page. */
export async function outboxCounts() {
  const rows = await db
    .select({ status: outbox.status, n: sql<number>`count(*)::int` })
    .from(outbox)
    .groupBy(outbox.status);
  const counts: Record<string, number> = { pending: 0, inflight: 0, sent: 0, dead: 0 };
  for (const r of rows) counts[r.status] = r.n;
  return counts;
}
