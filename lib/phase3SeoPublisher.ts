import { loadSiteConfig } from "@/lib/config-loader";
import { createGrokClient, extractJsonObject, GROK_MODEL } from "@/lib/grok-client";
import { createGrokChatCompletion } from "@/lib/grok-request";
import type { LogSink } from "@/lib/pipeline-logger";
import { createPipelineLogger } from "@/lib/pipeline-logger";
import type { ScaffoledPage, SeoValidationPayload } from "@/lib/pipeline-types";
import {
  assignWordPressReadingSettings,
  isHomePage,
  publishSlugForPage,
} from "@/lib/wordpress-page-roles";
import { normalizePageHtml } from "@/lib/page-content-html";
import { replaceWordPressPageContent } from "@/lib/wordpress-page-content";
import { wpRequest, type WpPage } from "@/lib/wordpress-client";

function buildSeoSystemPrompt(): string {
  return `You are a technical SEO auditor for WordPress landing pages.
Analyze HTML against target keywords and return ONLY a JSON object with this exact shape:
{
  "seo_title": "string under 60 chars including primary keyword",
  "meta_description": "string under 160 chars with CTA",
  "slug": "kebab-case-slug",
  "h1_count": number,
  "heading_hierarchy_valid": boolean,
  "keyword_density_passed": boolean,
  "validation_passed": boolean,
  "corrected_html": "full corrected HTML if fixes needed, otherwise repeat input HTML"
}
Rules:
- seo_title max 60 characters.
- meta_description max 160 characters.
- Ensure exactly one H1 and logical H2/H3 hierarchy in corrected_html when validation_passed is false.
- No markdown, no prose outside JSON.
- Keep corrected_html concise: only fix heading hierarchy/H1 issues; do not rewrite the entire page or add new sections.`;
}

const MAX_SEO_HTML_CHARS = 14_000;

function htmlForSeoAudit(rawHtml: string): string {
  if (rawHtml.length <= MAX_SEO_HTML_CHARS) return rawHtml;
  return `${rawHtml.slice(0, MAX_SEO_HTML_CHARS)}\n<!-- HTML truncated for SEO audit -->`;
}

function buildSeoUserPrompt(
  pageTitle: string,
  rawHtml: string,
  keywords: string[]
): string {
  return `Page title: ${pageTitle}
Target keywords: ${keywords.join(", ") || "general industry terms"}

HTML to audit (may be truncated):
${htmlForSeoAudit(rawHtml)}`;
}

function parseSeoPayload(text: string): SeoValidationPayload {
  const jsonText = extractJsonObject(text);
  const parsed = JSON.parse(jsonText) as SeoValidationPayload;

  if (
    typeof parsed.seo_title !== "string" ||
    typeof parsed.meta_description !== "string" ||
    typeof parsed.slug !== "string" ||
    typeof parsed.corrected_html !== "string" ||
    typeof parsed.validation_passed !== "boolean"
  ) {
    throw new Error("Grok SEO response missing required fields.");
  }

  return parsed;
}

function truncateMeta(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

export async function executePhase3(
  configId: string,
  pageId: number,
  pageTitle: string,
  rawHtml: string,
  onLog?: LogSink,
  pageMeta?: Pick<ScaffoledPage, "slug" | "scaffoldTitle">
): Promise<SeoValidationPayload> {
  const log = createPipelineLogger(onLog ?? (() => undefined));
  const config = await loadSiteConfig(configId);
  const client = createGrokClient(config);

  log.info(`Phase 3: SEO validation for "${pageTitle}"…`, {
    phase: "phase3",
    pageTitle,
    pageId,
  });

  const completion = await createGrokChatCompletion(
    client,
    {
      model: GROK_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSeoSystemPrompt() },
        {
          role: "user",
          content: buildSeoUserPrompt(
            pageTitle,
            rawHtml,
            config.targetKeywordsList
          ),
        },
      ],
    },
    {
      label: `Phase 3 SEO for "${pageTitle}"`,
      onLog,
    }
  );

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error(`Grok returned empty SEO payload for "${pageTitle}".`);
  }

  const seo = parseSeoPayload(content);
  const pickedHtml =
    seo.validation_passed || !seo.corrected_html.trim()
      ? rawHtml
      : seo.corrected_html.length > rawHtml.length * 1.5
        ? rawHtml
        : seo.corrected_html;
  const finalHtml = normalizePageHtml(pickedHtml);

  if (!seo.validation_passed) {
    log.warn(
      finalHtml !== normalizePageHtml(rawHtml)
        ? `SEO validation flagged issues on "${pageTitle}"; applying corrected HTML.`
        : `SEO validation flagged issues on "${pageTitle}"; publishing with metadata and sanitized HTML.`,
      { phase: "phase3", pageTitle, pageId }
    );
  }

  await replaceWordPressPageContent(config, pageId, finalHtml);

  const seoTitle = truncateMeta(seo.seo_title, 60);
  const metaDescription = truncateMeta(seo.meta_description, 160);
  const scaffoldTitle = pageMeta?.scaffoldTitle?.trim() || pageTitle;
  const existingSlug = pageMeta?.slug ?? "";
  const slug = publishSlugForPage(scaffoldTitle, existingSlug, seo.slug);

  const publishBody: Record<string, unknown> = {
    status: "publish",
    slug,
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
    await wpRequest<WpPage>(
      config,
      `/wp-json/wp/v2/pages/${pageId}?context=edit`,
      {
        method: "POST",
        body: JSON.stringify(publishBody),
      }
    );
    log.info(`Page "${pageTitle}" published with SEO metadata.`, {
      phase: "phase3",
      pageTitle,
      pageId,
    });
  } catch (err) {
    log.warn(
      "Meta fields may be restricted; retrying publish without custom meta keys.",
      { phase: "phase3", pageTitle, pageId }
    );

    await wpRequest<WpPage>(
      config,
      `/wp-json/wp/v2/pages/${pageId}?context=edit`,
      {
        method: "POST",
        body: JSON.stringify({
          status: "publish",
          slug,
          title: seoTitle,
          excerpt: metaDescription,
        }),
      }
    );

    log.info(`Page "${pageTitle}" published (title/excerpt only).`, {
      phase: "phase3",
      pageTitle,
      pageId,
    });

    if (err instanceof Error) {
      log.warn(err.message, { phase: "phase3", pageTitle, pageId });
    }
  }

  log.info(
    `SEO summary — H1: ${seo.h1_count}, hierarchy: ${seo.heading_hierarchy_valid}, keywords: ${seo.keyword_density_passed}`,
    { phase: "phase3", pageTitle, pageId }
  );

  if (isHomePage(scaffoldTitle, slug ?? existingSlug)) {
    await assignWordPressReadingSettings(
      config,
      [
        {
          id: pageId,
          title: scaffoldTitle,
          scaffoldTitle,
          slug: slug ?? existingSlug,
          status: "publish",
        },
      ],
      onLog
    );
  }

  return seo;
}
