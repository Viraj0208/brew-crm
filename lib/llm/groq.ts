import {
  LlmError,
  type ChatArgs,
  type CanonicalMessage,
  type LlmProvider,
  type LlmTurn,
  type SchemaNode,
  type ToolCall,
  type ToolDef,
  type ToolSchema,
} from "./provider";

// Groq fallback — OpenAI-compatible chat completions with standard
// tools/tool_calls/tool_call_id. Canonical UPPERCASE schema is downcast to
// JSON-Schema lowercase. Canonical tool results carry no id, so we synthesize
// stable ids (`call_<modelTurnIndex>_<n>`) and correlate by order.

function downcast(node: SchemaNode | ToolSchema): Record<string, unknown> {
  const t = (node as { type: string }).type.toLowerCase();
  if (t === "object") {
    const o = node as ToolSchema;
    return {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(o.properties).map(([k, v]) => [k, downcast(v)]),
      ),
      ...(o.required ? { required: o.required } : {}),
    };
  }
  if (t === "array") {
    const a = node as Extract<SchemaNode, { type: "ARRAY" }>;
    return { type: "array", items: downcast(a.items) };
  }
  const leaf = node as Extract<SchemaNode, { type: "STRING" }>;
  return { type: t, ...(leaf.enum ? { enum: leaf.enum } : {}) };
}

function toOpenAiTools(tools: ToolDef[]) {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: downcast(t.parameters) },
  }));
}

function toOpenAiMessages(system: string, messages: CanonicalMessage[]) {
  const out: Record<string, unknown>[] = [{ role: "system", content: system }];
  let modelTurn = 0;
  let lastCallIds: string[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.text });
    } else if (m.role === "model") {
      const ids = (m.toolCalls ?? []).map((_, i) => `call_${modelTurn}_${i}`);
      lastCallIds = ids;
      out.push({
        role: "assistant",
        content: m.text || null,
        ...(m.toolCalls?.length
          ? {
              tool_calls: m.toolCalls.map((tc, i) => ({
                id: ids[i],
                type: "function",
                function: { name: tc.name, arguments: JSON.stringify(tc.args) },
              })),
            }
          : {}),
      });
      modelTurn++;
    } else {
      m.results.forEach((r, i) => {
        out.push({
          role: "tool",
          tool_call_id: lastCallIds[i] ?? `call_${modelTurn}_${i}`,
          content: JSON.stringify(r.result),
        });
      });
    }
  }
  return out;
}

export class GroqProvider implements LlmProvider {
  readonly name = "groq";
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
  ) {}

  async chat({ systemInstruction, messages, tools }: ChatArgs): Promise<LlmTurn> {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: toOpenAiMessages(systemInstruction, messages),
        tools: toOpenAiTools(tools),
        tool_choice: "auto",
        temperature: 0.4,
      }),
    });

    if (res.status === 429) throw new LlmError("groq rate limited", "rate_limit");
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new LlmError(`groq ${res.status}: ${detail.slice(0, 300)}`, "transport");
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string; tool_calls?: { function: { name: string; arguments: string } }[] } }[];
    };
    const msg = data.choices?.[0]?.message;
    const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc) => ({
      name: tc.function.name,
      args: safeParse(tc.function.arguments),
    }));
    return { text: (msg?.content ?? "").trim(), toolCalls };
  }
}

function safeParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
