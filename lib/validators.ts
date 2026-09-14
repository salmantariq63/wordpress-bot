import OpenAI from "openai";

export type ConnectionTestResult = {
  ok: boolean;
  error?: string;
};

export async function testGrokConnection(
  apiKey: string
): Promise<ConnectionTestResult> {
  if (!apiKey.trim()) {
    return { ok: false, error: "xAI API key is required." };
  }

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.x.ai/v1",
    });

    await client.models.list();
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to connect to xAI.";
    return { ok: false, error: message };
  }
}

function normalizeWpUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export async function testWordPressConnection(
  url: string,
  username: string,
  appPassword: string
): Promise<ConnectionTestResult> {
  if (!url.trim() || !username.trim() || !appPassword.trim()) {
    return {
      ok: false,
      error: "WordPress URL, username, and application password are required.",
    };
  }

  const base = normalizeWpUrl(url);
  const endpoint = `${base}/wp-json/wp/v2/types`;
  const credentials = Buffer.from(`${username}:${appPassword}`).toString(
    "base64"
  );

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        ok: false,
        error: `WordPress REST API returned ${response.status}: ${body.slice(0, 200)}`,
      };
    }

    const data = await response.json();
    if (typeof data !== "object" || data === null) {
      return { ok: false, error: "Unexpected response from WordPress REST API." };
    }

    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach WordPress site.";
    return { ok: false, error: message };
  }
}
