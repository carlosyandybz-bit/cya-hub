import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ app: "cya-hub", release: "p23-teaching-graph-v51-ready" }, { headers: { "cache-control": "no-store" } });
}
