import type { LoadedSiteConfig } from "@/lib/config-loader";
import type { LogSink } from "@/lib/pipeline-logger";
import { createPipelineLogger } from "@/lib/pipeline-logger";
import type { ScaffoledPage } from "@/lib/pipeline-types";
import { wpRequest } from "@/lib/wordpress-client";

export function isHomePage(title: string, slug?: string): boolean {
  const t = title.trim().toLowerCase();
  const s = slug?.trim().toLowerCase();
  return t === "home" || s === "home" || t === "homepage";
}

export function isBlogPage(title: string, slug?: string): boolean {
  const t = title.trim().toLowerCase();
  const s = slug?.trim().toLowerCase();
  return t === "blog" || s === "blog" || t === "news";
}

export function publishSlugForPage(
  pageTitle: string,
  existingSlug: string,
  seoSlug: string
): string | undefined {
  if (isHomePage(pageTitle, existingSlug)) {
    return existingSlug.toLowerCase() === "home" ? existingSlug : "home";
  }
  if (isBlogPage(pageTitle, existingSlug)) {
    return existingSlug.toLowerCase() === "blog" ? existingSlug : "blog";
  }
  return seoSlug.trim() || undefined;
}

export async function assignWordPressReadingSettings(
  config: LoadedSiteConfig,
  pages: ScaffoledPage[],
  onLog?: LogSink
): Promise<void> {
  const log = createPipelineLogger(onLog ?? (() => undefined));
  const home = pages.find((p) => isHomePage(p.title, p.slug));
  if (!home) {
    log.warn(
      'No "Home" page in pagesToBuild; skipping static front page assignment.',
      { phase: "phase1" }
    );
    return;
  }

  const blog = pages.find((p) => isBlogPage(p.title, p.slug));
  const payload: Record<string, string | number> = {
    show_on_front: "page",
    page_on_front: home.id,
  };
  if (blog) {
    payload.page_for_posts = blog.id;
  }

  try {
    await wpRequest(config, "/wp-json/wp/v2/settings", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    log.info(
      `Static front page set to "${home.title}" (id ${home.id})${blog ? `; posts page "${blog.title}" (id ${blog.id})` : ""}.`,
      { phase: "phase1", pageTitle: home.title, pageId: home.id }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reading settings update failed.";
    log.warn(`Could not assign front page: ${message}`, { phase: "phase1" });
  }
}
