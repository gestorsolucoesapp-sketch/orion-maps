import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";
import packageJson from "./package.json";

const deploymentRevision = process.env.VERCEL_GIT_COMMIT_SHA;
let buildRevision = /^[0-9a-f]{7,40}$/i.test(deploymentRevision ?? "")
  ? deploymentRevision!.slice(0, 8)
  : "";

if (!buildRevision) {
  try {
    const localRevision = execFileSync("git", ["rev-parse", "--short=8", "HEAD"], {
      encoding: "utf8",
    }).trim();
    if (/^[0-9a-f]{7,8}$/i.test(localRevision)) buildRevision = localRevision;
  } catch {
    // Source archives may not contain Git metadata.
  }
}

const buildChannel = process.env.VERCEL_ENV === "production"
  ? "produção"
  : process.env.VERCEL_ENV === "preview"
    ? "prévia"
    : process.env.VERCEL_ENV === "development"
      ? "desenvolvimento"
      : process.env.NODE_ENV === "production"
        ? "ambiente não identificado"
        : "local";

let localChanges = false;
if (buildChannel === "local") {
  try {
    localChanges = execFileSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
    }).trim().length > 0;
  } catch {
    // Git status is unavailable in a source archive.
  }
}

const nextConfig: NextConfig = {
  env: {
    ORION_APP_VERSION: packageJson.version,
    ORION_BUILD_CHANNEL: localChanges ? "local (alterado)" : buildChannel,
    ORION_BUILD_REVISION: buildRevision || "commit indisponível",
  },
};

export default nextConfig;
