import { loadSiteConfig } from "@/lib/config-loader";
import { createGrokClient, GROK_MODEL } from "@/lib/grok-client";
import { createGrokChatCompletion } from "@/lib/grok-request";
import type { LogSink } from "@/lib/pipeline-logger";
import { createPipelineLogger } from "@/lib/pipeline-logger";
import type { Phase2Result } from "@/lib/pipeline-types";
import { countChromeIssues, normalizePageHtml } from "@/lib/page-content-html";
import { isHomePage } from "@/lib/wordpress-page-roles";
import { replaceWordPressPageContent } from "@/lib/wordpress-page-content";

function buildSystemPrompt(): string {
  return `You are an expert conversion copywriter and front-end HTML author for WordPress sites.
Return ONLY valid HTML fragment content (no markdown fences, no explanations).

CRITICAL — WordPress theme context:
- The active WordPress theme already renders the site header, primary navigation, and footer.
- Output ONLY the main page body that belongs in the editor content area (between header and footer).
- Do NOT include <header>, <footer>, <nav>, site-wide menus, logo bars, copyright bars, or duplicate CTAs that belong in the theme chrome.
- On automation re-runs, output a COMPLETE replacement for the page body — never append menus, logos, or duplicate hero bars.
- Use <section> for heroes and content blocks — never wrap the page in <header> or <footer>.

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

Structure the page with hero, value proposition, services/benefits, social proof or trust section, and a strong closing CTA section (not a site footer).
Make copy specific to the niche and audience.`;
}

function buildHomePageAddon(brief: {
  businessName: string;
  coreServices: string[];
}): string {
  return `

This is the SITE HOME / FRONT PAGE (main landing page visitors see first).
Requirements:
- Produce a FULL landing page body with at least 6 distinct <section> blocks (hero, value prop, services overview, benefits, trust/proof, FAQ or process, final CTA).
- Minimum ~800 words of visible copy across sections (not counting HTML tags).
- Highlight ${brief.businessName} and primary services: ${brief.coreServices.join(", ") || "core offerings"}.
- Do NOT output only a slim hero plus header/footer-like chrome — the theme supplies navigation and footer.`;
}

function buildUserPromptForPage(
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
  const base = buildUserPrompt(pageTitle, brief);
  if (isHomePage(pageTitle)) {
    return base + buildHomePageAddon(brief);
  }
  return base;
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
          content: buildUserPromptForPage(pageTitle, {
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

  let html = normalizePageHtml(stripCodeFences(raw));
  const chromeCount = countChromeIssues(stripCodeFences(raw));
  if (chromeCount > 0) {
    log.warn(
      `Removed or converted ${chromeCount} header/footer/nav element(s) from generated HTML.`,
      { phase: "phase2", pageTitle, pageId }
    );
  }

  if (isHomePage(pageTitle) && html.length < 2500) {
    log.warn(
      `Home page HTML looks short (${html.length} chars); saving anyway — re-run Phase 2 if the front page looks empty.`,
      { phase: "phase2", pageTitle, pageId }
    );
  }

  html = await replaceWordPressPageContent(config, pageId, html);

  log.info(`Phase 2: content saved to WordPress page ${pageId}.`, {
    phase: "phase2",
    pageTitle,
    pageId,
  });

  return { pageId, pageTitle, html };
}
