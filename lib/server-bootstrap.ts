import { execSync } from "child_process";
import { ensureServerStorageSync } from "@/lib/database-url";

declare global {
  // eslint-disable-next-line no-var
  var __wpBotBootstrapped: boolean | undefined;
}

/** Runs once when the Next.js server starts (see instrumentation.ts). */
export async function bootstrapServerData(): Promise<void> {
  if (globalThis.__wpBotBootstrapped) return;
  globalThis.__wpBotBootstrapped = true;

  ensureServerStorageSync();

  console.log("[wordpress-bot bootstrap]");
  console.log("  RAILWAY_VOLUME_MOUNT_PATH=", process.env.RAILWAY_VOLUME_MOUNT_PATH ?? "(unset)");
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
