import { notFound } from "next/navigation";
import PullRefreshPlaygroundClient from "./playground-client";

export const dynamic = "force-dynamic";

const STAGING_PROJECT_REF = "qlngfkzmncihtdzktcmd";

function isStagingRuntime() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  try {
    return new URL(rawUrl).hostname === `${STAGING_PROJECT_REF}.supabase.co`;
  } catch {
    return false;
  }
}

export default function PullRefreshPlaygroundPage() {
  if (!isStagingRuntime()) notFound();
  return <PullRefreshPlaygroundClient serverStamp={Date.now()} />;
}
