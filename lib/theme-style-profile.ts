import AdmZip from "adm-zip";
import type { LoadedSiteConfig } from "@/lib/config-loader";
import type { LogSink } from "@/lib/pipeline-logger";
import { createPipelineLogger } from "@/lib/pipeline-logger";
import type { ContentFormat } from "@/lib/content-format";
import { detectThemeSlugFromZip, resolveLocalThemePath } from "@/lib/themeDeployer";
import { normalizeWpUrl, wpRequest } from "@/lib/wordpress-client";

export type ThemePaletteSwatch = {
  name: string;
  slug: string;
  color: string;
};

export type ThemeStyleProfile = {
  source: "none" | "zip" | "live" | "combined";
  themeName?: string;
  themeSlug?: string;
  isBlockTheme: boolean;
  palette: ThemePaletteSwatch[];
  fonts: string[];
  cssVariables: string[];
  layoutClasses: string[];
  buttonClasses: string[];
  headingClasses: string[];
  otherClasses: string[];
  notes: string[];
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CSS_CHARS = 350_000;
const MAX_PROMPT_CLASSES = 28;

const cache = new Map<
  string,
  { expires: number; profile: ThemeStyleProfile }
>();

const LAYOUT_HINT =
  /container|wrapper|wrap|inner|content|section|hero|banner|grid|row|col|column|alignwide|alignfull|entry|site-main|wp-block-group|wp-block-columns|is-layout/i;
const BUTTON_HINT =
  /btn|button|cta|wp-element-button|wp-block-button/i;
const HEADING_HINT = /heading|title|has-.+-font-size|wp-block-heading/i;
const SKIP_CLASS =
  /^(fa|fab|fas|far|fal|eicon|dashicons|emoji|screen-reader|sr-only|hidden|js-|wp-admin)/i;

type ThemeJson = {
  settings?: {
    color?: {
      palette?: Array<{ name?: string; slug?: string; color?: string }>;
    };
    typography?: {
      fontFamilies?: Array<{ name?: string; fontFamily?: string; slug?: string }>;
    };
  };
};

function emptyProfile(): ThemeStyleProfile {
  return {
    source: "none",
    isBlockTheme: false,
    palette: [],
    fonts: [],
    cssVariables: [],
    layoutClasses: [],
    buttonClasses: [],
    headingClasses: [],
    otherClasses: [],
    notes: [],
  };
}

function parseStyleHeader(css: string): Record<string, string> {
  const header: Record<string, string> = {};
  const match = css.match(/\/\*[\s\S]*?\*\//);
  if (!match) return header;
  for (const line of match[0].split("\n")) {
    const pair = line.match(/^\s*\*?\s*([A-Za-z][A-Za-z0-9\s]+):\s*(.+?)\s*$/);
    if (pair) {
      header[pair[1].trim().toLowerCase()] = pair[2].trim();
    }
  }
  return header;
}

function extractCssVariables(css: string): string[] {
  const found = new Set<string>();
  const re = /(--[a-zA-Z0-9-_]+)\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    found.add(m[1]);
    if (found.size >= 40) break;
  }
  return [...found];
}

function extractClassCounts(css: string): Map<string, number> {
  const counts = new Map<string, number>();
  const re = /\.([a-zA-Z][\w-]{1,64})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const name = m[1];
    if (SKIP_CLASS.test(name) || name.length < 3) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

function extractHtmlClasses(markup: string): string[] {
  const found = new Set<string>();
  const re = /class\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markup))) {
    for (const part of m[1].split(/\s+/)) {
      if (part.length >= 3 && !SKIP_CLASS.test(part)) found.add(part);
    }
  }
  return [...found];
}

