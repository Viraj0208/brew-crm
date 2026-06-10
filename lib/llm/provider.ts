// Canonical, provider-agnostic LLM interface (§7). The agent loop speaks ONLY
// this shape; each provider translates to its own dialect. Swapping providers
// is one env var (LLM_PROVIDER), zero call-site changes.

/** OpenAPI-subset JSON schema for a tool parameter object (Gemini-compatible). */
export interface ToolSchema {
  type: "OBJECT";
  properties: Record<string, SchemaNode>;
  required?: string[];
}
export type SchemaNode =
  | { type: "STRING"; description?: string; enum?: string[] }
  | { type: "NUMBER"; description?: string }
  | { type: "INTEGER"; description?: string }
  | { type: "BOOLEAN"; description?: string }
  | { type: "ARRAY"; description?: string; items: SchemaNode }
  | { type: "OBJECT"; description?: string; properties: Record<string, SchemaNode>; required?: string[] };

export interface ToolDef {
  name: string;
  description: string;
  parameters: ToolSchema;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

/** One assistant turn: free text and/or a set of tool calls. */
export interface LlmTurn {
  text: string;
  toolCalls: ToolCall[];
}

/** Canonical conversation message. */
export type CanonicalMessage =
  | { role: "user"; text: string }
  | { role: "model"; text: string; toolCalls?: ToolCall[] }
  | { role: "tool"; results: { name: string; result: unknown }[] };

export interface ChatArgs {
  systemInstruction: string;
  messages: CanonicalMessage[];
  tools: ToolDef[];
}

export interface LlmProvider {
  readonly name: string;
  chat(args: ChatArgs): Promise<LlmTurn>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly kind: "safety" | "rate_limit" | "transport" | "bad_output" = "transport",
  ) {
    super(message);
  }
}
