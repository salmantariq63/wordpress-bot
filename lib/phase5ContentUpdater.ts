import { loadSiteConfig } from "@/lib/config-loader";
import { createGrokClient, extractJsonObject, GROK_MODEL } from "@/lib/grok-client";
import { createGrokChatCompletion } from "@/lib/grok-request";
import {
  buildRefreshSystemPrompt,
  loadGenerationContext,
} from "@/lib/content-generation-context";
import { inferContentFormatFromStorage } from "@/lib/content-format";
import {
  prepareContentFromGrok,
  savePreparedPageContent,
  savePreparedPostContent,
} from "@/lib/content-pipeline";
import type { LogSink } from "@/lib/pipeline-logger";
import { createPipelineLogger } from "@/lib/pipeline-logger";
import type {
  ContentUpdateCandidate,
  Phase5UpdateResult,
} from "@/lib/pipeline-types";
import { prisma } from "@/lib/prisma";
import { runSeoAudit } from "@/lib/seo-audit";
import {
  listWordPressPages,
  listWordPressPosts,
  wpRenderedTitle,
  type WpPage,
  type WpPost,
} from "@/lib/wordpress-client";
import { replaceWordPressPageContent } from "@/lib/wordpress-page-content";
import { replaceWordPressPostContent } from "@/lib/wordpress-post-content";
import { publishWordPressContent } from "@/lib/wordpress-publisher";

