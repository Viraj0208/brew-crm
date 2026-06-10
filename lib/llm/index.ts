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
 * Provider with automatic failover. Primary = LLM_PROVIDER (default gemini).
 * On a SAFETY blank: reprompt the primary once (safety blanks are usually
 * transient phrasing), then fall back. On rate_limit: go STRAIGHT to the
 * fallback — an immediate identical retry against a rate-limited provider just
 * burns a round-trip on a guaranteed second 429. Fallback = LLM_FALLBACK
 * (default groq) when its key is configured.
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
        // AbortSignal.timeout fires a DOMException("TimeoutError") — a hung
        // primary is as good a reason to fail over as a 429.
        if (err instanceof Error && err.name === "TimeoutError") {
          if (fallback) return fallback.chat(args);
          throw new LlmError(`${primary.name} timed out`, "transport");
        }
        if (!(err instanceof LlmError)) throw err;
        if (err.kind === "rate_limit") {
          if (fallback) return fallback.chat(args);
          throw err;
        }
        if (err.kind === "safety") {
          try {
            return await primary.chat(args); // one reprompt
          } catch {
            if (fallback) return fallback.chat(args);
          }
        }
        throw err;
      }
    },
  };
}
