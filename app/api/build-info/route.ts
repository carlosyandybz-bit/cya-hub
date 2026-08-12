import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ app: "cya-hub", release: "p22-student-portal-v50-ready" }, { headers: { "cache-control": "no-store" } });
}
