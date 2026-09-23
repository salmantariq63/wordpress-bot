import type { SiteConfig } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureSiteConfigJsonIntegrity } from "@/lib/repair-site-config";
import { parseStringArray } from "@/lib/site-config";

export type LoadedSiteConfig = SiteConfig & {
  coreServicesList: string[];
  targetKeywordsList: string[];
  pagesToBuildList: string[];
};

export async function loadSiteConfig(
  configId: string
): Promise<LoadedSiteConfig> {
  await ensureSiteConfigJsonIntegrity(configId);

  const config = await prisma.siteConfig.findUnique({ where: { id: configId } });
  if (!config) {
    throw new Error(`Site configuration not found for id "${configId}".`);
  }

  return {
    ...config,
    coreServicesList: parseStringArray(config.coreServices),
    targetKeywordsList: parseStringArray(config.targetKeywords),
    pagesToBuildList: parseStringArray(config.pagesToBuild),
  };
}

export async function updateSiteStatus(
  configId: string,
  status: SiteConfig["status"]
): Promise<void> {
  await prisma.siteConfig.update({
    where: { id: configId },
    data: { status },
  });
}
