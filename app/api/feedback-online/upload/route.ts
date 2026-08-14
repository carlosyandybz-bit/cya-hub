import { NextRequest, NextResponse } from "next/server";
import {
  attachFeedbackVideo,
  createDriveResumableUpload,
  deleteDriveFile,
  driveServerConfigured,
  feedbackUploadContext,
  signFeedbackUploadProof,
} from "../../../google-drive-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearer(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

export async function POST(request: NextRequest) {
  let uploadedFileId = "";
  try {
    if (!driveServerConfigured()) return NextResponse.json({ error: "Google Drive todavía no está conectado al servidor de CYA Hub." }, { status: 503 });
    const accessToken = bearer(request);
    if (!accessToken) return NextResponse.json({ error: "Necesitas iniciar sesión." }, { status: 401 });

    const requestId = Number(request.headers.get("x-cya-feedback-request-id") || 0);
    if (!Number.isSafeInteger(requestId) || requestId <= 0) return NextResponse.json({ error: "Solicitud de Feedback no válida." }, { status: 400 });
    const context = await feedbackUploadContext(accessToken, requestId);
    if (!context || Number(context.request_id) !== requestId) return NextResponse.json({ error: "No tienes permiso para subir un vídeo a esta solicitud." }, { status: 403 });
    const previousFileId = typeof (context as { external_file_id?: unknown }).external_file_id === "string"
      ? String((context as { external_file_id: string }).external_file_id).trim()
      : "";

    const name = decodeURIComponent(request.headers.get("x-cya-file-name") || "feedback.mp4").trim().slice(0, 180) || "feedback.mp4";
    const mimeType = (request.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
    const size = Number(request.headers.get("content-length") || request.headers.get("x-cya-file-size") || 0);
    if (!Number.isFinite(size) || size <= 0 || size > 1024 * 1024 * 1024) return NextResponse.json({ error: "El vídeo debe tener un tamaño válido y ser menor de 1 GB." }, { status: 400 });
    if (!mimeType.startsWith("video/")) return NextResponse.json({ error: "Feedback Online solo admite vídeos." }, { status: 400 });
    if (!request.body) return NextResponse.json({ error: "El vídeo está vacío." }, { status: 400 });

    const location = await createDriveResumableUpload(name, mimeType, size, "feedback");
    const init: RequestInit & { duplex: "half" } = {
      method: "PUT",
      headers: { "content-type": mimeType, "content-length": String(size) },
      body: request.body,
      duplex: "half",
    };
    const upload = await fetch(location, init);
    const payload = await upload.json().catch(() => null) as { id?: string; name?: string; mimeType?: string; webViewLink?: string } | null;
    if (!upload.ok || !payload?.id) return NextResponse.json({ error: `Google Drive no pudo guardar el vídeo (${upload.status}).` }, { status: 502 });
    uploadedFileId = payload.id;

    const personId = Number(context.person_id);
    if (!Number.isSafeInteger(personId) || personId <= 0) throw new Error("La identidad del alumno no es válida.");
    const proof = signFeedbackUploadProof(requestId, personId, payload.id);
    await attachFeedbackVideo(accessToken, {
      requestId,
      fileId: payload.id,
      uploadProof: proof,
      title: payload.name || name,
      mimeType: payload.mimeType || mimeType,
      sizeBytes: size,
    });
    uploadedFileId = "";
    if (previousFileId && previousFileId !== payload.id) await deleteDriveFile(previousFileId).catch(() => undefined);

    return NextResponse.json({ id: payload.id, name: payload.name || name, mimeType: payload.mimeType || mimeType, requestId }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (uploadedFileId) await deleteDriveFile(uploadedFileId).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo subir el vídeo de Feedback Online." }, { status: 500 });
  }
}
