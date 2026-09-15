import { loadSiteConfig } from "@/lib/config-loader";
import { createGrokClient, GROK_MODEL } from "@/lib/grok-client";
import { createGrokChatCompletion } from "@/lib/grok-request";
import type { LogSink } from "@/lib/pipeline-logger";
import { createPipelineLogger } from "@/lib/pipeline-logger";
import type { Phase2Result } from "@/lib/pipeline-types";
import { wpRequest, type WpPage } from "@/lib/wordpress-client";

function buildSystemPrompt(): string {
  return `You are an expert conversion copywriter and front-end HTML author for WordPress sites.
Return ONLY valid HTML fragment content (no markdown fences, no explanations).
Use semantic, theme-agnostic markup: <section>, <div>, <h1>-<h3>, <p>, <ul>, <a>, <button>.
Apply modern inline utility-style CSS on containers and CTAs (spacing, max-width, flex/grid, readable typography).
Do NOT include WordPress block editor comments, Gutenberg blocks, Elementor/Divi shortcodes, or page-builder tags.
Include exactly one <h1> per page. Write high-converting copy aligned to the business brief.`;
}

function buildUserPrompt(
  pageTitle: string,
  brief: {
    businessName: string;
    niche: string;
    targetAudience: string;
    toneOfVoice: string;
    coreServices: string[];
    targetKeywords: string[];
  }
): string {
  return `Create full page content for: "${pageTitle}".

Business name: ${brief.businessName}
Industry / niche: ${brief.niche}
Target audience: ${brief.targetAudience}
Tone of voice: ${brief.toneOfVoice}
Core services: ${brief.coreServices.join(", ") || "N/A"}
Target keywords (use naturally): ${brief.targetKeywords.join(", ") || "N/A"}

Structure the page with hero, value proposition, services/benefits, social proof or trust section, and a strong CTA footer.
Make copy specific to the niche and audience.`;
}

function stripCodeFences(html: string): string {
  const trimmed = html.trim();
  const fenced = trimmed.match(/^```(?:html)?\s*([\s\S]*?)```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

export async function executePhase2(
  configId: string,
  pageId: number,
  pageTitle: string,
  onLog?: LogSink
): Promise<Phase2Result> {
  const log = createPipelineLogger(onLog ?? (() => undefined));
  const config = await loadSiteConfig(configId);
  const client = createGrokClient(config);

  log.info(`Phase 2: generating content for "${pageTitle}"…`, {
    phase: "phase2",
    pageTitle,
    pageId,
  });

  const completion = await createGrokChatCompletion(
    client,
    {
      model: GROK_MODEL,
      temperature: 0.7,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: buildUserPrompt(pageTitle, {
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
    {
      label: `Phase 2 content for "${pageTitle}"`,
      onLog,
    }
  );

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) {
    throw new Error(`Grok returned empty HTML for page "${pageTitle}".`);
  }

  const html = stripCodeFences(raw);

  await wpRequest<WpPage>(
    config,
    `/wp-json/wp/v2/pages/${pageId}?context=edit`,
    {
      method: "POST",
      body: JSON.stringify({ content: html }),
    }
  );

  log.info(`Phase 2: content saved to WordPress page ${pageId}.`, {
    phase: "phase2",
    pageTitle,
    pageId,
  });

  return { pageId, pageTitle, html };
}
