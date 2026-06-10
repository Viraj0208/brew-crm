import { describe, it, expect } from "vitest";
import { backoffMs, MAX_ATTEMPTS } from "./outbox";

describe("backoffMs", () => {
  it("grows exponentially: 1s, 4s, 16s, 64s", () => {
    expect(backoffMs(1)).toBe(1_000);
    expect(backoffMs(2)).toBe(4_000);
    expect(backoffMs(3)).toBe(16_000);
    expect(backoffMs(4)).toBe(64_000);
  });

  it("caps at 5 minutes", () => {
    expect(backoffMs(10)).toBe(5 * 60 * 1000);
    expect(backoffMs(100)).toBe(5 * 60 * 1000);
  });

  it("never goes below the base for attempt ≤ 1", () => {
    expect(backoffMs(0)).toBe(1_000);
    expect(backoffMs(1)).toBe(1_000);
  });

  it("retires after MAX_ATTEMPTS", () => {
    expect(MAX_ATTEMPTS).toBe(5);
  });
});
