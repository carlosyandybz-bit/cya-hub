import { NextRequest, NextResponse } from "next/server";
import { bearerToken, requireStaff, supabaseRequest } from "../../../google-calendar-server";

export const dynamic = "force-dynamic";

type ConflictRow = {
  id: number;
  connection_id: number | null;
  source_type: string;
  source_id: string | null;
  sync_status: string;
  conflict_data: { reason?: string; remote_etag?: string | null } | null;
};

export async function POST(request: NextRequest) {
  try {
    const accessToken = bearerToken(request);
    await requireStaff(accessToken);
    const body = await request.json().catch(() => null) as { eventId?: number; strategy?: string } | null;
    if (!body?.eventId || body.strategy !== "keep_cya") return NextResponse.json({ error: "Resolución de conflicto no válida." }, { status: 400 });
    const rows = await supabaseRequest<ConflictRow[]>(
      `/rest/v1/calendar_events?select=id,connection_id,source_type,source_id,sync_status,conflict_data&id=eq.${body.eventId}&sync_status=eq.conflict&limit=1`,
      accessToken,
    );
    const conflict = rows?.[0];
    if (!conflict || conflict.source_type === "external" || !conflict.source_id) return NextResponse.json({ error: "El conflicto ya no existe o no pertenece a un evento CYA." }, { status: 404 });
    const deletedInGoogle = conflict.conflict_data?.reason === "deleted_in_google";
    await supabaseRequest(`/rest/v1/calendar_events?id=eq.${conflict.id}`, accessToken, {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({
        sync_status: "pending",
        payload_hash: null,
        conflict_data: {},
        external_event_id: deletedInGoogle ? null : undefined,
        external_etag: deletedInGoogle ? null : (conflict.conflict_data?.remote_etag ?? null),
        deleted_at: null,
      }),
    });
    return NextResponse.json({ ok: true, needsSync: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo resolver el conflicto de calendario." }, { status: 400 });
  }
}
