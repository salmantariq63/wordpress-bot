import { PrismaClient } from "@prisma/client";
import { prepareDatabaseUrl } from "@/lib/database-url";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

prepareDatabaseUrl();

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function clientHasPhase6Models(client: PrismaClient): boolean {
  const c = client as unknown as {
    socialPostRecord?: unknown;
    automationTask?: unknown;
  };
  return Boolean(c.socialPostRecord && c.automationTask);
}

/**
 * Recreate the client if HMR kept a pre–Phase-6 singleton alive.
 */
function getPrisma(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (existing && clientHasPhase6Models(existing)) {
    return existing;
  }

  if (existing) {
    void existing.$disconnect().catch(() => undefined);
  }

  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

export const prisma = getPrisma();
