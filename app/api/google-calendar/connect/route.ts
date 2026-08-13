import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { bearerToken, buildGoogleCalendarAuthUrl, calendarServerConfigured, requireStaff, sealOAuthCookie } from "../../../google-calendar-server";

export const dynamic = "force-dynamic";
const COOKIE_NAME = "cya_google_calendar_oauth";

export async function POST(request: NextRequest) {
  try {
    if (!calendarServerConfigured()) {
      return NextResponse.json({ error: "Google Calendar no está configurado en el servidor." }, { status: 503 });
    }
    const accessToken = bearerToken(request);
    const identity = await requireStaff(accessToken);
    const state = randomBytes(24).toString("base64url");
    const expiresAt = Date.now() + 10 * 60 * 1000;
    const cookieValue = sealOAuthCookie({ state, accessToken, userId: identity.id, expiresAt });
    const url = buildGoogleCalendarAuthUrl(request.nextUrl.origin, state);
    const response = NextResponse.json({ url }, { headers: { "cache-control": "no-store" } });
    response.cookies.set(COOKIE_NAME, cookieValue, {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/api/google-calendar",
      maxAge: 600,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo iniciar la conexión con Google Calendar." }, { status: 403 });
  }
}
