import fs from "fs";
import path from "path";

export function resolveDataRoot(): string {
  const mount = process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim();
  if (mount) return mount;
  if (process.env.RAILWAY_ENVIRONMENT) return "/data";
  return path.join(process.cwd(), "storage");
}

function sqliteFilePathFromUrl(url: string): string | null {
  if (!url.startsWith("file:")) return null;
  const rest = url.slice("file:".length);
  if (rest.startsWith("/")) return rest;
  if (rest.startsWith("//")) return rest.replace(/^\/+/, "/");
  return path.resolve(process.cwd(), rest);
}

/** Sync: create volume dirs and set DATABASE_URL before PrismaClient is constructed. */
export function ensureServerStorageSync(): string {
  const dataRoot = resolveDataRoot();
  const prismaDir = path.join(dataRoot, "prisma");
  const uploadDir = path.join(dataRoot, "uploads", "themes");

  fs.mkdirSync(prismaDir, { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });

  const dbPath = path.join(prismaDir, "prod.db");
  const url = `file:${dbPath}`;
  process.env.DATABASE_URL = url;
  process.env.UPLOAD_THEMES_DIR = uploadDir;

  return url;
}

/**
 * Ensures SQLite parent dir exists and DATABASE_URL points at the volume in production.
 */
export function prepareDatabaseUrl(): string {
  const onRailway = Boolean(
    process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_VOLUME_MOUNT_PATH
  );
  let url = process.env.DATABASE_URL?.trim() ?? "";

  if (
    onRailway ||
    !url ||
    url === "file:./dev.db" ||
    url.startsWith("file:./")
  ) {
    url = ensureServerStorageSync();
  } else {
    const filePath = sqliteFilePathFromUrl(url);
    if (filePath) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }
  }

  return url;
}
