import { describe, it, expect } from "vitest";
import { TOOL_EXECUTORS, validateTokens, TOOL_DEFS } from "./tools";

describe("message token allowlist (hallucination guard)", () => {
  it("accepts the allowed tokens", () => {
    expect(() => validateTokens("Hi {{first_name}}, your {{name}} order")).not.toThrow();
  });
  it("rejects an unknown token", () => {
    expect(() => validateTokens("Hi {{email}}")).toThrow(/disallowed token/);
  });
  it("allows token-free copy", () => {
    expect(() => validateTokens("Fresh roast just dropped")).not.toThrow();
  });
});

describe("draft_message", () => {
  it("returns a template using only allowed tokens", () => {
    const out = TOOL_EXECUTORS.draft_message({
      segment_summary: "lapsed",
      goal: "come back for fresh roast",
      channel: "whatsapp",
    }) as { message_template: string };
    expect(out.message_template).toContain("{{first_name}}");
    expect(() => validateTokens(out.message_template)).not.toThrow();
  });
  it("varies the CTA by channel", () => {
    const sms = TOOL_EXECUTORS.draft_message({ segment_summary: "x", goal: "g", channel: "sms" }) as {
      message_template: string;
    };
    expect(sms.message_template).toMatch(/Reply/i);
  });
});

describe("pick_channel heuristic", () => {
  it("routes urgent goals to sms", () => {
    expect((TOOL_EXECUTORS.pick_channel({ segment_summary: "flash sale expires today" }) as { channel: string }).channel).toBe("sms");
  });
  it("routes lapsed/older audiences to email", () => {
    expect((TOOL_EXECUTORS.pick_channel({ segment_summary: "lapsed win-back" }) as { channel: string }).channel).toBe("email");
  });
  it("defaults active audiences to whatsapp", () => {
    expect((TOOL_EXECUTORS.pick_channel({ segment_summary: "active loyal buyers" }) as { channel: string }).channel).toBe("whatsapp");
  });
});

describe("tool definitions", () => {
  it("exposes exactly the 6 documented tools", () => {
    expect(TOOL_DEFS.map((t) => t.name).sort()).toEqual(
      ["create_segment", "draft_message", "get_campaign_stats", "launch_campaign", "pick_channel", "query_customers"].sort(),
    );
  });
  it("every tool parameter schema is an OBJECT with required fields", () => {
    for (const t of TOOL_DEFS) {
      expect(t.parameters.type).toBe("OBJECT");
      expect(Array.isArray(t.parameters.required)).toBe(true);
    }
  });
});
