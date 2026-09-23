import { NextRequest } from "next/server";
import { loadSiteConfig, updateSiteStatus } from "@/lib/config-loader";
import {
  buildPublicPostUrl,
  executePhase6ForSource,
  publishDueSocialPosts,
} from "@/lib/phase6SocialMedia";
import { prisma } from "@/lib/prisma";
import { SINGLE_CONFIG_ID } from "@/lib/site-config";
import { createPipelineSseResponse } from "@/lib/sse-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

/**
 * Phase 6 standalone:
 * - mode=generate: social from latest published/draft blog
 * - mode=flush: publish due scheduled posts
 */
export async function POST(request: NextRequest) {
  let configId = SINGLE_CONFIG_ID;
  let mode: "generate" | "flush" = "generate";
  let blogRecordId: string | undefined;

  try {
    const body = (await request.json()) as {
      configId?: string;
      mode?: "generate" | "flush";
      blogRecordId?: string;
    };
    if (body.configId?.trim()) configId = body.configId.trim();
    if (body.mode === "flush" || body.mode === "generate") mode = body.mode;
    if (body.blogRecordId?.trim()) blogRecordId = body.blogRecordId.trim();
  } catch {
    /* defaults */
  }

  return createPipelineSseResponse(async (onLog) => {
    try {
      const config = await loadSiteConfig(configId);

      if (mode === "flush") {
        await updateSiteStatus(configId, "SOCIAL");
        const n = await publishDueSocialPosts(configId, onLog);
        await updateSiteStatus(configId, "COMPLETED");
        onLog({
          timestamp: new Date().toISOString(),
          level: "info",
          phase: "complete",
          message: `Flushed ${n} scheduled social post(s).`,
        });
        return;
      }

      if (!config.socialEnabled) {
        throw new Error(
          "Social automation is disabled. Enable it in the Social tab first."
        );
      }

      await updateSiteStatus(configId, "SOCIAL");

      const blog = blogRecordId
        ? await prisma.blogPostRecord.findFirst({
            where: { id: blogRecordId, siteConfigId: configId },
          })
        : await prisma.blogPostRecord.findFirst({
            where: {
              siteConfigId: configId,
              status: { in: ["publish", "draft"] },
            },
            orderBy: { createdAt: "desc" },
          });

      if (!blog) {
        throw new Error("No blog post found to generate social content from.");
      }

      await executePhase6ForSource(
        configId,
        {
          title: blog.title || blog.topic,
          excerpt: `${blog.topic}. Keyword: ${blog.keyword ?? ""}.`,
          url: buildPublicPostUrl(config.wpUrl, blog.slug),
          sourceType: "blog",
          blogPostRecordId: blog.id,
          wpPostId: blog.wpPostId ?? undefined,
        },
        onLog
      );

      await updateSiteStatus(configId, "COMPLETED");
      onLog({
        timestamp: new Date().toISOString(),
        level: "info",
        phase: "complete",
        message: "Phase 6 social generation completed.",
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
