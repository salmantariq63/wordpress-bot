import { prisma } from "@/lib/prisma";

export type ScaffoldPageMap = Record<string, number>;

export function scaffoldMapKey(configTitle: string): string {
  return configTitle.trim();
}

export function parseScaffoldPageMap(value: unknown): ScaffoldPageMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const map: ScaffoldPageMap = {};
  for (const [key, id] of Object.entries(value)) {
    if (typeof id === "number" && Number.isFinite(id) && id > 0) {
      map[key.trim()] = id;
    }
  }
  return map;
}

export async function saveScaffoldPageMap(
  configId: string,
  map: ScaffoldPageMap
): Promise<void> {
  await prisma.siteConfig.update({
    where: { id: configId },
    data: { scaffoldPageIds: map },
  });
}
