import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ app: "cya-hub", release: "p21-dar-clase-v49-ready" }, { headers: { "cache-control": "no-store" } });
}
