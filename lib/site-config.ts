import type { SiteStatus } from "@prisma/client";

export const DEFAULT_PAGES = [
  "Home",
  "About",
  "Services",
  "Contact",
  "FAQ",
] as const;

export const STANDARD_PAGE_OPTIONS = [...DEFAULT_PAGES];

export type SiteConfigInput = {
  id?: string;
  xaiApiKey: string;
  wpUrl: string;
  wpUsername: string;
  wpAppPassword: string;
  sftpHost?: string | null;
  sftpPort?: string | null;
  sftpUsername?: string | null;
  sftpPassword?: string | null;
  businessName: string;
  niche: string;
  targetAudience: string;
  toneOfVoice: string;
  coreServices: string[];
  targetKeywords: string[];
  pagesToBuild: string[];
  activeThemeZipPath?: string | null;
  status?: SiteStatus;
};

export const SINGLE_CONFIG_ID = "default";

export function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function siteConfigToClient(config: {
  id: string;
  xaiApiKey: string;
  wpUrl: string;
  wpUsername: string;
  wpAppPassword: string;
  sftpHost: string | null;
  sftpPort: string | null;
  sftpUsername: string | null;
  sftpPassword: string | null;
  businessName: string;
  niche: string;
  targetAudience: string;
  toneOfVoice: string;
  coreServices: unknown;
  targetKeywords: unknown;
  pagesToBuild: unknown;
  activeThemeZipPath: string | null;
  status: SiteStatus;
}) {
  return {
    ...config,
    coreServices: parseStringArray(config.coreServices),
    targetKeywords: parseStringArray(config.targetKeywords),
    pagesToBuild: parseStringArray(config.pagesToBuild),
  };
}
