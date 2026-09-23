import type { PageSection } from "@/lib/page-content-structure";

function escapeShortcodeAttr(text: string): string {
  return text.replace(/"/g, "&quot;");
}

function wrapTextModule(html: string, adminLabel?: string): string {
  const label = adminLabel
    ? ` admin_label="${escapeShortcodeAttr(adminLabel)}"`
    : "";
  return `[et_pb_text${label}]${html}[/et_pb_text]`;
}

function wrapButton(text: string, url: string): string {
  return `[et_pb_button button_text="${escapeShortcodeAttr(text)}" button_url="${escapeShortcodeAttr(url)}" url_new_window="off"]`;
}

function sectionInner(modules: string): string {
  return `[et_pb_section fullwidth="off" specialty="off" transparent_background="off" background_color="#ffffff" inner_shadow="off" parallax="off" parallax_method="off"]
[et_pb_row background_layout="light"]
[et_pb_column type="4_4"]
${modules}
[/et_pb_column]
[/et_pb_row]
[/et_pb_section]`;
}

function sectionFromPageSection(block: PageSection): string {
  const parts: string[] = [];

  if (block.heading) {
    const tag = block.kind === "hero" ? "h1" : "h2";
    parts.push(wrapTextModule(`<${tag}>${block.heading}</${tag}>`, block.kind));
  }
  if (block.subheading) {
    parts.push(wrapTextModule(`<p><strong>${block.subheading}</strong></p>`));
  }
  if (block.body_html?.trim()) {
    parts.push(wrapTextModule(block.body_html, `${block.kind}-body`));
  }
  if (block.items?.length) {
    const list = `<ul>${block.items
      .map(
        (item) =>
          `<li><strong>${item.title}</strong>: ${item.text}</li>`
      )
      .join("")}</ul>`;
    parts.push(wrapTextModule(list, `${block.kind}-list`));
  }
  if (block.button_text) {
    parts.push(
      wrapButton(block.button_text, block.button_url || "/contact")
    );
  }

  if (parts.length === 0) {
    parts.push(wrapTextModule("<p>Content</p>"));
  }

  return sectionInner(parts.join("\n"));
}

export function buildDiviPage(sections: PageSection[]): string {
  return sections.map((s) => sectionFromPageSection(s)).join("\n\n");
}

export function diviToAuditHtml(shortcodes: string): string {
  return shortcodes
    .replace(/\[\/?et_pb_[^\]]+\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
