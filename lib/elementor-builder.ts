import type { PageSection } from "@/lib/page-content-structure";

function randomId(): string {
  return Math.random().toString(16).slice(2, 9);
}

type ElNode = Record<string, unknown>;

function headingWidget(title: string, size: "h1" | "h2" | "h3"): ElNode {
  return {
    id: randomId(),
    elType: "widget",
    widgetType: "heading",
    settings: {
      title,
      header_size: size,
      align: "center",
    },
    elements: [],
  };
}

function textWidget(html: string): ElNode {
  return {
    id: randomId(),
    elType: "widget",
    widgetType: "text-editor",
    settings: {
      editor: html,
    },
    elements: [],
  };
}

function buttonWidget(text: string, url: string): ElNode {
  return {
    id: randomId(),
    elType: "widget",
    widgetType: "button",
    settings: {
      text,
      link: { url, is_external: false, nofollow: false },
      align: "center",
      size: "md",
    },
    elements: [],
  };
}

function section(widgets: ElNode[]): ElNode {
  return {
    id: randomId(),
    elType: "section",
    settings: {
      layout: "boxed",
      content_width: { unit: "px", size: 1140 },
    },
    elements: [
      {
        id: randomId(),
        elType: "column",
        settings: { _column_size: 100 },
        elements: widgets,
      },
    ],
  };
}

function sectionFromPageSection(block: PageSection): ElNode {
  const widgets: ElNode[] = [];

  if (block.heading) {
    const size =
      block.kind === "hero" ? "h1" : block.kind === "content" ? "h2" : "h2";
    widgets.push(headingWidget(block.heading, size));
  }
  if (block.subheading) {
    widgets.push(
      textWidget(`<p><strong>${escape(block.subheading)}</strong></p>`)
    );
  }
  if (block.body_html?.trim()) {
    widgets.push(textWidget(block.body_html));
  }
  if (block.items?.length) {
    const list = block.items
      .map(
        (item) =>
          `<p><strong>${escape(item.title)}</strong><br/>${escape(item.text)}</p>`
      )
      .join("");
    widgets.push(textWidget(list));
  }
  if (block.button_text) {
    widgets.push(
      buttonWidget(block.button_text, block.button_url || "/contact")
    );
  }

  if (widgets.length === 0) {
    widgets.push(textWidget("<p>Content</p>"));
  }

  return section(widgets);
}

function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export type ElementorBuiltPage = {
  elementorData: string;
  /** Minimal post_content Elementor can fall back to if meta is stripped. */
  storageHtml: string;
};

export function buildElementorPage(sections: PageSection[]): ElementorBuiltPage {
  const data = sections.map((s) => sectionFromPageSection(s));
  const elementorData = JSON.stringify(data);

  const storageHtml = sections
    .map((s) => {
      const h = s.heading ? `<h2>${escape(s.heading)}</h2>` : "";
      const body = s.body_html ?? "";
      return `<section>${h}${body}</section>`;
    })
    .join("\n");

  return { elementorData, storageHtml };
}

export function elementorMetaPayload(elementorData: string): Record<string, string> {
  return {
    _elementor_edit_mode: "builder",
    _elementor_template_type: "wp-page",
    _elementor_version: "3.24.0",
    _elementor_data: elementorData,
  };
}

/** Plain HTML for SEO from Elementor snapshot content. */
export function elementorStorageToAuditHtml(storageHtml: string): string {
  return storageHtml;
}
