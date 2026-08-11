import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ app: "cya-hub", release: "p20-form-runtime-v48-ready" }, { headers: { "cache-control": "no-store" } });
}
