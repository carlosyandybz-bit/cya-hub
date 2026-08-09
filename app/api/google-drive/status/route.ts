import { NextResponse } from "next/server";
import { driveServerConfigured, teachingFolderMode, teachingFolderName } from "../../../google-drive-server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    configured: driveServerConfigured(),
    folderMode: teachingFolderMode(),
    folderId: process.env.GOOGLE_DRIVE_TEACHING_FOLDER_ID?.trim() || null,
    folderName: teachingFolderName(),
  }, { headers: { "cache-control": "no-store" } });
}
