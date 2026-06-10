import { getLlm } from "@/lib/llm";
import type { CanonicalMessage, LlmProvider, ToolDef } from "@/lib/llm/provider";
import { TOOL_DEFS, TOOL_EXECUTORS } from "./tools";
import { PLAN_SYSTEM } from "./prompts";

const MAX_TOOL_CALLS = Number(process.env.LLM_MAX_TOOL_CALLS ?? 8);

// Tools the planner may call (launch_campaign + get_campaign_stats are reserved
// for the execute / propose-next phases).
const PLAN_TOOL_NAMES = ["query_customers", "create_segment", "draft_message", "pick_channel"];
const planTools: ToolDef[] = TOOL_DEFS.filter((t) => PLAN_TOOL_NAMES.includes(t.name));

export interface TraceStep {
  step: number;
  tool: string | null;
  input: unknown;
  output: unknown;
  thought: string;
}

export interface PlanJson {
  segment_id?: string;
  segment_name?: string;
  member_count?: number;
  channel?: string;
  channel_why?: string;
  message_template?: string;
  schedule?: string;
  summary?: string;
}

export interface PlanResult {
  plan: PlanJson;
  trace: TraceStep[];
  rawPlanText: string;
}

/** Extract the first JSON object from model text (prefers a ```json block). */
export function extractJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return {};
  }
}

/**
 * Run the planning tool-use loop. Sends the goal + tool decls, executes each
 * functionCall, feeds results back, and repeats until the model returns a
 * text-only plan or the tool-call budget is exhausted. Captures every step into
 * a reasoning trace.
 */
export async function runPlan(goal: string, llm: LlmProvider = getLlm()): Promise<PlanResult> {
  const messages: CanonicalMessage[] = [{ role: "user", text: `Goal: ${goal}` }];
  const trace: TraceStep[] = [];
  let toolCallCount = 0;
  let rawPlanText = "";

  for (let step = 1; step <= MAX_TOOL_CALLS + 2; step++) {
    // Once the budget is spent, drop tools to force a final plan.
    const overBudget = toolCallCount >= MAX_TOOL_CALLS;
    const turn = await llm.chat({
      systemInstruction: overBudget
        ? PLAN_SYSTEM + "\n\nYou have used your tool budget. Output the final plan JSON now."
        : PLAN_SYSTEM,
      messages,
      tools: overBudget ? [] : planTools,
    });

    if (turn.toolCalls.length > 0 && !overBudget) {
      messages.push({ role: "model", text: turn.text, toolCalls: turn.toolCalls });
      const results: { name: string; result: unknown }[] = [];
      for (const tc of turn.toolCalls) {
        toolCallCount++;
        let output: unknown;
        try {
          const exec = TOOL_EXECUTORS[tc.name];
          output = exec ? await exec(tc.args) : { error: `unknown tool ${tc.name}` };
        } catch (err) {
          output = { error: err instanceof Error ? err.message : String(err) };
        }
        results.push({ name: tc.name, result: output });
        trace.push({
          step,
          tool: tc.name,
          input: tc.args,
          output,
          thought: turn.text || `calling ${tc.name}`,
        });
      }
      messages.push({ role: "tool", results });
      continue;
    }

    // Text-only turn → the final plan.
    rawPlanText = turn.text;
    trace.push({ step, tool: null, input: null, output: null, thought: turn.text });
    break;
  }

  const plan = extractJson(rawPlanText) as PlanJson;
  return { plan, trace, rawPlanText };
}
