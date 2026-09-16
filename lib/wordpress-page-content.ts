import type { LoadedSiteConfig } from "@/lib/config-loader";
import { normalizePageHtml } from "@/lib/page-content-html";
import { wpRequest, type WpPage } from "@/lib/wordpress-client";

type ContentPayload = {
  content: string | { raw: string };
};

/**
 * Fully replaces page body content (avoids Gutenberg appending another HTML block on re-runs).
 */
export async function replaceWordPressPageContent(
  config: LoadedSiteConfig,
  pageId: number,
  html: string
): Promise<string> {
  const normalized = normalizePageHtml(html);
  const endpoint = `/wp-json/wp/v2/pages/${pageId}?context=edit`;

  // Clear existing blocks/content so automation re-runs do not stack duplicates.
  await wpRequest<WpPage>(config, endpoint, {
    method: "POST",
    body: JSON.stringify({ content: "" } satisfies ContentPayload),
  });

  const payloads: ContentPayload[] = [
    { content: { raw: normalized } },
    { content: normalized },
  ];

  let lastError: unknown;

  for (const payload of payloads) {
    try {
      await wpRequest<WpPage>(config, endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return normalized;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to replace WordPress page content.");
}
