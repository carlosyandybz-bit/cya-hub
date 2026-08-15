import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type IconRow = { icon_key?: string; storage_path?: string };

function publicObjectUrl(base: string, path: string) {
  return `${base}/storage/v1/object/public/cya-icons/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export async function GET() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()?.replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!base || !key) return NextResponse.json({ icons: {} }, { headers: { "cache-control": "no-store" } });

  try {
    const query = new URLSearchParams({ select: "icon_key,storage_path", order: "icon_key.asc" });
    const response = await fetch(`${base}/rest/v1/app_icon_settings?${query.toString()}`, {
      headers: { apikey: key, accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ icons: {} }, { headers: { "cache-control": "no-store" } });
    const rows = await response.json().catch(() => []) as IconRow[];
    const icons = Object.fromEntries(rows.flatMap((row) => row.icon_key && row.storage_path ? [[row.icon_key, publicObjectUrl(base, row.storage_path)]] : []));
    return NextResponse.json({ icons }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ icons: {} }, { headers: { "cache-control": "no-store" } });
  }
}