function pickTop(
  counts: Map<string, number>,
  predicate: (name: string) => boolean,
  limit: number
): string[] {
  return [...counts.entries()]
    .filter(([name]) => predicate(name))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

function mergeUnique(lists: string[][], limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const item of list) {
      if (!item || seen.has(item)) continue;
      seen.add(item);
      out.push(item);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function applyClassInventory(
  profile: ThemeStyleProfile,
  classCounts: Map<string, number>,
  extraClasses: string[]
) {
  for (const name of extraClasses) {
    classCounts.set(name, (classCounts.get(name) ?? 0) + 2);
  }

  profile.layoutClasses = pickTop(classCounts, (n) => LAYOUT_HINT.test(n), MAX_PROMPT_CLASSES);
  profile.buttonClasses = pickTop(classCounts, (n) => BUTTON_HINT.test(n), 12);
  profile.headingClasses = pickTop(classCounts, (n) => HEADING_HINT.test(n), 12);
  profile.otherClasses = pickTop(
    classCounts,
    (n) =>
      !LAYOUT_HINT.test(n) &&
      !BUTTON_HINT.test(n) &&
      !HEADING_HINT.test(n) &&
      /has-|is-|wp-block|card|feature|team|service|cta/i.test(n),
    20
  );
}

function ingestThemeJson(profile: ThemeStyleProfile, jsonText: string) {
  try {
    const json = JSON.parse(jsonText) as ThemeJson;
    const palette = json.settings?.color?.palette ?? [];
    for (const swatch of palette) {
      if (!swatch.slug || !swatch.color) continue;
      profile.palette.push({
        name: swatch.name?.trim() || swatch.slug,
        slug: swatch.slug,
        color: swatch.color,
      });
    }
    const families = json.settings?.typography?.fontFamilies ?? [];
    for (const family of families) {
      const label = family.name || family.fontFamily || family.slug;
      if (label) profile.fonts.push(label);
    }
    profile.isBlockTheme = true;
    for (const swatch of profile.palette) {
      profile.otherClasses.push(`has-${swatch.slug}-color`);
      profile.otherClasses.push(`has-${swatch.slug}-background-color`);
    }
  } catch {
    profile.notes.push("theme.json was present but could not be parsed.");
  }
}

function analyzeZip(localZipPath: string): ThemeStyleProfile {
  const profile = emptyProfile();
  profile.source = "zip";
  profile.themeSlug = detectThemeSlugFromZip(localZipPath);

  const zip = new AdmZip(localZipPath);
  const entries = zip.getEntries();
  const classCounts = new Map<string, number>();
  const extraClasses: string[] = [];
  let cssBudget = 0;

  const hasThemeJson = entries.some(
    (e) => !e.isDirectory && e.entryName.replace(/\\/g, "/").toLowerCase().endsWith("theme.json")
  );
  const hasHtmlTemplates = entries.some((e) =>
    /\/templates\/.+\.html$/i.test(e.entryName.replace(/\\/g, "/"))
  );
  if (hasThemeJson || hasHtmlTemplates) profile.isBlockTheme = true;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = entry.entryName.replace(/\\/g, "/").toLowerCase();
    if (name.includes("node_modules/") || name.includes("/vendor/")) continue;

    if (name.endsWith("style.css") && name.split("/").filter(Boolean).length <= 3) {
      const css = entry.getData().toString("utf8").slice(0, MAX_CSS_CHARS);
      const header = parseStyleHeader(css);
      profile.themeName = header["theme name"] || profile.themeName;
      profile.cssVariables = mergeUnique(
        [profile.cssVariables, extractCssVariables(css)],
        40
      );
      mergeCounts(classCounts, extractClassCounts(css));
      cssBudget += css.length;
    } else if (name.endsWith("theme.json") && name.split("/").filter(Boolean).length <= 3) {
      ingestThemeJson(profile, entry.getData().toString("utf8"));
    } else if (
      name.endsWith(".css") &&
      cssBudget < MAX_CSS_CHARS * 2 &&
      !/rtl\.css$/.test(name)
    ) {
      const css = entry.getData().toString("utf8").slice(0, 120_000);
      profile.cssVariables = mergeUnique(
        [profile.cssVariables, extractCssVariables(css)],
        40
      );
      mergeCounts(classCounts, extractClassCounts(css));
      cssBudget += css.length;
    } else if (/\.(php|html)$/.test(name) && extraClasses.length < 200) {
      extraClasses.push(
        ...extractHtmlClasses(entry.getData().toString("utf8").slice(0, 80_000))
      );
    }

    if (/elementor/i.test(name)) {
      addNote(profile, "Theme package includes Elementor — automation may emit Elementor JSON layouts.");
    }
    if (/divi|wpb_content|vc_row/i.test(name)) {
      addNote(profile, "Theme package includes Divi/page-builder assets — automation may emit Divi shortcodes.");
    }
  }

  applyClassInventory(profile, classCounts, extraClasses);
  if (!profile.themeName && profile.themeSlug) {
    profile.themeName = profile.themeSlug;
  }
  return profile;
}

function mergeCounts(target: Map<string, number>, extra: Map<string, number>) {
  for (const [name, count] of extra) {
    target.set(name, (target.get(name) ?? 0) + count);
  }
}

function addNote(profile: ThemeStyleProfile, note: string) {
  if (!profile.notes.includes(note)) profile.notes.push(note);
}

async function fetchActiveThemeMeta(
  config: LoadedSiteConfig
): Promise<{ name?: string; stylesheet?: string }> {
  try {
    const themes = await wpRequest<
      Array<{
        stylesheet?: string;
        status?: string;
        name?: { rendered?: string } | string;
      }>
    >(config, "/wp-json/wp/v2/themes?status=active");

    const active = Array.isArray(themes)
      ? themes.find((t) => t.status === "active") ?? themes[0]
      : undefined;
    if (!active) return {};
    const name =
      typeof active.name === "string"
        ? active.name
        : active.name?.rendered;
    return { name, stylesheet: active.stylesheet };
  } catch {
    return {};
  }
}

async function fetchLiveThemeCss(wpUrl: string): Promise<string> {
  const base = normalizeWpUrl(wpUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(base, {
      signal: controller.signal,
      headers: { Accept: "text/html" },
      cache: "no-store",
    });
    const html = await res.text();
    const hrefs = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)]
      .map((tag) => tag[0].match(/href=["']([^"']+)["']/i)?.[1])
      .filter((href): href is string => Boolean(href))
      .filter((href) => /wp-content\/themes\//i.test(href))
      .slice(0, 3);

    const chunks: string[] = [];
    for (const href of hrefs) {
      const url = href.startsWith("http")
        ? href
        : href.startsWith("//")
          ? `https:${href}`
          : `${base}${href.startsWith("/") ? href : `/${href}`}`;
      try {
        const cssRes = await fetch(url, {
          signal: AbortSignal.timeout(8000),
          cache: "no-store",
        });
        if (!cssRes.ok) continue;
        chunks.push((await cssRes.text()).slice(0, 180_000));
      } catch {
        /* skip unreachable stylesheet */
      }
    }
    return chunks.join("\n");
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function mergeProfiles(
  zip: ThemeStyleProfile | null,
  live: ThemeStyleProfile | null
): ThemeStyleProfile {
  if (zip && live) {
    return {
      source: "combined",
      themeName: zip.themeName || live.themeName,
      themeSlug: zip.themeSlug || live.themeSlug,
      isBlockTheme: zip.isBlockTheme || live.isBlockTheme,
      palette: mergeUnique(
        [zip.palette.map((p) => JSON.stringify(p)), live.palette.map((p) => JSON.stringify(p))],
        24
      ).map((s) => JSON.parse(s) as ThemePaletteSwatch),
      fonts: mergeUnique([zip.fonts, live.fonts], 8),
      cssVariables: mergeUnique([zip.cssVariables, live.cssVariables], 40),
      layoutClasses: mergeUnique([zip.layoutClasses, live.layoutClasses], MAX_PROMPT_CLASSES),
      buttonClasses: mergeUnique([zip.buttonClasses, live.buttonClasses], 12),
      headingClasses: mergeUnique([zip.headingClasses, live.headingClasses], 12),
      otherClasses: mergeUnique([zip.otherClasses, live.otherClasses], 20),
      notes: mergeUnique([zip.notes, live.notes], 8),
    };
  }
  return zip ?? live ?? emptyProfile();
}

function profileFromCss(
  css: string,
  meta: { name?: string; stylesheet?: string }
): ThemeStyleProfile {
  const profile = emptyProfile();
  profile.source = "live";
  profile.themeName = meta.name;
  profile.themeSlug = meta.stylesheet;
  profile.cssVariables = extractCssVariables(css);
  applyClassInventory(profile, extractClassCounts(css), []);
  return profile;
}

export function formatThemeStylePrompt(
  profile: ThemeStyleProfile,
  contentFormat: ContentFormat = "html"
): string {
  if (profile.source === "none") {
    return `THEME STYLE GUIDE:
No theme stylesheet profile was available.
Use clean semantic HTML for the editor content area (no header/footer/nav).
Light inline CSS is allowed only for spacing and layout.`;
  }

  const paletteLines = profile.palette
    .slice(0, 12)
    .map((p) => `- ${p.name} (${p.color}) slug: ${p.slug} → classes has-${p.slug}-color, has-${p.slug}-background-color`)
    .join("\n");

  const lines = [
    "ACTIVE THEME STYLE GUIDE (match this look — do not invent a competing design system):",
    `Theme: ${profile.themeName || profile.themeSlug || "uploaded theme"} (${profile.themeSlug || "unknown slug"})`,
    `Type: ${profile.isBlockTheme ? "block theme (theme.json)" : "classic PHP theme"}`,
    `Profile source: ${profile.source}`,
    paletteLines ? `Palette:\n${paletteLines}` : "",
    profile.fonts.length ? `Fonts: ${profile.fonts.slice(0, 6).join("; ")}` : "",
    profile.cssVariables.length
      ? `CSS variables to prefer for color/spacing: ${profile.cssVariables.slice(0, 20).join(", ")}`
      : "",
    profile.layoutClasses.length
      ? `Layout / section classes: ${profile.layoutClasses.join(", ")}`
      : "",
    profile.buttonClasses.length
      ? `Button / CTA classes: ${profile.buttonClasses.join(", ")}`
      : "",
    profile.headingClasses.length
      ? `Heading classes: ${profile.headingClasses.join(", ")}`
      : "",
    profile.otherClasses.length
      ? `Other useful theme classes: ${profile.otherClasses.join(", ")}`
      : "",
    profile.notes.length ? `Notes: ${profile.notes.join(" ")}` : "",
    contentFormat === "gutenberg"
      ? `RULES:
- Use Gutenberg core blocks only; prefer wp-block-group / wp-block-columns for layout.
- Apply has-* palette classes on groups, headings, and buttons when listed above.
- Do NOT duplicate site header, footer, or navigation.`
      : contentFormat === "elementor" || contentFormat === "divi"
        ? `RULES:
- Copy and section structure should match this brand palette and tone.
- Builder layout is generated server-side — focus JSON section copy on clarity and conversion.`
        : `RULES:
- Output ONLY the main content HTML that belongs in the WordPress editor (between the theme header and footer).
- Wrap sections with the theme layout/container classes listed above when they fit.
- Style CTAs with the theme button classes — do not skin buttons with large inline CSS.
- Use palette slugs / CSS variables for color instead of random hex values.
- Do NOT include <header>, <footer>, <nav>, logo bars, or site chrome (the theme already renders those).
- Avoid heavy inline CSS. Add a small style attribute only when no theme class covers the need.
- Keep semantic tags (<section>, <h1>–<h3>, <p>, <ul>, <a>, <button>) so SEO still works.`,
  ];

  return lines.filter(Boolean).join("\n");
}

export async function loadThemeStyleProfile(
  config: LoadedSiteConfig,
  onLog?: LogSink
): Promise<ThemeStyleProfile> {
  const cacheKey = `${config.id}:${config.activeThemeZipPath ?? ""}:${config.wpUrl}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.profile;
  }

  const log = createPipelineLogger(onLog ?? (() => undefined));
  let zipProfile: ThemeStyleProfile | null = null;
  let liveProfile: ThemeStyleProfile | null = null;

  if (config.activeThemeZipPath?.trim()) {
    try {
      zipProfile = analyzeZip(resolveLocalThemePath(config.activeThemeZipPath));
    } catch (err) {
      log.warn(
        `Could not inspect uploaded theme zip: ${err instanceof Error ? err.message : "unknown error"}`,
        { phase: "phase2" }
      );
    }
  }

  const meta = await fetchActiveThemeMeta(config);
  const liveCss = await fetchLiveThemeCss(config.wpUrl);
  if (liveCss.trim()) {
    liveProfile = profileFromCss(liveCss, meta);
  } else if (meta.name || meta.stylesheet) {
    liveProfile = emptyProfile();
    liveProfile.source = "live";
    liveProfile.themeName = meta.name;
    liveProfile.themeSlug = meta.stylesheet;
  }

  const profile = mergeProfiles(zipProfile, liveProfile);
  if (profile.source === "none") {
    log.warn(
      "No theme style profile found. Content will use generic semantic HTML.",
      { phase: "setup" }
    );
  } else {
    log.info(
      `Theme style profile loaded (${profile.source}) for "${profile.themeName || profile.themeSlug || "theme"}" — ${profile.layoutClasses.length} layout class(es), ${profile.buttonClasses.length} button class(es).`,
      { phase: "setup" }
    );
  }

  cache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, profile });
  return profile;
}
