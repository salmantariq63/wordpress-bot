import OpenAI from "openai";
import type { LoadedSiteConfig } from "@/lib/config-loader";

/** Default chat model for content + SEO. Override with XAI_MODEL in .env */
export const GROK_MODEL = process.env.XAI_MODEL?.trim() || "grok-4.6";

export function createGrokClient(config: LoadedSiteConfig): OpenAI {
  if (!config.xaiApiKey.trim()) {
    throw new Error("xAI API key is missing from site configuration.");
  }

  return new OpenAI({
    apiKey: config.xaiApiKey,
    baseURL: "https://api.x.ai/v1",
  });
}

export function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    return trimmed;
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  throw new Error("Could not locate JSON object in Grok response.");
}
