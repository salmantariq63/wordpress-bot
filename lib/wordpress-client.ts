import type { LoadedSiteConfig } from "@/lib/config-loader";

export function normalizeWpUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function getWpAuthHeader(username: string, appPassword: string): string {
  const credentials = Buffer.from(`${username}:${appPassword}`).toString("base64");
  return `Basic ${credentials}`;
}

export class WordPressApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string
  ) {
    super(message);
    this.name = "WordPressApiError";
  }
}

export async function wpRequest<T = unknown>(
  config: LoadedSiteConfig,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const base = normalizeWpUrl(config.wpUrl);
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(init.headers);
  headers.set("Authorization", getWpAuthHeader(config.wpUsername, config.wpAppPassword));
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) {
    throw new WordPressApiError(
      `WordPress API ${response.status} on ${path}`,
      response.status,
      text.slice(0, 500)
    );
  }

  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new WordPressApiError(
      `Invalid JSON from WordPress on ${path}`,
      response.status,
      text.slice(0, 200)
    );
  }
}

export function titleToSlug(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export type WpPage = {
  id: number;
  title: { rendered?: string; raw?: string };
  slug: string;
  status: string;
  content?: { raw?: string; rendered?: string };
  excerpt?: { raw?: string; rendered?: string };
  date?: string;
  modified?: string;
  link?: string;
};

export type WpPost = {
  id: number;
  title: { rendered?: string; raw?: string };
  slug: string;
  status: string;
  content?: { raw?: string; rendered?: string };
  excerpt?: { raw?: string; rendered?: string };
  date?: string;
  modified?: string;
  link?: string;
};

export function wpRenderedTitle(
  item: Pick<WpPage, "title"> | Pick<WpPost, "title">
): string {
  return (item.title.raw || item.title.rendered || "").trim();
}

/** List WordPress posts (paginated). */
export async function listWordPressPosts(
  config: LoadedSiteConfig,
  options?: {
    status?: string;
    perPage?: number;
    page?: number;
    orderby?: string;
  }
): Promise<WpPost[]> {
  const status = options?.status ?? "publish,draft,pending,private";
  const perPage = options?.perPage ?? 50;
  const page = options?.page ?? 1;
  const orderby = options?.orderby ?? "modified";
  const path =
    `/wp-json/wp/v2/posts?context=edit&status=${encodeURIComponent(status)}` +
    `&per_page=${perPage}&page=${page}&orderby=${orderby}&order=asc`;
  return wpRequest<WpPost[]>(config, path);
}

/** List WordPress pages (paginated). */
export async function listWordPressPages(
  config: LoadedSiteConfig,
  options?: {
    status?: string;
    perPage?: number;
    page?: number;
    orderby?: string;
  }
): Promise<WpPage[]> {
  const status = options?.status ?? "publish,draft,pending,private";
  const perPage = options?.perPage ?? 50;
  const page = options?.page ?? 1;
  const orderby = options?.orderby ?? "modified";
  const path =
    `/wp-json/wp/v2/pages?context=edit&status=${encodeURIComponent(status)}` +
    `&per_page=${perPage}&page=${page}&orderby=${orderby}&order=asc`;
  return wpRequest<WpPage[]>(config, path);
}
