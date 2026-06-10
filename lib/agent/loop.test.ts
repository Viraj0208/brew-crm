import { describe, it, expect } from "vitest";
import { runPlan, extractJson } from "./loop";
import type { LlmProvider, LlmTurn } from "@/lib/llm/provider";

class MockProvider implements LlmProvider {
  readonly name = "mock";
  private i = 0;
  constructor(private readonly turns: LlmTurn[]) {}
  chat(): Promise<LlmTurn> {
    return Promise.resolve(this.turns[Math.min(this.i++, this.turns.length - 1)]);
  }
}

describe("extractJson", () => {
  it("parses a ```json fenced block", () => {
    const obj = extractJson('here is the plan:\n```json\n{"channel":"email","x":1}\n```\ndone');
    expect(obj).toEqual({ channel: "email", x: 1 });
  });
  it("falls back to first {...} span", () => {
    expect(extractJson('noise {"a":2} tail')).toEqual({ a: 2 });
  });
  it("returns {} on garbage", () => {
    expect(extractJson("no json here")).toEqual({});
  });
});

describe("runPlan loop", () => {
  it("executes tool calls, captures a trace, then parses the final plan", async () => {
    const mock = new MockProvider([
      // turn 1: call two pure tools (no DB needed)
      {
        text: "Let me pick a channel and draft copy.",
        toolCalls: [
          { name: "pick_channel", args: { segment_summary: "lapsed espresso drinkers" } },
          { name: "draft_message", args: { segment_summary: "lapsed", goal: "win them back", channel: "email" } },
        ],
      },
      // turn 2: final plan, text-only
      {
        text: '```json\n{"segment_id":"seg-1","channel":"email","message_template":"Hi {{first_name}}, come back"}\n```',
        toolCalls: [],
      },
    ]);

    const { plan, trace } = await runPlan("Win back lapsed espresso drinkers", mock);

    // trace captured both tool executions + the final text step
    const tools = trace.filter((t) => t.tool).map((t) => t.tool);
    expect(tools).toEqual(["pick_channel", "draft_message"]);

    // pure executors produced real outputs
    const pc = trace.find((t) => t.tool === "pick_channel")!;
    expect((pc.output as { channel: string }).channel).toBe("email");
    const dm = trace.find((t) => t.tool === "draft_message")!;
    expect((dm.output as { message_template: string }).message_template).toContain("{{first_name}}");

    // final plan parsed
    expect(plan.segment_id).toBe("seg-1");
    expect(plan.channel).toBe("email");
  });

  it("stops at the budget and still returns a plan", async () => {
    // Always asks for a tool; loop must force a final once budget hits.
    const looping: LlmTurn = {
      text: "",
      toolCalls: [{ name: "pick_channel", args: { segment_summary: "x" } }],
    };
    const finalPlan: LlmTurn = { text: '```json\n{"channel":"sms"}\n```', toolCalls: [] };
    // 8 tool-calling turns exhaust the budget; the 9th call (tools dropped)
    // returns the final plan. The mock clamps to the last turn thereafter.
    const mock = new MockProvider([...Array(8).fill(looping), finalPlan]);
    const { plan, trace } = await runPlan("test budget", mock);
    expect(trace.filter((t) => t.tool === "pick_channel").length).toBeLessThanOrEqual(8);
    expect(plan.channel).toBe("sms");
  });
});
