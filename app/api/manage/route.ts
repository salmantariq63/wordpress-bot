import { NextResponse } from "next/server";
import { getManagementOverview } from "@/lib/phase8Management";
import { SINGLE_CONFIG_ID } from "@/lib/site-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Phase 8 — management overview (status, approvals, schedules, failures). */
export async function GET() {
  try {
    const overview = await getManagementOverview(SINGLE_CONFIG_ID);
    return NextResponse.json(overview);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load management overview.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
