import { NextRequest, NextResponse } from "next/server";
import { bearerToken, calendarServerConfigured, requireStaff } from "../../../google-calendar-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireStaff(bearerToken(request));
    return NextResponse.json({
      configured: calendarServerConfigured(),
      redirectPath: "/api/google-calendar/callback",
      scopes: ["events", "calendar-list-readonly"],
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo comprobar Google Calendar." }, { status: 403 });
  }
}
