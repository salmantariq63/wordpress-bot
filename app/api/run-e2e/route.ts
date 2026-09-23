import { NextRequest } from "next/server";
import { loadSiteConfig, updateSiteStatus } from "@/lib/config-loader";
import { executePhase7E2E } from "@/lib/phase7E2EOrchestrator";
import { SINGLE_CONFIG_ID } from "@/lib/site-config";
import { createPipelineSseResponse } from "@/lib/sse-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

/** Phase 7 — full connected pipeline (does not change Phase 1–5 standalone routes). */
export async function POST(request: NextRequest) {
  let configId = SINGLE_CONFIG_ID;
  let includeSiteSetup = true;
  let includeBlog: boolean | undefined;
  let includeContentUpdate: boolean | undefined;
  let includeSocial: boolean | undefined;
  let topicCount: number | undefined;

  try {
    const body = (await request.json()) as {
      configId?: string;
      includeSiteSetup?: boolean;
      includeBlog?: boolean;
      includeContentUpdate?: boolean;
      includeSocial?: boolean;
      topicCount?: number;
    };
    if (body.configId?.trim()) configId = body.configId.trim();
    if (typeof body.includeSiteSetup === "boolean") {
      includeSiteSetup = body.includeSiteSetup;
    }
    if (typeof body.includeBlog === "boolean") includeBlog = body.includeBlog;
    if (typeof body.includeContentUpdate === "boolean") {
      includeContentUpdate = body.includeContentUpdate;
    }
    if (typeof body.includeSocial === "boolean") {
      includeSocial = body.includeSocial;
    }
    if (typeof body.topicCount === "number" && body.topicCount > 0) {
      topicCount = Math.min(10, Math.floor(body.topicCount));
    }
  } catch {
    /* defaults */
  }

  return createPipelineSseResponse(async (onLog) => {
    try {
      await loadSiteConfig(configId);
      onLog({
        timestamp: new Date().toISOString(),
        level: "info",
        phase: "phase7",
        message: "Phase 7 end-to-end workflow started.",
      });

      await executePhase7E2E(configId, onLog, {
        includeSiteSetup,
        includeBlog,
        includeContentUpdate,
        includeSocial,
        topicCount,
      });

      onLog({
        timestamp: new Date().toISOString(),
        level: "info",
        phase: "complete",
        message: "Phase 7 completed — status COMPLETED.",
      });
    } catch (err) {
      try {
        await updateSiteStatus(configId, "FAILED");
      } catch {
        /* ignore */
      }
      throw err;
    }
  });
}
