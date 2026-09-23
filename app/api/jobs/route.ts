import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SINGLE_CONFIG_ID } from "@/lib/site-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function safeFindMany<T>(
  run: () => Promise<T[]>,
  label: string
): Promise<T[]> {
  try {
    return await run();
  } catch (err) {
    console.error(`[api/jobs] ${label}:`, err);
    return [];
  }
}

/** Recent Phase 4–6 job history for the dashboard. */
export async function GET() {
  try {
    // Guard against stale Prisma clients that predate Phase 6–8 models.
    const socialDelegate = (
      prisma as unknown as {
        socialPostRecord?: { findMany: typeof prisma.blogPostRecord.findMany };
      }
    ).socialPostRecord;
    const taskDelegate = (
      prisma as unknown as {
        automationTask?: { findMany: typeof prisma.blogPostRecord.findMany };
      }
    ).automationTask;

    const [blogPosts, contentUpdates, socialPosts, failedTasks] =
      await Promise.all([
        safeFindMany(
          () =>
            prisma.blogPostRecord.findMany({
              where: { siteConfigId: SINGLE_CONFIG_ID },
              orderBy: { createdAt: "desc" },
              take: 20,
            }),
          "blogPosts"
        ),
        safeFindMany(
          () =>
            prisma.contentUpdateRecord.findMany({
              where: { siteConfigId: SINGLE_CONFIG_ID },
              orderBy: { createdAt: "desc" },
              take: 20,
            }),
          "contentUpdates"
        ),
        socialDelegate
          ? safeFindMany(
              () =>
                socialDelegate.findMany({
                  where: { siteConfigId: SINGLE_CONFIG_ID },
                  orderBy: { createdAt: "desc" },
                  take: 20,
                }),
              "socialPosts"
            )
          : Promise.resolve([]),
        taskDelegate
          ? safeFindMany(
              () =>
                taskDelegate.findMany({
                  where: { siteConfigId: SINGLE_CONFIG_ID, status: "failed" },
                  orderBy: { createdAt: "desc" },
                  take: 10,
                }),
              "failedTasks"
            )
          : Promise.resolve([]),
      ]);

    return NextResponse.json({
      blogPosts,
      contentUpdates,
      socialPosts,
      failedTasks,
      prismaClientStale: !socialDelegate || !taskDelegate,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load job history.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