function daysSince(isoDate: string | undefined): number | null {
  if (!isoDate) return null;
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

function contentHtml(item: WpPage | WpPost): string {
  return (item.content?.raw || item.content?.rendered || "").trim();
}

function toCandidate(
  contentType: "page" | "post",
  item: WpPage | WpPost,
  maxAgeDays: number
): ContentUpdateCandidate | null {
  const age = daysSince(item.modified || item.date);
  if (age === null || age < maxAgeDays) return null;

  const html = contentHtml(item);
  if (!html || html.length < 80) return null;

  return {
    contentType,
    wpId: item.id,
    title: wpRenderedTitle(item) || `${contentType} ${item.id}`,
    slug: item.slug,
    modified: item.modified || item.date || "",
    reason: `Last modified ${age} days ago (threshold ${maxAgeDays} days).`,
    html,
  };
}

export async function identifyContentUpdateCandidates(
  configId: string,
  onLog?: LogSink
): Promise<ContentUpdateCandidate[]> {
  const log = createPipelineLogger(onLog ?? (() => undefined));
  const config = await loadSiteConfig(configId);
  const candidates: ContentUpdateCandidate[] = [];

  log.info(
    `Phase 5: scanning for content older than ${config.updateMaxAgeDays} day(s)…`,
    { phase: "phase5" }
  );

  if (config.updateRefreshPages) {
    const pages = await listWordPressPages(config, { perPage: 50 });
    for (const page of pages) {
      const c = toCandidate("page", page, config.updateMaxAgeDays);
      if (c) candidates.push(c);
    }
  }

  if (config.updateRefreshPosts) {
    const posts = await listWordPressPosts(config, { perPage: 50 });
    for (const post of posts) {
      const c = toCandidate("post", post, config.updateMaxAgeDays);
      if (c) candidates.push(c);
    }
  }

  candidates.sort(
    (a, b) => new Date(a.modified).getTime() - new Date(b.modified).getTime()
  );

  const limited = candidates.slice(0, Math.max(1, config.updateMaxItemsPerRun));

  log.info(
    `Found ${candidates.length} candidate(s); processing up to ${limited.length}.`,
    { phase: "phase5" }
  );

  for (const c of limited) {
    log.info(`${c.contentType} "${c.title}" — ${c.reason}`, {
      phase: "phase5",
      pageTitle: c.title,
      pageId: c.wpId,
    });
  }

  return limited;
}

function buildRefreshUserPrompt(
  candidate: ContentUpdateCandidate,
  brief: {
    businessName: string;
    niche: string;
    targetAudience: string;
    toneOfVoice: string;
    coreServices: string[];
    targetKeywords: string[];
  }
): string {
  const clipped =
    candidate.html.length > 12_000
      ? `${candidate.html.slice(0, 12_000)}\n<!-- truncated -->`
      : candidate.html;

  return `Refresh this WordPress ${candidate.contentType}.

Title: ${candidate.title}
Slug: ${candidate.slug}
Why flagged: ${candidate.reason}

Business: ${brief.businessName}
Niche: ${brief.niche}
Audience: ${brief.targetAudience}
Tone: ${brief.toneOfVoice}
Services: ${brief.coreServices.join(", ") || "N/A"}
Keywords: ${brief.targetKeywords.join(", ") || "N/A"}

Current HTML:
${clipped}`;
}

type RefreshPayload = {
  needs_update: boolean;
  update_summary: string;
  improved_html: string;
};

function parseRefreshPayload(text: string): RefreshPayload {
  const jsonText = extractJsonObject(text);
  const parsed = JSON.parse(jsonText) as RefreshPayload;
  if (
    typeof parsed.needs_update !== "boolean" ||
    typeof parsed.improved_html !== "string"
  ) {
    throw new Error("Grok refresh response missing required fields.");
  }
  return {
    needs_update: parsed.needs_update,
    update_summary:
      typeof parsed.update_summary === "string"
        ? parsed.update_summary
        : "Content refresh evaluated.",
    improved_html: parsed.improved_html,
  };
}

export async function refreshContentItem(
  configId: string,
  candidate: ContentUpdateCandidate,
  onLog?: LogSink
): Promise<Phase5UpdateResult> {
  const log = createPipelineLogger(onLog ?? (() => undefined));
  const config = await loadSiteConfig(configId);
  const client = createGrokClient(config);
  const requireApproval = config.updateRequireApproval;
  const publishStatus = requireApproval ? "draft" : "publish";
  const genCtx = await loadGenerationContext(config, onLog);
  const itemFormat =
    inferContentFormatFromStorage(candidate.html) !== "html"
      ? inferContentFormatFromStorage(candidate.html)
      : genCtx.format;

  log.info(`Phase 5: regenerating "${candidate.title}" (${itemFormat})…`, {
    phase: "phase5",
    pageTitle: candidate.title,
    pageId: candidate.wpId,
  });

  const completion = await createGrokChatCompletion(
    client,
    {
      model: GROK_MODEL,
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: buildRefreshSystemPrompt(itemFormat, genCtx.themeGuide),
        },
        {
          role: "user",
          content: buildRefreshUserPrompt(candidate, {
            businessName: config.businessName,
            niche: config.niche,
            targetAudience: config.targetAudience,
            toneOfVoice: config.toneOfVoice,
            coreServices: config.coreServicesList,
            targetKeywords: config.targetKeywordsList,
          }),
        },
      ],
    },
    { label: `Phase 5 refresh for "${candidate.title}"`, onLog }
  );

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error(`Grok returned empty refresh payload for "${candidate.title}".`);
  }

  const refresh = parseRefreshPayload(content);

  if (!refresh.needs_update) {
    log.info(
      `Skipped "${candidate.title}" — Grok judged content current (${refresh.update_summary}).`,
      { phase: "phase5", pageTitle: candidate.title, pageId: candidate.wpId }
    );

    await prisma.contentUpdateRecord.create({
      data: {
        siteConfigId: configId,
        contentType: candidate.contentType,
        wpId: candidate.wpId,
        title: candidate.title,
        reason: refresh.update_summary || candidate.reason,
        status: "skipped",
        requireApproval,
      },
    });

    return {
      contentType: candidate.contentType,
      wpId: candidate.wpId,
      title: candidate.title,
      status: "skipped",
      reason: refresh.update_summary || candidate.reason,
    };
  }

  const prepared = prepareContentFromGrok(
    refresh.improved_html,
    itemFormat,
    onLog,
    {
      pageTitle: candidate.title,
      phase: "phase5",
    }
  );

  log.info(`Update plan: ${refresh.update_summary}`, {
    phase: "phase5",
    pageTitle: candidate.title,
    pageId: candidate.wpId,
  });

  let html =
    candidate.contentType === "post"
      ? await savePreparedPostContent(config, candidate.wpId, prepared)
      : await savePreparedPageContent(config, candidate.wpId, prepared);

  const seo = await runSeoAudit({
    configId,
    title: candidate.title,
    rawHtml: html,
    auditHtml: prepared.auditHtml,
    contentFormat: prepared.format,
    contentKind: candidate.contentType,
    phase: "phase5",
    onLog,
  });

  const finalWrite = {
    format: prepared.format,
    html: seo.finalHtml,
    meta: prepared.storage.meta,
  };

  if (candidate.contentType === "post") {
    html = await replaceWordPressPostContent(config, candidate.wpId, finalWrite);
  } else {
    html = await replaceWordPressPageContent(config, candidate.wpId, finalWrite);
  }

  const published = await publishWordPressContent({
    config,
    contentKind: candidate.contentType,
    id: candidate.wpId,
    status: publishStatus,
    seo: {
      seoTitle: seo.seo_title || candidate.title,
      metaDescription: seo.meta_description,
      slug: seo.slug?.trim() || candidate.slug,
    },
    titleLabel: candidate.title,
    phase: "phase5",
    onLog,
  });

  if (requireApproval) {
    log.info(
      `Saved refresh as WordPress draft for approval (${candidate.contentType} ${candidate.wpId}).`,
      { phase: "phase5", pageTitle: candidate.title, pageId: candidate.wpId }
    );
  }

  await prisma.contentUpdateRecord.create({
    data: {
      siteConfigId: configId,
      contentType: candidate.contentType,
      wpId: candidate.wpId,
      title: published.title,
      reason: refresh.update_summary || candidate.reason,
      status: published.status,
      requireApproval,
    },
  });

  // Optional Phase 6 hook — off unless socialEnabled + socialAutoGenerateOnUpdate.
  if (config.socialEnabled && config.socialAutoGenerateOnUpdate) {
    try {
      const { buildPublicPostUrl, executePhase6ForSource } = await import(
        "@/lib/phase6SocialMedia"
      );
      await executePhase6ForSource(
        configId,
        {
          title: published.title,
          excerpt: `${refresh.update_summary || candidate.reason}. ${seo.meta_description}`,
          url: buildPublicPostUrl(config.wpUrl, published.slug),
          sourceType:
            candidate.contentType === "post" ? "post_update" : "page_update",
          wpPostId: candidate.wpId,
        },
        onLog
      );
    } catch (err) {
      log.warn(
        `Phase 6 social generation failed (content update still saved): ${err instanceof Error ? err.message : "unknown error"}`,
        { phase: "phase5", pageTitle: candidate.title, pageId: candidate.wpId }
      );
    }
  }

  return {
    contentType: candidate.contentType,
    wpId: candidate.wpId,
    title: published.title,
    status: published.status,
    reason: refresh.update_summary || candidate.reason,
  };
}

