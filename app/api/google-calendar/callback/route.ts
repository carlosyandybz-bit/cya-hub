import { NextRequest, NextResponse } from "next/server";
import { externalRequestOrigin } from "../../../server-request-origin";
import {
  exchangeGoogleCalendarCode,
  openOAuthCookie,
  primaryGoogleCalendar,
  requireStaff,
  sealCalendarSecret,
  supabaseRequest,
} from "../../../google-calendar-server";

export const dynamic = "force-dynamic";
const COOKIE_NAME = "cya_google_calendar_oauth";

type OAuthCookie = { state: string; accessToken: string; userId: string; expiresAt: number };

function completionPage(ok: boolean, message: string) {
  const payload = JSON.stringify({ type: "cya-google-calendar", ok, message }).replace(/</g, "\\u003c");
  const fallback = ok ? "/?calendar=connected" : "/?calendar=error";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Google Calendar · CYA Hub</title></head><body><p>${ok ? "Google Calendar conectado. Puedes volver a CYA Hub." : "No se pudo conectar Google Calendar."}</p><script>const payload=${payload};if(window.opener){window.opener.postMessage(payload,location.origin);window.close();}else{location.replace(${JSON.stringify(fallback)});}</script></body></html>`;
}

export async function GET(request: NextRequest) {
  let response: NextResponse;
  try {
    const googleError = request.nextUrl.searchParams.get("error");
    if (googleError) throw new Error(googleError === "access_denied" ? "La conexión con Google Calendar fue cancelada." : `Google devolvió: ${googleError}.`);
    const code = request.nextUrl.searchParams.get("code")?.trim();
    const state = request.nextUrl.searchParams.get("state")?.trim();
    const cookie = request.cookies.get(COOKIE_NAME)?.value;
    if (!code || !state || !cookie) throw new Error("La autorización de Google Calendar ha caducado. Vuelve a iniciar la conexión.");

    const context = openOAuthCookie<OAuthCookie>(cookie);
    if (!context.state || context.state !== state || !context.accessToken || !context.userId || context.expiresAt < Date.now()) {
      throw new Error("La autorización de Google Calendar no es válida o ha caducado.");
    }
    const identity = await requireStaff(context.accessToken);
    if (identity.id !== context.userId) throw new Error("La identidad de CYA Hub cambió durante la autorización.");

    const tokens = await exchangeGoogleCalendarCode(externalRequestOrigin(request), code);
    if (!tokens.refresh_token) throw new Error("Google no devolvió acceso offline. Desconecta CYA Hub en Google y vuelve a autorizarlo.");
    const calendar = await primaryGoogleCalendar(tokens.access_token!);
    const now = new Date().toISOString();
    const rows = await supabaseRequest<Array<{ id: number }>>(
      "/rest/v1/calendar_connections?on_conflict=user_id,provider,external_calendar_id&select=id",
      context.accessToken,
      {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          user_id: identity.id,
          provider: "google",
          external_calendar_id: calendar.id,
          display_name: calendar.summary,
          status: "connected",
          sync_enabled: true,
          sync_direction: "two_way",
          credential_reference: sealCalendarSecret(tokens.refresh_token),
          sync_cursor: null,
          last_error: null,
          connected_at: now,
          disconnected_at: null,
        }),
      },
    );
    if (!rows?.[0]?.id) throw new Error("CYA Hub no pudo guardar la conexión de calendario.");
    response = new NextResponse(completionPage(true, "Google Calendar conectado."), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo conectar Google Calendar.";
    response = new NextResponse(completionPage(false, message), {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }
  response.cookies.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", path: "/api/google-calendar", maxAge: 0 });
  return response;
}
