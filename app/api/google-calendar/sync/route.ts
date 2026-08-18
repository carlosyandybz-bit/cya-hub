import { NextRequest, NextResponse } from "next/server";
import { bearerToken, calendarServerConfigured, type CalendarConnectionRow, requireStaff, supabaseRequest } from "../../../google-calendar-server";
import { syncGoogleCalendar } from "../../../google-calendar-sync-server";
import { syncSecondaryGoogleCalendars } from "../../../google-calendar-secondary-sync-server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let accessToken = "";
  let connection: CalendarConnectionRow | null = null;
  let lockToken: string | null = null;
  try {
    if (!calendarServerConfigured()) return NextResponse.json({ error: "Google Calendar no está configurado en el servidor." }, { status: 503 });
    accessToken = bearerToken(request);
    const identity = await requireStaff(accessToken);
    const rows = await supabaseRequest<CalendarConnectionRow[]>(
      `/rest/v1/calendar_connections?select=id,user_id,provider,external_calendar_id,display_name,status,sync_enabled,sync_direction,credential_reference,last_synced_at,last_error,sync_cursor,sync_started_at,sync_completed_at,sync_error_count&user_id=eq.${encodeURIComponent(identity.id)}&provider=eq.google&status=in.(connected,error)&sync_enabled=eq.true&order=id.desc&limit=1`,
      accessToken,
    );
    connection = rows?.[0] ?? null;
    if (!connection) return NextResponse.json({ error: "Conecta Google Calendar antes de sincronizar." }, { status: 409 });
    lockToken = await supabaseRequest<string | null>("/rest/v1/rpc/begin_calendar_sync", accessToken, {
      method: "POST",
      body: JSON.stringify({ p_connection_id: connection.id }),
    });
    if (!lockToken) return NextResponse.json({ error: "Ya hay una sincronización en curso. No se iniciará otra." }, { status: 409 });

    const metrics = await syncGoogleCalendar(accessToken, connection, lockToken);
    const secondary = await syncSecondaryGoogleCalendars(accessToken, connection);
    return NextResponse.json({ ok: true, metrics: { ...metrics, secondary } }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo sincronizar Google Calendar.";
    if (accessToken && connection && lockToken) {
      try {
        await supabaseRequest("/rest/v1/rpc/fail_calendar_sync", accessToken, {
          method: "POST",
          body: JSON.stringify({ p_connection_id: connection.id, p_lock_token: lockToken, p_error: message }),
        });
      } catch {
        // Preserve the original Google/sync failure as the user-facing error.
      }
    }
    return NextResponse.json({ error: message }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
