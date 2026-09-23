import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { prepareDatabaseUrl } from "@/lib/database-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sqlitePathFromUrl(url: string): string | null {
  if (!url.startsWith("file:")) return null;
  const rest = url.slice("file:".length);
  if (rest.startsWith("/")) return rest;
  if (rest.startsWith("//")) return rest.replace(/^\/+/, "/");
  return path.resolve(process.cwd(), rest);
}

export async function GET() {
  const databaseUrl = prepareDatabaseUrl();
  const dbFile = sqlitePathFromUrl(databaseUrl);
  const dir = dbFile ? path.dirname(dbFile) : null;

  let dirExists = false;
  let dirWritable = false;
  let dbExists = false;

  if (dir) {
    dirExists = fs.existsSync(dir);
    try {
      fs.accessSync(dir, fs.constants.W_OK);
      dirWritable = true;
    } catch {
      dirWritable = false;
    }
  }
  if (dbFile) {
    dbExists = fs.existsSync(dbFile);
  }

  return NextResponse.json({
    ok: dirWritable && (dbExists || dirWritable),
    railwayVolumeMount: process.env.RAILWAY_VOLUME_MOUNT_PATH ?? null,
    databaseUrl,
    dbFile,
    dirExists,
    dirWritable,
    dbExists,
    uploadThemesDir: process.env.UPLOAD_THEMES_DIR ?? null,
  });
}
