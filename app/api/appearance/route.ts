import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const defaults = {
  app_name: "CYA Hub",
  short_mark: "CYA",
  logo_url: null,
  primary_color: "#6d4aff",
  secondary_color: "#5637e8",
  typography: "geist",
  header_style: "standard",
};

export async function GET() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()?.replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!base || !key) return NextResponse.json(defaults, { headers: { "cache-control": "no-store" } });

  try {
    const query = new URLSearchParams({
      select: "app_name,short_mark,logo_url,primary_color,secondary_color,typography,header_style",
      singleton: "eq.true",
      limit: "1",
    });
    const response = await fetch(`${base}/rest/v1/app_appearance_settings?${query.toString()}`, {
      headers: { apikey: key, accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json(defaults, { headers: { "cache-control": "no-store" } });
    const rows = await response.json().catch(() => []) as Array<typeof defaults>;
    return NextResponse.json(rows[0] ?? defaults, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json(defaults, { headers: { "cache-control": "no-store" } });
  }
}
