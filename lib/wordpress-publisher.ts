import type { LoadedSiteConfig } from "@/lib/config-loader";
import type { LogSink } from "@/lib/pipeline-logger";
import { createPipelineLogger } from "@/lib/pipeline-logger";
import type { PipelinePhase } from "@/lib/pipeline-types";
import { truncateMeta } from "@/lib/seo-audit";
import { wpRequest, type WpPage, type WpPost } from "@/lib/wordpress-client";

export type PublishStatus = "draft" | "publish";

export type PublishSeoFields = {
  seoTitle: string;
  metaDescription: string;
  slug: string;
};

/**
 * Publish or draft a WordPress page/post with SEO title, excerpt, and common SEO plugin meta.
 */
export async function publishWordPressContent(options: {
  config: LoadedSiteConfig;
  contentKind: "page" | "post";
  id: number;
  status: PublishStatus;
  seo: PublishSeoFields;
  titleLabel: string;
  phase?: PipelinePhase;
  onLog?: LogSink;
}): Promise<{ status: PublishStatus; slug: string; title: string }> {
  const {
    config,
    contentKind,
    id,
    status,
    seo,
    titleLabel,
    phase = "phase3",
    onLog,
  } = options;
  const log = createPipelineLogger(onLog ?? (() => undefined));

  const seoTitle = truncateMeta(seo.seoTitle, 60);
  const metaDescription = truncateMeta(seo.metaDescription, 160);
  const endpoint =
    contentKind === "post"
      ? `/wp-json/wp/v2/posts/${id}?context=edit`
      : `/wp-json/wp/v2/pages/${id}?context=edit`;

  const bodyWithMeta: Record<string, unknown> = {
    status,
    slug: seo.slug,
    title: seoTitle,
    excerpt: metaDescription,
    meta: {
      _yoast_wpseo_title: seoTitle,
      _yoast_wpseo_metadesc: metaDescription,
      rank_math_title: seoTitle,
      rank_math_description: metaDescription,
    },
  };

  try {
    if (contentKind === "post") {
      await wpRequest<WpPost>(config, endpoint, {
        method: "POST",
        body: JSON.stringify(bodyWithMeta),
      });
    } else {
      await wpRequest<WpPage>(config, endpoint, {
        method: "POST",
        body: JSON.stringify(bodyWithMeta),
      });
    }
    log.info(
      `${contentKind === "post" ? "Post" : "Page"} "${titleLabel}" set to ${status} with SEO metadata.`,
      { phase, pageTitle: titleLabel, pageId: id }
    );
  } catch (err) {
    log.warn(
      "Meta fields may be restricted; retrying without custom meta keys.",
      { phase, pageTitle: titleLabel, pageId: id }
    );

    const fallback = {
      status,
      slug: seo.slug,
      title: seoTitle,
      excerpt: metaDescription,
    };

    if (contentKind === "post") {
      await wpRequest<WpPost>(config, endpoint, {
        method: "POST",
        body: JSON.stringify(fallback),
      });
    } else {
      await wpRequest<WpPage>(config, endpoint, {
        method: "POST",
        body: JSON.stringify(fallback),
      });
    }

    log.info(
      `${contentKind === "post" ? "Post" : "Page"} "${titleLabel}" set to ${status} (title/excerpt only).`,
      { phase, pageTitle: titleLabel, pageId: id }
    );

    if (err instanceof Error) {
      log.warn(err.message, { phase, pageTitle: titleLabel, pageId: id });
    }
  }

  return { status, slug: seo.slug, title: seoTitle };
}
