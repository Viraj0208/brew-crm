import {
  LlmError,
  type ChatArgs,
  type CanonicalMessage,
  type LlmProvider,
  type LlmTurn,
  type ToolCall,
} from "./provider";

// Gemini function-calling adapter (§6/§7). Tool calls arrive as `functionCall`
// PARTS in candidates[].content.parts[] (not a top-level array); results go
// back as `functionResponse` parts correlated by NAME + order (no call id).
// Our canonical ToolSchema is already the Gemini OpenAPI subset (UPPERCASE
// types), so no schema translation is needed here.

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

function toContents(messages: CanonicalMessage[]): GeminiContent[] {
  const out: GeminiContent[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", parts: [{ text: m.text }] });
    } else if (m.role === "model") {
      const parts: GeminiPart[] = [];
      if (m.text) parts.push({ text: m.text });
      for (const tc of m.toolCalls ?? []) {
        parts.push({ functionCall: { name: tc.name, args: tc.args } });
      }
      out.push({ role: "model", parts });
    } else {
      // tool results — Gemini wants functionResponse parts in a role:"user" turn
      out.push({
        role: "user",
        parts: m.results.map((r) => ({
          functionResponse: {
            name: r.name,
            response: asObject(r.result),
          },
        })),
      });
    }
  }
  return out;
}

function asObject(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : { result: v };
}

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
  ) {}

  async chat({ systemInstruction, messages, tools }: ChatArgs): Promise<LlmTurn> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const body = {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: toContents(messages),
      tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }],
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.status === 429) throw new LlmError("gemini rate limited", "rate_limit");
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new LlmError(`gemini ${res.status}: ${detail.slice(0, 300)}`, "transport");
    }

    const data = (await res.json()) as {
      candidates?: { content?: GeminiContent; finishReason?: string }[];
    };
    const cand = data.candidates?.[0];
    if (!cand || cand.finishReason === "SAFETY") {
      throw new LlmError("gemini blanked candidate (safety)", "safety");
    }

    let text = "";
    const toolCalls: ToolCall[] = [];
    for (const part of cand.content?.parts ?? []) {
      if (part.text) text += part.text;
      if (part.functionCall) {
        toolCalls.push({ name: part.functionCall.name, args: part.functionCall.args ?? {} });
      }
    }
    return { text: text.trim(), toolCalls };
  }
}
