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

// Numeric rank for the SUCCESS ladder. `failed` is deliberately OFF the ladder
// (sentinel -1): it is a terminal branch off queued/sent, handled exclusively
// by the two explicit guards in applyEvent below — never by the generic
// monotonic rank comparison. Giving it a ladder rank (it used to share 2 with
// delivered) made the generic guard accidentally load-bearing for failed
// semantics; the sentinel makes "you must handle failed explicitly" impossible
// to miss.
export const FAILED_RANK = -1;

export const STATE_RANK: Record<CommState, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  failed: FAILED_RANK,
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

  // `failed` only applies from queued/sent (compare state names, not ranks —
  // the guard must not silently shift if the ladder is ever renumbered).
  // Arriving after the message was already delivered/opened/… it is stale →
  // recorded, not applied.
  if (event === "failed") {
    if (current === "queued" || current === "sent") {
      return { state: "failed", rank: FAILED_RANK, applied: true };
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
