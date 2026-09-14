import { NextRequest, NextResponse } from "next/server";
import { testGrokConnection, testWordPressConnection } from "@/lib/validators";

type TestConnectionBody = {
  xaiApiKey?: string;
  wpUrl?: string;
  wpUsername?: string;
  wpAppPassword?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TestConnectionBody;

    const [grok, wordpress] = await Promise.all([
      testGrokConnection(body.xaiApiKey ?? ""),
      testWordPressConnection(
        body.wpUrl ?? "",
        body.wpUsername ?? "",
        body.wpAppPassword ?? ""
      ),
    ]);

    return NextResponse.json({
      grok: {
        ok: grok.ok,
        error: grok.error ?? null,
      },
      wordpress: {
        ok: wordpress.ok,
        error: wordpress.error ?? null,
      },
      allOk: grok.ok && wordpress.ok,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Connection test failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
