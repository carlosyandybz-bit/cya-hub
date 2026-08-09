import { NextResponse } from "next/server";
import { driveServerConfigured } from "../../../google-drive-server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    configured: driveServerConfigured(),
    folderId: process.env.GOOGLE_DRIVE_TEACHING_FOLDER_ID?.trim() || "12IT2BihTvmqHUz7zQKuShd6ddSV-6fpO",
  }, { headers: { "cache-control": "no-store" } });
}
