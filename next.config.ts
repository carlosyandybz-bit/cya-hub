import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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
