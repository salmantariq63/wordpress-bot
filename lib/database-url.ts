import fs from "fs";
import path from "path";

function sqliteFilePathFromUrl(url: string): string | null {
  if (!url.startsWith("file:")) return null;
  const rest = url.slice("file:".length);
  // file:/data/db.sqlite (unix absolute)
  if (rest.startsWith("/")) return rest;
  // file:///data/db.sqlite
  if (rest.startsWith("//")) return rest.replace(/^\/+/, "/");
  return path.resolve(process.cwd(), rest);
}

/**
 * Ensures SQLite parent dir exists and DATABASE_URL points at the volume in production.
 */
export function prepareDatabaseUrl(): string {
  const volumeMount = process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim();
  const dataRoot = volumeMount || "/data";
  let url = process.env.DATABASE_URL?.trim() ?? "";

  const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || volumeMount);
  const useVolumeDefault =
    onRailway ||
    !url ||
    url === "file:./dev.db" ||
    url.startsWith("file:./");

  if (useVolumeDefault) {
    const dbPath = path.join(dataRoot, "prisma", "prod.db");
    url = `file:${dbPath}`;
    process.env.DATABASE_URL = url;
  }

  const filePath = sqliteFilePathFromUrl(url);
  if (filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  return url;
}
