import { prisma } from "@/lib/prisma";
import { SINGLE_CONFIG_ID } from "@/lib/site-config";

const DEFAULT_PLATFORMS = ["x", "linkedin", "facebook", "instagram"];

/**
 * Repair corrupted SiteConfig.socialPlatforms values.
 * Broken rows look like: "x","linkedin","facebook","instagram" (missing array brackets).
 */
export async function ensureSiteConfigJsonIntegrity(
  configId: string = SINGLE_CONFIG_ID
): Promise<void> {
  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ socialPlatforms_text: string | null }>
    >(
      `SELECT CAST(socialPlatforms AS TEXT) AS socialPlatforms_text
       FROM SiteConfig WHERE id = ?`,
      configId
    );
    const raw = rows[0]?.socialPlatforms_text;
    if (raw === null || raw === undefined) return;

    let needsFix = false;
    let fixed: string[] = DEFAULT_PLATFORMS;

    try {
      const parsed = JSON.parse(String(raw));
      if (Array.isArray(parsed)) {
        fixed = parsed.filter((p): p is string => typeof p === "string");
        if (fixed.length === 0) {
          fixed = DEFAULT_PLATFORMS;
          needsFix = true;
        }
      } else {
        needsFix = true;
      }
    } catch {
      needsFix = true;
      try {
        const wrapped = JSON.parse(`[${raw}]`);
        if (Array.isArray(wrapped)) {
          fixed = wrapped.filter((p): p is string => typeof p === "string");
        }
      } catch {
        fixed = DEFAULT_PLATFORMS;
      }
      if (fixed.length === 0) fixed = DEFAULT_PLATFORMS;
    }

    if (needsFix) {
      await prisma.$executeRawUnsafe(
        `UPDATE SiteConfig SET socialPlatforms = ? WHERE id = ?`,
        JSON.stringify(fixed),
        configId
      );
    }
  } catch (err) {
    console.error("[ensureSiteConfigJsonIntegrity]", err);
  }
}
