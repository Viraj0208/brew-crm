import { GeminiProvider } from "./gemini";
import { GroqProvider } from "./groq";
import { LlmError, type ChatArgs, type LlmProvider, type LlmTurn } from "./provider";

export * from "./provider";

function build(name: string): LlmProvider | null {
  if (name === "gemini") {
    const key = process.env.GEMINI_API_KEY;
    return key ? new GeminiProvider(key) : null;
  }
  if (name === "groq") {
    const key = process.env.GROQ_API_KEY;
    return key ? new GroqProvider(key) : null;
  }
  return null;
}

/**
 * Provider with automatic failover. Primary = LLM_PROVIDER (default gemini);
 * on a SAFETY blank or rate_limit, reprompt once then fall back to LLM_FALLBACK
 * (default groq) if its key is configured. One canonical interface throughout.
 */
export function getLlm(): LlmProvider {
  const primaryName = process.env.LLM_PROVIDER ?? "gemini";
  const fallbackName = process.env.LLM_FALLBACK ?? "groq";
  const primary = build(primaryName);
  if (!primary) {
    throw new LlmError(`LLM provider '${primaryName}' has no API key configured`, "transport");
  }
  const fallback = fallbackName !== primaryName ? build(fallbackName) : null;

  return {
    name: primary.name,
    async chat(args: ChatArgs): Promise<LlmTurn> {
      try {
        return await primary.chat(args);
      } catch (err) {
        const soft = err instanceof LlmError && (err.kind === "safety" || err.kind === "rate_limit");
        if (soft) {
          // one reprompt on the primary
          try {
            return await primary.chat(args);
          } catch {
            if (fallback) return fallback.chat(args);
          }
        }
        throw err;
      }
    },
  };
}
