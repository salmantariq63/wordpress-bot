import { NextRequest, NextResponse } from "next/server";
import {
  approveBlogPost,
  approveContentUpdate,
  approveSocialPost,
  rejectSocialPost,
} from "@/lib/phase8Management";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApproveBody = {
  type: "blog" | "content_update" | "social" | "social_reject";
  id: string;
  publishNow?: boolean;
  scheduleHours?: number;
};

/** Phase 8 — approve/reject pending content & social posts. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ApproveBody;
    if (!body?.id?.trim() || !body.type) {
      return NextResponse.json(
        { error: "type and id are required." },
        { status: 400 }
      );
    }

    const id = body.id.trim();

    switch (body.type) {
      case "blog": {
        const record = await approveBlogPost(id);
        return NextResponse.json({ ok: true, record });
      }
      case "content_update": {
        const record = await approveContentUpdate(id);
        return NextResponse.json({ ok: true, record });
      }
      case "social": {
        const record = await approveSocialPost(id, {
          publishNow: body.publishNow === true,
          scheduleHours: body.scheduleHours,
        });
        return NextResponse.json({ ok: true, record });
      }
      case "social_reject": {
        const record = await rejectSocialPost(id);
        return NextResponse.json({ ok: true, record });
      }
      default:
        return NextResponse.json({ error: "Unknown type." }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Approval failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
