import { execSync } from "child_process";
import fs from "fs";
import path from "path";

declare global {
  // eslint-disable-next-line no-var
  var __wpBotBootstrapped: boolean | undefined;
}

function resolveDataRoot(): string {
  const mount = process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim();
  if (mount) return mount;

  if (process.env.RAILWAY_ENVIRONMENT) {
    return "/data";
  }

  return path.join(process.cwd(), "storage");
}

/** Runs once before the Next.js server handles traffic (Railway / Docker). */
export async function bootstrapServerData(): Promise<void> {
  if (globalThis.__wpBotBootstrapped) return;
  globalThis.__wpBotBootstrapped = true;

  const dataRoot = resolveDataRoot();
  const prismaDir = path.join(dataRoot, "prisma");
  const uploadDir = path.join(dataRoot, "uploads", "themes");

  fs.mkdirSync(prismaDir, { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });

  const dbPath = path.join(prismaDir, "prod.db");
  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.UPLOAD_THEMES_DIR = uploadDir;

  console.log("[wordpress-bot bootstrap]");
  console.log("  RAILWAY_VOLUME_MOUNT_PATH=", process.env.RAILWAY_VOLUME_MOUNT_PATH ?? "(unset)");
  console.log("  DATA_ROOT=", dataRoot);
  console.log("  DATABASE_URL=", process.env.DATABASE_URL);
  console.log("  UPLOAD_THEMES_DIR=", process.env.UPLOAD_THEMES_DIR);

  try {
    execSync("npx prisma db push --skip-generate", {
      stdio: "inherit",
      env: process.env,
    });
  } catch (err) {
    console.error("[wordpress-bot bootstrap] prisma db push failed:", err);
  }
}
