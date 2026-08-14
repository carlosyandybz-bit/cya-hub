import { NextRequest, NextResponse } from "next/server";
import { bearerToken, calendarServerConfigured, requireStaff } from "../../../google-calendar-server";

export const dynamic = "force-dynamic";

type MissingRequirement = "google_oauth" | "server_encryption" | "supabase_runtime";

function runtimeDiagnostics() {
  const googleClientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() || process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const googleClientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() || process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  const missingRequirements: MissingRequirement[] = [];

  if (!googleClientId || !googleClientSecret) missingRequirements.push("google_oauth");
  if (!process.env.CYA_SERVER_SECRET?.trim()) missingRequirements.push("server_encryption");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()) {
    missingRequirements.push("supabase_runtime");
  }

  const labels: Record<MissingRequirement, string> = {
    google_oauth: "la autorización de Google",
    server_encryption: "el cifrado seguro del servidor",
    supabase_runtime: "la conexión del servidor con CYA Hub",
  };
  const configurationMessage = missingRequirements.length
    ? `Falta completar ${missingRequirements.map((item) => labels[item]).join(", ")} antes de conectar Google Calendar.`
    : "Google Calendar está preparado para iniciar la autorización.";

  return { missingRequirements, configurationMessage };
}

export async function GET(request: NextRequest) {
  try {
    await requireStaff(bearerToken(request));
    const diagnostics = runtimeDiagnostics();
    return NextResponse.json({
      configured: calendarServerConfigured(),
      ...diagnostics,
      redirectPath: "/api/google-calendar/callback",
      scopes: ["events", "calendar-list-readonly"],
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo comprobar Google Calendar." }, { status: 403 });
  }
}
