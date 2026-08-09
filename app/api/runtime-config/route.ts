import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function noStoreHeaders() {
  return {
    "cache-control": "no-store, max-age=0",
    pragma: "no-cache",
    "x-content-type-options": "nosniff",
  };
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

  const configured = Boolean(supabaseUrl && supabasePublishableKey);

  if (!configured) {
    return NextResponse.json(
      { configured: false },
      { status: 503, headers: noStoreHeaders() },
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    return NextResponse.json(
      { configured: false },
      { status: 503, headers: noStoreHeaders() },
    );
  }

  if (
    parsedUrl.protocol !== "https:" ||
    !supabasePublishableKey.startsWith("sb_publishable_")
  ) {
    return NextResponse.json(
      { configured: false },
      { status: 503, headers: noStoreHeaders() },
    );
  }

  return NextResponse.json(
    {
      configured: true,
      supabaseUrl,
      supabasePublishableKey,
    },
    { status: 200, headers: noStoreHeaders() },
  );
}
