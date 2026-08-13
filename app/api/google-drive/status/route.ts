import { NextRequest, NextResponse } from "next/server";
import { bearerToken, requireStaff } from "../../../google-calendar-server";
import { teachingFolderMode, teachingFolderName, verifyGoogleDriveConnection } from "../../../google-drive-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireStaff(bearerToken(request));
    const verification = await verifyGoogleDriveConnection();
    return NextResponse.json({
      ...verification,
      folderMode: teachingFolderMode(),
      folderName: teachingFolderName(),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "No se pudo comprobar Google Drive.",
    }, { status: 403, headers: { "cache-control": "no-store" } });
  }
}
