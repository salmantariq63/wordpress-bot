import { NextRequest } from "next/server";
import { loadSiteConfig, updateSiteStatus } from "@/lib/config-loader";
import { executePhase5 } from "@/lib/phase5ContentUpdater";
import { SINGLE_CONFIG_ID } from "@/lib/site-config";
import { createPipelineSseResponse } from "@/lib/sse-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

export async function POST(request: NextRequest) {
  let configId = SINGLE_CONFIG_ID;

  try {
    const body = (await request.json()) as { configId?: string };
    if (body.configId?.trim()) {
      configId = body.configId.trim();
    }
  } catch {
    /* use default */
  }

  return createPipelineSseResponse(async (onLog) => {
    try {
      await loadSiteConfig(configId);
      await updateSiteStatus(configId, "UPDATING");

      onLog({
        timestamp: new Date().toISOString(),
        level: "info",
        phase: "phase5",
        message: "Phase 5 content-update pipeline started — status UPDATING.",
      });

      await executePhase5(configId, onLog);

      await updateSiteStatus(configId, "COMPLETED");
      onLog({
        timestamp: new Date().toISOString(),
        level: "info",
        phase: "complete",
        message: "Phase 5 completed successfully — status COMPLETED.",
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
