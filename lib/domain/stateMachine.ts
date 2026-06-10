// Communication state machine — the ordering guarantee (SYSTEM STAR).
//
// Pure, DB-free, unit-testable. Callers (the /receipts route) wrap the
// insert-event + this conditional advance in ONE transaction with SELECT FOR
// UPDATE on the communication row so concurrent callbacks per comm serialize.
//
// Monotonic-rank rule: an incoming event advances state ONLY IF its target rank
// is strictly higher than the current rank. Equal/lower events are recorded for
// audit (applied=false) but never regress the state. A late delivered(2)
// arriving after read(4) is stored, not demoted.

export type CommState =
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "opened"
  | "read"
  | "clicked";

export type CommEventType = "delivered" | "failed" | "opened" | "read" | "clicked";

// Numeric rank — note failed and delivered share rank 2 (failed is a branch off
// sent and cannot be overtaken by, nor overtake, delivered).
export const STATE_RANK: Record<CommState, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  failed: 2,
  opened: 3,
  read: 4,
  clicked: 5,
};

const EVENT_TARGET: Record<CommEventType, CommState> = {
  delivered: "delivered",
  failed: "failed",
  opened: "opened",
  read: "read",
  clicked: "clicked",
};

export interface ApplyResult {
  /** Resulting state — unchanged from `current` when applied=false. */
  state: CommState;
  /** Rank of the resulting state. */
  rank: number;
  /** Whether the event advanced the state. False ⇒ recorded for audit only. */
  applied: boolean;
}

/**
 * Decide the next communication state for an incoming callback event.
 * Pure: same inputs → same output, no side effects.
 */
export function applyEvent(current: CommState, event: CommEventType): ApplyResult {
  const currentRank = STATE_RANK[current];

  // `failed` is terminal: once a send has failed, later success callbacks
  // (delivered/opened/…) are stale and must never resurrect it.
  if (current === "failed") {
    return { state: "failed", rank: currentRank, applied: false };
  }

  // `failed` only applies from rank ≤ 1 (queued/sent). Arriving after the
  // message was already delivered/opened/… it is stale → recorded, not applied.
  if (event === "failed") {
    if (currentRank <= STATE_RANK.sent) {
      return { state: "failed", rank: STATE_RANK.failed, applied: true };
    }
    return { state: current, rank: currentRank, applied: false };
  }

  const targetState = EVENT_TARGET[event];
  const targetRank = STATE_RANK[targetState];

  // Monotonic guard. A higher event arriving first advances rank directly —
  // gap-fill is implicit because rank only ever moves up (clicked-before-
  // delivered jumps straight to clicked).
  if (targetRank > currentRank) {
    return { state: targetState, rank: targetRank, applied: true };
  }
  return { state: current, rank: currentRank, applied: false };
}
