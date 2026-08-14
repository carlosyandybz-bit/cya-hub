import { NextRequest, NextResponse } from "next/server";
import {
  driveServerConfigured,
  signMediaTicket,
  userCanAccessFeedbackMedia,
  userCanAccessTeachingMedia,
} from "../../../google-drive-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearer(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    if (!driveServerConfigured()) return NextResponse.json({ configured: false, error: "Google Drive todavía no está conectado al servidor de CYA Hub." }, { status: 503 });
    const accessToken = bearer(request);
    if (!accessToken) return NextResponse.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
    const body = await request.json().catch(() => null) as { fileId?: string } | null;
    const fileId = body?.fileId?.trim() || "";
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) return NextResponse.json({ error: "Archivo no válido." }, { status: 400 });

    let allowed = await userCanAccessTeachingMedia(accessToken, fileId).catch(() => false);
    if (!allowed) allowed = await userCanAccessFeedbackMedia(accessToken, fileId).catch(() => false);
    if (!allowed) return NextResponse.json({ error: "No tienes permiso para ver este archivo." }, { status: 403 });

    return NextResponse.json({ configured: true, fileId, ticket: signMediaTicket(fileId, 600), expiresIn: 600 }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo preparar el archivo." }, { status: 500 });
  }
}
