import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function buildReference() {
  return (
    process.env.CYA_BUILD_SHA?.trim()
    || process.env.GIT_COMMIT_SHA?.trim()
    || process.env.VERCEL_GIT_COMMIT_SHA?.trim()
    || process.env.CF_PAGES_COMMIT_SHA?.trim()
    || null
  );
}

export async function GET() {
  const commit = buildReference();
  return NextResponse.json(
    {
      app: "cya-hub",
      release: "p32-release-ready",
      commit: commit ? commit.slice(0, 12) : null,
    },
    {
      headers: {
        "cache-control": "no-store, max-age=0",
        pragma: "no-cache",
        "x-content-type-options": "nosniff",
      },
    },
  );
}