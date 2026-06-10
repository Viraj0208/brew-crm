import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { commEvents, communications, deadLetter } from "@/lib/db/schema";
import { applyEvent, type CommEventType, type CommState } from "@/lib/domain/stateMachine";

export const dynamic = "force-dynamic";

const VALID_TYPES: CommEventType[] = ["delivered", "failed", "opened", "read", "clicked"];

/**
 * SYSTEM STAR webhook. The channel POSTs lifecycle callbacks here:
 *   { event_id, comm_id, type, occurred_at }
 *
 * Guarantees:
 *  - Idempotent: dedupe on comm_events.event_id UNIQUE — a duplicate is a no-op.
 *  - Ordered: insert-event + conditional state advance run in ONE transaction
 *    with SELECT FOR UPDATE on the communication row, so concurrent callbacks
 *    for the same comm serialize. Out-of-order events are recorded (applied=
 *    false) but never regress state (see stateMachine.applyEvent).
 *  - Poison-tolerant: malformed/unknown payloads go to dead_letter and STILL
 *    return 200 — we never make the channel retry a poison event forever.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const eventId = body?.event_id;
  const commId = body?.comm_id;
  const type = body?.type;
  const occurredAtRaw = body?.occurred_at;
  const occurredAt = occurredAtRaw ? new Date(occurredAtRaw) : null;

  const malformed =
    typeof eventId !== "string" ||
    typeof commId !== "string" ||
    !VALID_TYPES.includes(type) ||
    !occurredAt ||
    Number.isNaN(occurredAt.getTime());

  if (malformed) {
    await db.insert(deadLetter).values({
      source: "receipt",
      payload: body ?? { raw: null },
      reason: "malformed receipt payload",
      eventId: typeof eventId === "string" ? eventId : null,
    });
    return NextResponse.json({ ok: true, dead_lettered: true }, { status: 200 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Lock the comm row → serialize concurrent callbacks for this comm.
      const locked = await tx.execute(sql`
        SELECT id, state FROM ${communications}
        WHERE id = ${commId}
        FOR UPDATE
      `);
      const comm = locked.rows[0] as { id: string; state: CommState } | undefined;
      if (!comm) {
        await tx.insert(deadLetter).values({
          source: "receipt",
          payload: body,
          reason: "unknown comm_id",
          eventId,
        });
        return { status: "dead", applied: false };
      }

      // Idempotency: if this event_id was already ingested, no-op.
      const existing = await tx
        .select({ applied: commEvents.applied })
        .from(commEvents)
        .where(eq(commEvents.eventId, eventId))
        .limit(1);
      if (existing.length > 0) {
        return { status: "duplicate", applied: existing[0].applied };
      }

      const decision = applyEvent(comm.state, type as CommEventType);

      await tx.insert(commEvents).values({
        eventId,
        communicationId: commId,
        type: type as CommEventType,
        occurredAt,
        applied: decision.applied,
      });

      if (decision.applied) {
        await tx
          .update(communications)
          .set({ state: decision.state, stateRank: decision.rank, lastEventAt: occurredAt })
          .where(eq(communications.id, commId));
      }

      return { status: "ok", applied: decision.applied };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    // A UNIQUE race on event_id (two identical callbacks landing together) lands
    // here — treat as idempotent success, not an error the channel should retry.
    const msg = err instanceof Error ? err.message : String(err);
    if (/unique|duplicate key/i.test(msg)) {
      return NextResponse.json({ status: "duplicate", applied: false }, { status: 200 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
