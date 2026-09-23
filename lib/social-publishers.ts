import type { LoadedSiteConfig } from "@/lib/config-loader";
import { parseStringArray } from "@/lib/site-config";

export type SocialPlatform = "x" | "linkedin" | "facebook" | "instagram";

export const ALL_SOCIAL_PLATFORMS: SocialPlatform[] = [
  "x",
  "linkedin",
  "facebook",
  "instagram",
];

export function parseSocialPlatforms(value: unknown): SocialPlatform[] {
  const raw = parseStringArray(value).map((p) => p.toLowerCase());
  const allowed = new Set<string>(ALL_SOCIAL_PLATFORMS);
  const filtered = raw.filter((p): p is SocialPlatform => allowed.has(p));
  return filtered.length > 0 ? filtered : [...ALL_SOCIAL_PLATFORMS];
}

export type SocialPublishResult = {
  ok: boolean;
  externalPostId?: string;
  error?: string;
  skipped?: boolean;
};

/**
 * Platform adapters. Without tokens, posts stay prepared/scheduled locally (no remote call).
 */
export async function publishToSocialPlatform(
  config: LoadedSiteConfig,
  platform: SocialPlatform,
  caption: string,
  hashtags: string[]
): Promise<SocialPublishResult> {
  const text = composePostText(caption, hashtags, platform);

  switch (platform) {
    case "x":
      return publishToX(config.socialXAccessToken, text);
    case "linkedin":
      return publishToLinkedIn(
        config.socialLinkedInAccessToken,
        config.socialLinkedInAuthorUrn,
        text
      );
    case "facebook":
      return publishToFacebook(
        config.socialFacebookPageToken,
        config.socialFacebookPageId,
        text
      );
    case "instagram":
      return publishToInstagram(
        config.socialFacebookPageToken,
        config.socialInstagramAccountId
      );
    default:
      return { ok: false, error: `Unsupported platform: ${platform}` };
  }
}

function composePostText(
  caption: string,
  hashtags: string[],
  platform: SocialPlatform
): string {
  const tags = hashtags
    .map((h) => (h.startsWith("#") ? h : `#${h.replace(/\s+/g, "")}`))
    .join(" ");
  const max =
    platform === "x" ? 280 : platform === "instagram" ? 2200 : 3000;
  const base = tags ? `${caption.trim()}\n\n${tags}` : caption.trim();
  if (base.length <= max) return base;
  return `${base.slice(0, max - 1).trim()}…`;
}

async function publishToX(
  token: string | null | undefined,
  text: string
): Promise<SocialPublishResult> {
  if (!token?.trim()) {
    return {
      ok: false,
      skipped: true,
      error: "X access token not configured — content prepared only.",
    };
  }

  try {
    const res = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
    const body = await res.text();
    if (!res.ok) {
      return { ok: false, error: `X API ${res.status}: ${body.slice(0, 200)}` };
    }
    const json = JSON.parse(body) as { data?: { id?: string } };
    return { ok: true, externalPostId: json.data?.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "X publish failed.",
    };
  }
}

async function publishToLinkedIn(
  token: string | null | undefined,
  authorUrn: string | null | undefined,
  text: string
): Promise<SocialPublishResult> {
  if (!token?.trim() || !authorUrn?.trim()) {
    return {
      ok: false,
      skipped: true,
      error:
        "LinkedIn token/author URN not configured — content prepared only.",
    };
  }

  try {
    const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: authorUrn.trim(),
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text },
            shareMediaCategory: "NONE",
          },
        },
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
        },
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        error: `LinkedIn API ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    const id = res.headers.get("x-restli-id") || undefined;
    return { ok: true, externalPostId: id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "LinkedIn publish failed.",
    };
  }
}

async function publishToFacebook(
  pageToken: string | null | undefined,
  pageId: string | null | undefined,
  text: string
): Promise<SocialPublishResult> {
  if (!pageToken?.trim() || !pageId?.trim()) {
    return {
      ok: false,
      skipped: true,
      error: "Facebook page token/ID not configured — content prepared only.",
    };
  }

  try {
    const url = new URL(`https://graph.facebook.com/v19.0/${pageId.trim()}/feed`);
    url.searchParams.set("message", text);
    url.searchParams.set("access_token", pageToken.trim());
    const res = await fetch(url.toString(), { method: "POST" });
    const body = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        error: `Facebook API ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    const json = JSON.parse(body) as { id?: string };
    return { ok: true, externalPostId: json.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Facebook publish failed.",
    };
  }
}

/**
 * Instagram Graph requires an image — without media we prepare caption only.
 */
async function publishToInstagram(
  pageToken: string | null | undefined,
  igAccountId: string | null | undefined
): Promise<SocialPublishResult> {
  if (!pageToken?.trim() || !igAccountId?.trim()) {
    return {
      ok: false,
      skipped: true,
      error:
        "Instagram account/token not configured — caption prepared only (image required to publish).",
    };
  }

  return {
    ok: false,
    skipped: true,
    error:
      "Instagram publish needs an image URL via Graph API — caption stored for scheduled/manual posting.",
  };
}
