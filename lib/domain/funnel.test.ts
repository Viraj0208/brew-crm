import { describe, it, expect } from "vitest";
import { assembleFunnel, type StateCounts } from "./funnel";

const counts = (p: Partial<StateCounts>): StateCounts => ({
  queued: 0,
  sent: 0,
  delivered: 0,
  failed: 0,
  opened: 0,
  read: 0,
  clicked: 0,
  ...p,
});

describe("assembleFunnel", () => {
  it("is cumulative — a clicked comm counts at every tier below it", () => {
    const f = assembleFunnel(counts({ clicked: 3 }));
    expect(f).toMatchObject({
      total: 3,
      sent: 3,
      delivered: 3,
      opened: 3,
      read: 3,
      clicked: 3,
      failed: 0,
    });
  });

  it("excludes failed from the delivered tier but counts it as sent", () => {
    const f = assembleFunnel(counts({ delivered: 5, failed: 2 }));
    expect(f.sent).toBe(7);
    expect(f.delivered).toBe(5);
    expect(f.failed).toBe(2);
  });

  it("sums a realistic mixed funnel matching fixture totals", () => {
    const f = assembleFunnel(
      counts({ queued: 1, sent: 2, failed: 1, delivered: 4, opened: 3, read: 2, clicked: 1 }),
    );
    expect(f.total).toBe(14);
    expect(f.sent).toBe(13); // all but queued
    expect(f.delivered).toBe(10); // 4+3+2+1
    expect(f.opened).toBe(6); // 3+2+1
    expect(f.read).toBe(3); // 2+1
    expect(f.clicked).toBe(1);
    expect(f.failed).toBe(1);
  });

  it("monotonically narrows down the funnel", () => {
    const f = assembleFunnel(
      counts({ sent: 5, delivered: 4, opened: 3, read: 2, clicked: 1 }),
    );
    expect(f.sent).toBeGreaterThanOrEqual(f.delivered);
    expect(f.delivered).toBeGreaterThanOrEqual(f.opened);
    expect(f.opened).toBeGreaterThanOrEqual(f.read);
    expect(f.read).toBeGreaterThanOrEqual(f.clicked);
  });
});