/**
 * Full Phase 5 workflow: Identify → Regenerate → SEO → Auto-Fix → Publish/Draft
 */
export async function executePhase5(
  configId: string,
  onLog?: LogSink
): Promise<Phase5UpdateResult[]> {
  const log = createPipelineLogger(onLog ?? (() => undefined));
  const config = await loadSiteConfig(configId);

  log.info(
    `Phase 5 started — maxAge=${config.updateMaxAgeDays}d, approval=${config.updateRequireApproval ? "draft" : "auto-publish"}.`,
    { phase: "phase5" }
  );

  if (!config.updateRefreshPages && !config.updateRefreshPosts) {
    log.warn("Phase 5: both page and post refresh are disabled in settings.", {
      phase: "phase5",
    });
    return [];
  }

  const candidates = await identifyContentUpdateCandidates(configId, onLog);
  if (candidates.length === 0) {
    log.info("Phase 5: no stale content found matching current rules.", {
      phase: "phase5",
    });
    return [];
  }

  const results: Phase5UpdateResult[] = [];

  for (const candidate of candidates) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const result = await refreshContentItem(configId, candidate, onLog);
      results.push(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown refresh error.";
      log.error(`Failed to refresh "${candidate.title}": ${message}`, {
        phase: "phase5",
        pageTitle: candidate.title,
        pageId: candidate.wpId,
      });

      await prisma.contentUpdateRecord.create({
        data: {
          siteConfigId: configId,
          contentType: candidate.contentType,
          wpId: candidate.wpId,
          title: candidate.title,
          reason: message,
          status: "failed",
          requireApproval: config.updateRequireApproval,
        },
      });

      results.push({
        contentType: candidate.contentType,
        wpId: candidate.wpId,
        title: candidate.title,
        status: "failed",
        reason: message,
      });
    }
  }

  log.info(
    `Phase 5 complete — ${results.length} item(s): ${results.filter((r) => r.status === "publish").length} published, ${results.filter((r) => r.status === "draft").length} draft, ${results.filter((r) => r.status === "skipped").length} skipped, ${results.filter((r) => r.status === "failed").length} failed.`,
    { phase: "phase5" }
  );

  return results;
}
