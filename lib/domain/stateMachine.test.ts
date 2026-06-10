import { describe, it, expect } from "vitest";
import { applyEvent, FAILED_RANK, STATE_RANK, type CommState } from "./stateMachine";

describe("applyEvent — forward advance", () => {
  it("sent → delivered advances", () => {
    expect(applyEvent("sent", "delivered")).toEqual({
      state: "delivered",
      rank: 2,
      applied: true,
    });
  });

  it("delivered → opened → read → clicked walks the happy path", () => {
    let s: CommState = "delivered";
    for (const [evt, next] of [
      ["opened", "opened"],
      ["read", "read"],
      ["clicked", "clicked"],
    ] as const) {
      const r = applyEvent(s, evt);
      expect(r.applied).toBe(true);
      expect(r.state).toBe(next);
      s = r.state;
    }
  });
});

describe("applyEvent — out-of-order (monotonic guard)", () => {
  it("rejects a lower-rank delivered arriving after read", () => {
    const r = applyEvent("read", "delivered");
    expect(r).toEqual({ state: "read", rank: 4, applied: false });
  });

  it("rejects opened arriving after clicked", () => {
    expect(applyEvent("clicked", "opened").applied).toBe(false);
  });

  it("clicked arriving before delivered advances directly (implicit gap-fill)", () => {
    expect(applyEvent("sent", "clicked")).toEqual({
      state: "clicked",
      rank: 5,
      applied: true,
    });
  });

  it("delivered arriving while still queued advances (gap-fill from zero)", () => {
    expect(applyEvent("queued", "delivered")).toEqual({
      state: "delivered",
      rank: 2,
      applied: true,
    });
  });

  it("opened arriving before delivered advances (skips a ladder step)", () => {
    expect(applyEvent("sent", "opened")).toEqual({
      state: "opened",
      rank: 3,
      applied: true,
    });
  });
});

describe("applyEvent — duplicates are no-ops", () => {
  it("delivered + delivered does not re-apply", () => {
    expect(applyEvent("delivered", "delivered").applied).toBe(false);
  });

  it("clicked + clicked does not re-apply", () => {
    expect(applyEvent("clicked", "clicked").applied).toBe(false);
  });
});

describe("applyEvent — failed branch", () => {
  it("applies from queued", () => {
    expect(applyEvent("queued", "failed")).toEqual({
      state: "failed",
      rank: FAILED_RANK,
      applied: true,
    });
  });

  it("applies from sent", () => {
    expect(applyEvent("sent", "failed").applied).toBe(true);
  });

  it("is stale after delivered — recorded, not applied", () => {
    const r = applyEvent("delivered", "failed");
    expect(r).toEqual({ state: "delivered", rank: 2, applied: false });
  });

  it("is stale after opened", () => {
    expect(applyEvent("opened", "failed").applied).toBe(false);
  });

  it("delivered does NOT overtake failed (terminal branch)", () => {
    expect(applyEvent("failed", "delivered").applied).toBe(false);
  });

  it("failed is terminal — opened cannot resurrect it", () => {
    const r = applyEvent("failed", "opened");
    expect(r).toEqual({ state: "failed", rank: FAILED_RANK, applied: false });
  });

  it("failed is terminal — even clicked cannot resurrect it", () => {
    expect(applyEvent("failed", "clicked").applied).toBe(false);
  });
});

describe("STATE_RANK invariants", () => {
  it("failed is an off-ladder sentinel, never comparable to success ranks", () => {
    expect(STATE_RANK.failed).toBe(FAILED_RANK);
    expect(FAILED_RANK).toBeLessThan(STATE_RANK.queued);
  });

  it("ranks are strictly increasing along the success path", () => {
    expect(STATE_RANK.queued).toBeLessThan(STATE_RANK.sent);
    expect(STATE_RANK.sent).toBeLessThan(STATE_RANK.delivered);
    expect(STATE_RANK.delivered).toBeLessThan(STATE_RANK.opened);
    expect(STATE_RANK.opened).toBeLessThan(STATE_RANK.read);
    expect(STATE_RANK.read).toBeLessThan(STATE_RANK.clicked);
  });
});
