import { loadSiteConfig } from "@/lib/config-loader";
import {
  loadGenerationContext,
  buildPageSystemPrompt,
  grokUsesJsonObject,
} from "@/lib/content-generation-context";
import {
  prepareContentFromGrok,
  savePreparedPageContent,
} from "@/lib/content-pipeline";
import { formatLabel } from "@/lib/content-format";
import { createGrokClient, GROK_MODEL } from "@/lib/grok-client";
import { createGrokChatCompletion } from "@/lib/grok-request";
import type { LogSink } from "@/lib/pipeline-logger";
import { createPipelineLogger } from "@/lib/pipeline-logger";
import type { Phase2Result } from "@/lib/pipeline-types";
import { isHomePage } from "@/lib/wordpress-page-roles";

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
- Produce a FULL landing page body with at least 6 distinct sections (hero, value prop, services overview, benefits, trust/proof, FAQ or process, final CTA).
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

export async function executePhase2(
  configId: string,
  pageId: number,
  pageTitle: string,
  onLog?: LogSink
): Promise<Phase2Result> {
  const log = createPipelineLogger(onLog ?? (() => undefined));
  const config = await loadSiteConfig(configId);
  const client = createGrokClient(config);
  const genCtx = await loadGenerationContext(config, onLog);

  log.info(
    `Phase 2: generating ${formatLabel(genCtx.format)} content for "${pageTitle}"…`,
    {
      phase: "phase2",
      pageTitle,
      pageId,
    }
  );

  const completion = await createGrokChatCompletion(
    client,
    {
      model: GROK_MODEL,
      temperature: 0.7,
      ...(grokUsesJsonObject(genCtx.format)
        ? { response_format: { type: "json_object" as const } }
        : {}),
      messages: [
        {
          role: "system",
          content: buildPageSystemPrompt(genCtx.format, genCtx.themeGuide),
        },
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
    throw new Error(`Grok returned empty content for page "${pageTitle}".`);
  }

  const prepared = prepareContentFromGrok(raw, genCtx.format, onLog, {
    pageTitle,
    phase: "phase2",
  });

  if (
    isHomePage(pageTitle) &&
    genCtx.format === "html" &&
    prepared.auditHtml.length < 2500
  ) {
    log.warn(
      `Home page HTML looks short (${prepared.auditHtml.length} chars); saving anyway — re-run Phase 2 if the front page looks empty.`,
      { phase: "phase2", pageTitle, pageId }
    );
  }

  const html = await savePreparedPageContent(config, pageId, prepared);

  log.info(`Phase 2: content saved to WordPress page ${pageId}.`, {
    phase: "phase2",
    pageTitle,
    pageId,
  });

  return {
    pageId,
    pageTitle,
    html,
    contentFormat: prepared.format,
    auditHtml: prepared.auditHtml,
  };
}
