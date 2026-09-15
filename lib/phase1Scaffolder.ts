import { loadSiteConfig } from "@/lib/config-loader";
import type { LogSink } from "@/lib/pipeline-logger";
import { createPipelineLogger } from "@/lib/pipeline-logger";
import type { ScaffoledPage } from "@/lib/pipeline-types";
import { assignWordPressReadingSettings } from "@/lib/wordpress-page-roles";
import { titleToSlug, wpRequest, type WpPage } from "@/lib/wordpress-client";

function pageTitleFromConfig(title: string): string {
  return title.trim();
}

export async function executePhase1(
  configId: string,
  onLog?: LogSink
): Promise<ScaffoledPage[]> {
  const log = createPipelineLogger(onLog ?? (() => undefined));
  const config = await loadSiteConfig(configId);

  log.info("Phase 1: configuring WordPress site settings…", { phase: "phase1" });

  try {
    await wpRequest(config, "/wp-json/wp/v2/settings", {
      method: "POST",
      body: JSON.stringify({
        title: config.businessName,
        description: `${config.niche} — ${config.targetAudience}`.slice(0, 160),
      }),
    });
    log.info("Site title and tagline updated.", { phase: "phase1" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Settings update failed.";
    log.warn(`Could not update site settings: ${message}`, { phase: "phase1" });
  }

  log.info("Fetching existing WordPress pages…", { phase: "phase1" });
  const existing = await wpRequest<WpPage[]>(
    config,
    "/wp-json/wp/v2/pages?per_page=100&status=draft,publish,pending,private&context=edit"
  );

  const existingBySlug = new Map<string, WpPage>();
  for (const page of existing) {
    existingBySlug.set(page.slug.toLowerCase(), page);
  }

  const results: ScaffoledPage[] = [];

  for (const pageTitle of config.pagesToBuildList) {
    const title = pageTitleFromConfig(pageTitle);
    const slug = titleToSlug(title) || "page";
    const found = existingBySlug.get(slug);

    if (found) {
      log.info(`Page "${title}" already exists (id ${found.id}).`, {
        phase: "phase1",
        pageTitle: title,
        pageId: found.id,
      });
      results.push({
        id: found.id,
        title,
        slug: found.slug,
        status: found.status,
      });
      continue;
    }

    log.info(`Creating draft page "${title}"…`, { phase: "phase1", pageTitle: title });

    const created = await wpRequest<WpPage>(config, "/wp-json/wp/v2/pages?context=edit", {
      method: "POST",
      body: JSON.stringify({
        title,
        slug,
        status: "draft",
        content: `<p>Placeholder content for ${title}. Grok will replace this in Phase 2.</p>`,
      }),
    });

    results.push({
      id: created.id,
      title,
      slug: created.slug,
      status: created.status,
    });

    log.info(`Created draft page "${title}" (id ${created.id}).`, {
      phase: "phase1",
      pageTitle: title,
      pageId: created.id,
    });
  }

  await assignWordPressReadingSettings(config, results, onLog);

  log.info(`Phase 1 complete: ${results.length} page(s) ready.`, { phase: "phase1" });
  return results;
}
