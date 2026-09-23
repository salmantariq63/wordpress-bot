import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectRoot,
  serverExternalPackages: ["ssh2", "ssh2-sftp-client", "adm-zip"],
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  // instrumentation.ts runs bootstrap before traffic (Railway SQLite on /data volume).
  instrumentationHook: true,
};

export default nextConfig;
