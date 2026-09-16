/**
 * Normalizes Grok HTML for WordPress page content (theme already provides chrome).
 */

const BLOCK_COMMENT_RE = /<!--\s*\/?wp:[\s\S]*?-->/gi;

const SITE_CHROME_SELECTORS = [
  /\b(site-header|main-header|page-header|top-bar|navbar|site-navigation|main-navigation|site-footer|colophon|footer-widgets)\b/i,
];

function looksLikeSiteChrome(openTag: string): boolean {
  return SITE_CHROME_SELECTORS.some((re) => re.test(openTag));
}

/** Turn theme-style <header>/<footer>/<nav> into safe sections or remove chrome. */
export function normalizePageHtml(html: string): string {
  let out = html.replace(BLOCK_COMMENT_RE, "").trim();

  out = out.replace(/<header\b[\s\S]*?<\/header>/gi, (block) => {
    if (looksLikeSiteChrome(block)) {
      return "";
    }
    return block
      .replace(/<header\b([^>]*)>/i, `<section$1 data-wp-body="header-as-section">`)
      .replace(/<\/header>/i, "</section>");
  });

  // Drop site footers and nav blocks (theme provides these).
  out = out.replace(/<footer\b[\s\S]*?<\/footer>/gi, "");
  out = out.replace(/<nav\b[\s\S]*?<\/nav>/gi, "");

  // Remove empty sections left behind
  out = out.replace(/<section[^>]*>\s*<\/section>/gi, "");

  return out.trim();
}

export function countChromeIssues(html: string): number {
  const headerTags = (html.match(/<header\b/gi) ?? []).length;
  const footerTags = (html.match(/<footer\b/gi) ?? []).length;
  const navTags = (html.match(/<nav\b/gi) ?? []).length;
  return headerTags + footerTags + navTags;
}
