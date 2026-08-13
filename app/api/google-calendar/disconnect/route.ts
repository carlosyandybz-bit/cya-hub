import { NextRequest, NextResponse } from "next/server";
import { bearerToken, openCalendarSecret, requireStaff, supabaseRequest } from "../../../google-calendar-server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const accessToken = bearerToken(request);
    const identity = await requireStaff(accessToken);
    const rows = await supabaseRequest<Array<{ id: number; credential_reference: string | null }>>(
      `/rest/v1/calendar_connections?select=id,credential_reference&user_id=eq.${encodeURIComponent(identity.id)}&provider=eq.google&status=neq.disconnected&order=id.desc&limit=1`,
      accessToken,
    );
    const connection = rows?.[0];
    if (!connection) return NextResponse.json({ ok: true, alreadyDisconnected: true }, { headers: { "cache-control": "no-store" } });

    if (connection.credential_reference) {
      try {
        const refreshToken = openCalendarSecret(connection.credential_reference);
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: refreshToken }),
          cache: "no-store",
        });
      } catch {
        // Revocation is best-effort. The local credential is removed regardless.
      }
    }

    await supabaseRequest(
      `/rest/v1/calendar_connections?id=eq.${connection.id}&user_id=eq.${encodeURIComponent(identity.id)}`,
      accessToken,
      {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify({
          status: "disconnected",
          sync_enabled: false,
          credential_reference: null,
          sync_cursor: null,
          sync_started_at: null,
          sync_lock_token: null,
          disconnected_at: new Date().toISOString(),
          last_error: null,
        }),
      },
    );
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo desconectar Google Calendar." }, { status: 400 });
  }
}
