import path from "path";

/** Directory where theme zip files are stored (use a volume path in production). */
export function getThemeUploadDir(): string {
  const configured = process.env.UPLOAD_THEMES_DIR?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.join(process.cwd(), "public", "uploads", "themes");
}

/** DB stores web-style paths like /uploads/themes/file.zip */
export function resolveStoredThemePath(activeThemeZipPath: string): string {
  const normalized = activeThemeZipPath.replace(/^\/+/, "");
  const filename = path.basename(normalized);
  return path.join(getThemeUploadDir(), filename);
}

export function themePublicPathForFilename(filename: string): string {
  return `/uploads/themes/${filename}`;
}
