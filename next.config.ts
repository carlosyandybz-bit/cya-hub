import { execFileSync } from "node:child_process";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

function resolveBuildSha() {
  const explicit = process.env.CYA_BUILD_SHA?.trim()
    || process.env.GIT_COMMIT_SHA?.trim()
    || process.env.VERCEL_GIT_COMMIT_SHA?.trim()
    || process.env.CF_PAGES_COMMIT_SHA?.trim();

  if (explicit) {
    return explicit;
  }

  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const buildSha = resolveBuildSha();

const nextConfig: NextConfig = {
  env: buildSha ? { CYA_BUILD_SHA: buildSha } : undefined,
};

const sentryBuildEnabled = Boolean(process.env.SENTRY_AUTH_TOKEN);

export default sentryBuildEnabled
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG ?? "cya-de",
      project: process.env.SENTRY_PROJECT ?? "organization-slug",
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: true,
    })
  : nextConfig;
