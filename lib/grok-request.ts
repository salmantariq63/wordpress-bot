import type OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import type { LogSink } from "@/lib/pipeline-logger";
import { createPipelineLogger } from "@/lib/pipeline-logger";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableGrokError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("rate limit") ||
    message.includes("429") ||
    message.includes("503") ||
    message.includes("502")
  );
}

export async function createGrokChatCompletion(
  client: OpenAI,
  params: ChatCompletionCreateParamsNonStreaming,
  options?: {
    label?: string;
    onLog?: LogSink;
    maxAttempts?: number;
  }
) {
  const log = createPipelineLogger(options?.onLog ?? (() => undefined));
  const maxAttempts = options?.maxAttempts ?? 3;
  const label = options?.label ?? "Grok request";

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await client.chat.completions.create(params);
    } catch (err) {
      lastError = err;
      const retryable = isRetryableGrokError(err);
      if (!retryable || attempt === maxAttempts) {
        throw err;
      }

      const waitMs = attempt * 3000;
      log.warn(
        `${label} failed (${err instanceof Error ? err.message : "unknown error"}). Retrying in ${waitMs / 1000}s (attempt ${attempt + 1}/${maxAttempts})…`,
        { phase: "phase2" }
      );
      await sleep(waitMs);
    }
  }

  throw lastError;
}
