import { NextRequest, NextResponse } from "next/server";
import { createDriveResumableUpload, driveServerConfigured, userCanManageTeaching } from "../../../google-drive-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearer(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    if (!driveServerConfigured()) return NextResponse.json({ error: "Google Drive todavía no está conectado al servidor de CYA Hub." }, { status: 503 });
    const accessToken = bearer(request);
    if (!accessToken || !(await userCanManageTeaching(accessToken))) return NextResponse.json({ error: "No tienes permiso para subir archivos de Enseñanza." }, { status: 403 });

    const name = decodeURIComponent(request.headers.get("x-cya-file-name") || "archivo").trim().slice(0, 180) || "archivo";
    const mimeType = (request.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
    const size = Number(request.headers.get("content-length") || request.headers.get("x-cya-file-size") || 0);
    if (!Number.isFinite(size) || size <= 0 || size > 1024 * 1024 * 1024) return NextResponse.json({ error: "El archivo debe tener un tamaño válido y ser menor de 1 GB." }, { status: 400 });
    if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) return NextResponse.json({ error: "Solo se admiten fotos y vídeos." }, { status: 400 });
    if (!request.body) return NextResponse.json({ error: "El archivo está vacío." }, { status: 400 });

    const location = await createDriveResumableUpload(name, mimeType, size);
    const init: RequestInit & { duplex: "half" } = {
      method: "PUT",
      headers: { "content-type": mimeType, "content-length": String(size) },
      body: request.body,
      duplex: "half",
    };
    const upload = await fetch(location, init);
    const payload = await upload.json().catch(() => null) as { id?: string; name?: string; mimeType?: string; webViewLink?: string } | null;
    if (!upload.ok || !payload?.id) return NextResponse.json({ error: `Google Drive no pudo guardar el archivo (${upload.status}).` }, { status: 502 });
    return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo subir el archivo." }, { status: 500 });
  }
}
