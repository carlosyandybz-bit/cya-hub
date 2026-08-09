import { NextRequest, NextResponse } from "next/server";
import { driveServerConfigured, proxyDriveMedia, verifyMediaTicket } from "../../../google-drive-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    if (!driveServerConfigured()) return NextResponse.json({ error: "Google Drive todavía no está conectado al servidor de CYA Hub." }, { status: 503 });
    const fileId = request.nextUrl.searchParams.get("fileId")?.trim() || "";
    const ticket = request.nextUrl.searchParams.get("ticket")?.trim() || "";
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId) || !verifyMediaTicket(ticket, fileId)) return NextResponse.json({ error: "Enlace multimedia no válido o caducado." }, { status: 403 });

    const upstream = await proxyDriveMedia(fileId, request.headers.get("range"));
    if (!upstream.ok && upstream.status !== 206) return NextResponse.json({ error: `No se pudo cargar el archivo (${upstream.status}).` }, { status: upstream.status === 404 ? 404 : 502 });

    const headers = new Headers();
    for (const key of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
      const value = upstream.headers.get(key);
      if (value) headers.set(key, value);
    }
    headers.set("cache-control", "private, max-age=300");
    headers.set("x-content-type-options", "nosniff");
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo cargar el archivo." }, { status: 500 });
  }
}
