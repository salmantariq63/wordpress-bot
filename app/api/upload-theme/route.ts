import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SINGLE_CONFIG_ID } from "@/lib/site-config";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "themes");
const MAX_BYTES = 50 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("theme");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No theme file provided. Use field name 'theme'." },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
      return NextResponse.json(
        { error: "Theme file must be a .zip archive." },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Theme file exceeds 50MB limit." },
        { status: 400 }
      );
    }

    await mkdir(UPLOAD_DIR, { recursive: true });

    const safeBase = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `${Date.now()}-${safeBase}`;
    const absolutePath = path.join(UPLOAD_DIR, filename);
    const buffer = Buffer.from(await file.arrayBuffer());

    await writeFile(absolutePath, buffer);

    const publicPath = `/uploads/themes/${filename}`;

    const existing = await prisma.siteConfig.findUnique({
      where: { id: SINGLE_CONFIG_ID },
    });
    if (existing) {
      await prisma.siteConfig.update({
        where: { id: SINGLE_CONFIG_ID },
        data: { activeThemeZipPath: publicPath },
      });
    }

    return NextResponse.json({
      ok: true,
      path: publicPath,
      filename,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Theme upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
