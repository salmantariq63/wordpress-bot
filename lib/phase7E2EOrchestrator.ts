import { loadSiteConfig, updateSiteStatus } from "@/lib/config-loader";
import { executePhase1 } from "@/lib/phase1Scaffolder";
import { executePhase2 } from "@/lib/phase2ContentGen";
import { executePhase3 } from "@/lib/phase3SeoPublisher";
import { executePhase4 } from "@/lib/phase4BlogGenerator";
import { executePhase5 } from "@/lib/phase5ContentUpdater";
import {
  buildPublicPostUrl,
  executePhase6ForSource,
  publishDueSocialPosts,
} from "@/lib/phase6SocialMedia";
import type { LogSink } from "@/lib/pipeline-logger";
import { createPipelineLogger } from "@/lib/pipeline-logger";
import { prisma } from "@/lib/prisma";
import { deployThemeZip } from "@/lib/themeDeployer";

export type E2EOptions = {
  includeSiteSetup?: boolean;
  includeBlog?: boolean;
  includeContentUpdate?: boolean;
  includeSocial?: boolean;
  topicCount?: number;
};

/**
 * Phase 7 — connected end-to-end orchestrator.
 * Reuses existing Phase 1–6 executors without altering their standalone routes.
 */
export async function executePhase7E2E(
  configId: string,
  onLog?: LogSink,
  options?: E2EOptions
): Promise<void> {
  const log = createPipelineLogger(onLog ?? (() => undefined));
  const config = await loadSiteConfig(configId);

  const includeSiteSetup = options?.includeSiteSetup !== false;
  const includeBlog = options?.includeBlog ?? config.e2eIncludeBlog;
  const includeContentUpdate =
    options?.includeContentUpdate ?? config.e2eIncludeContentUpdate;
  const includeSocial = options?.includeSocial ?? config.e2eIncludeSocial;

  await updateSiteStatus(configId, "ORCHESTRATING");
  await prisma.automationTask.create({
    data: {
      siteConfigId: configId,
      phase: "e2e",
      title: "End-to-end workflow",
      status: "running",
      message: "Phase 7 orchestrator started",
    },
  });

  log.info(
    `Phase 7 E2E started — setup=${includeSiteSetup}, blog=${includeBlog}, updates=${includeContentUpdate}, social=${includeSocial}.`,
    { phase: "phase7" }
  );

  try {
    if (includeSiteSetup) {
      await updateSiteStatus(configId, "SETTING_UP");
      log.info("E2E: theme deploy + Phase 1 scaffold…", { phase: "phase7" });
      await deployThemeZip(configId, onLog);
      const pages = await executePhase1(configId, onLog);

      if (pages.length === 0) {
        throw new Error("Phase 1 did not return any pages to process.");
      }

      for (const page of pages) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await updateSiteStatus(configId, "POPULATING");
        const phase2 = await executePhase2(
          configId,
          page.id,
          page.scaffoldTitle,
          onLog
        );
        await updateSiteStatus(configId, "PUBLISHING");
        await executePhase3(
          configId,
          page.id,
          page.scaffoldTitle,
          phase2.html,
          onLog,
          { slug: page.slug, scaffoldTitle: page.scaffoldTitle }
        );
      }

      log.info("E2E: website live (Phases 1–3 complete).", { phase: "phase7" });
    }

    if (includeBlog) {
      await updateSiteStatus(configId, "BLOGGING");
      log.info("E2E: blog generation (Phase 4)…", { phase: "phase7" });
      const blogs = await executePhase4(configId, onLog, {
        topicCount: options?.topicCount,
      });

      if (includeSocial && config.socialEnabled) {
        await updateSiteStatus(configId, "SOCIAL");
        for (const blog of blogs) {
          if (blog.status !== "publish" && blog.status !== "draft") continue;
          await executePhase6ForSource(
            configId,
            {
              title: blog.title,
              excerpt: `${blog.title}. Keyword: ${blog.keyword}. Topic: ${blog.topic}.`,
              url: buildPublicPostUrl(config.wpUrl, blog.slug),
              sourceType: "blog",
              blogPostRecordId: blog.blogPostRecordId,
              wpPostId: blog.wpPostId,
            },
            onLog
          );
        }
      }
    }

    if (includeContentUpdate) {
      await updateSiteStatus(configId, "UPDATING");
      log.info("E2E: content monitoring & updates (Phase 5)…", {
        phase: "phase7",
      });
      const updates = await executePhase5(configId, onLog);

      if (includeSocial && config.socialEnabled) {
        await updateSiteStatus(configId, "SOCIAL");
        for (const item of updates) {
          if (item.status !== "publish" && item.status !== "draft") continue;
          await executePhase6ForSource(
            configId,
            {
              title: item.title,
              excerpt: `Updated ${item.contentType}: ${item.title}. ${item.reason}`,
              sourceType:
                item.contentType === "post" ? "post_update" : "page_update",
              wpPostId: item.wpId,
            },
            onLog
          );
        }
      }
    }

    if (includeSocial && config.socialEnabled) {
      log.info("E2E: flushing due scheduled social posts…", {
        phase: "phase7",
      });
      await publishDueSocialPosts(configId, onLog);
    }

    await updateSiteStatus(configId, "COMPLETED");
    await prisma.automationTask.create({
      data: {
        siteConfigId: configId,
        phase: "e2e",
        title: "End-to-end workflow",
        status: "completed",
        message: "Phase 7 finished successfully",
      },
    });

    log.info("Phase 7 E2E completed successfully.", { phase: "complete" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "E2E failed.";
    await prisma.automationTask.create({
      data: {
        siteConfigId: configId,
        phase: "e2e",
        title: "End-to-end workflow",
        status: "failed",
        message,
      },
    });
    throw err;
  }
}
