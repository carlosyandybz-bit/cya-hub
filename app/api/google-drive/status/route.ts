import { NextResponse } from "next/server";
import { driveServerConfigured, teachingDriveFolderId } from "../../../google-drive-server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    configured: driveServerConfigured(),
    folderId: teachingDriveFolderId(),
  }, { headers: { "cache-control": "no-store" } });
}
