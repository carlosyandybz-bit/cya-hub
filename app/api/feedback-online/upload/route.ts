import { NextRequest, NextResponse } from "next/server";
import {
  attachFeedbackVideo,
  createDriveResumableUpload,
  deleteDriveFile,
  driveServerConfigured,
  feedbackUploadContext,
  signFeedbackUploadProof,
} from "../../../google-drive-server";
import { queryCompletedDriveUpload, signDriveUploadTicket, verifyDriveUploadTicket } from "../../../drive-upload-session-server";

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
    if (!accessToken) return NextResponse.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
    const body = await request.json().catch(() => null) as { requestId?: number; name?: string; mimeType?: string; size?: number } | null;
    const requestId = Number(body?.requestId || 0);
    if (!Number.isSafeInteger(requestId) || requestId <= 0) return NextResponse.json({ error: "Solicitud de Feedback no válida." }, { status: 400 });
    const context = await feedbackUploadContext(accessToken, requestId);
    if (!context || Number(context.request_id) !== requestId) return NextResponse.json({ error: "No tienes permiso para subir un vídeo a esta solicitud." }, { status: 403 });
    const personId = Number(context.person_id);
    if (!Number.isSafeInteger(personId) || personId <= 0) return NextResponse.json({ error: "La identidad del alumno no es válida." }, { status: 400 });

    const name = String(body?.name || "feedback.mp4").trim().slice(0, 180) || "feedback.mp4";
    const mimeType = String(body?.mimeType || "application/octet-stream").split(";")[0].trim();
    const size = Number(body?.size || 0);
    if (!Number.isFinite(size) || size <= 0 || size > 1024 * 1024 * 1024) return NextResponse.json({ error: "El vídeo debe ser menor de 1 GB." }, { status: 400 });
    if (!mimeType.startsWith("video/")) return NextResponse.json({ error: "Feedback Online solo admite vídeos." }, { status: 400 });

    const uploadUrl = await createDriveResumableUpload(name, mimeType, size, "feedback");
    const ticket = signDriveUploadTicket({
      purpose: "feedback-upload", uploadUrl, name, mimeType, size, scope: "feedback", requestId, personId,
      previousFileId: context.external_file_id?.trim() || null,
    });
    return NextResponse.json({ uploadUrl, ticket }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo preparar el vídeo de Feedback Online." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  let uploadedFileId = "";
  try {
    const accessToken = bearer(request);
    if (!accessToken) return NextResponse.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
    const body = await request.json().catch(() => null) as { ticket?: string } | null;
    const payload = verifyDriveUploadTicket(String(body?.ticket || ""), "feedback-upload");
    if (!payload || !payload.requestId || !payload.personId) return NextResponse.json({ error: "La sesión de subida no es válida o ha caducado." }, { status: 400 });
    const context = await feedbackUploadContext(accessToken, payload.requestId);
    if (!context || Number(context.request_id) !== payload.requestId || Number(context.person_id) !== payload.personId) return NextResponse.json({ error: "La solicitud de Feedback ya no admite este vídeo." }, { status: 403 });
    const file = await queryCompletedDriveUpload(payload);
    if (!file) return NextResponse.json({ error: "La subida todavía no ha terminado." }, { status: 409 });
    uploadedFileId = file.id;
    const proof = signFeedbackUploadProof(payload.requestId, payload.personId, file.id);
    await attachFeedbackVideo(accessToken, { requestId: payload.requestId, fileId: file.id, uploadProof: proof, title: file.name || payload.name, mimeType: file.mimeType || payload.mimeType, sizeBytes: payload.size });
    uploadedFileId = "";
    if (payload.previousFileId && payload.previousFileId !== file.id) await deleteDriveFile(payload.previousFileId).catch(() => undefined);
    return NextResponse.json({ id: file.id, name: file.name || payload.name, mimeType: file.mimeType || payload.mimeType, requestId: payload.requestId }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (uploadedFileId) await deleteDriveFile(uploadedFileId).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo confirmar el vídeo de Feedback Online." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  let uploadedFileId = "";
  try {
    if (!driveServerConfigured()) return NextResponse.json({ error: "Google Drive todavía no está conectado al servidor de CYA Hub." }, { status: 503 });
    const accessToken = bearer(request);
    if (!accessToken) return NextResponse.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
    const requestId = Number(request.headers.get("x-cya-feedback-request-id") || 0);
    if (!Number.isSafeInteger(requestId) || requestId <= 0) return NextResponse.json({ error: "Solicitud de Feedback no válida." }, { status: 400 });
    const context = await feedbackUploadContext(accessToken, requestId);
    if (!context || Number(context.request_id) !== requestId) return NextResponse.json({ error: "No tienes permiso para subir un vídeo a esta solicitud." }, { status: 403 });
    const personId = Number(context.person_id);
    const previousFileId = context.external_file_id?.trim() || "";
    const name = decodeURIComponent(request.headers.get("x-cya-file-name") || "feedback.mp4").trim().slice(0, 180) || "feedback.mp4";
    const mimeType = (request.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
    const size = Number(request.headers.get("x-cya-file-size") || request.headers.get("content-length") || 0);
    if (!Number.isFinite(size) || size <= 0 || size > 1024 * 1024 * 1024) return NextResponse.json({ error: "El vídeo debe ser menor de 1 GB." }, { status: 400 });
    if (!mimeType.startsWith("video/") || !request.body) return NextResponse.json({ error: "Feedback Online solo admite vídeos válidos." }, { status: 400 });

    const location = await createDriveResumableUpload(name, mimeType, size, "feedback");
    const init: RequestInit & { duplex: "half" } = { method: "PUT", headers: { "content-type": mimeType, "content-length": String(size) }, body: request.body, duplex: "half" };
    const upload = await fetch(location, init);
    const file = await upload.json().catch(() => null) as { id?: string; name?: string; mimeType?: string } | null;
    if (!upload.ok || !file?.id) return NextResponse.json({ error: `Google Drive no pudo guardar el vídeo (${upload.status}).` }, { status: 502 });
    uploadedFileId = file.id;
    const proof = signFeedbackUploadProof(requestId, personId, file.id);
    await attachFeedbackVideo(accessToken, { requestId, fileId: file.id, uploadProof: proof, title: file.name || name, mimeType: file.mimeType || mimeType, sizeBytes: size });
    uploadedFileId = "";
    if (previousFileId && previousFileId !== file.id) await deleteDriveFile(previousFileId).catch(() => undefined);
    return NextResponse.json({ id: file.id, name: file.name || name, mimeType: file.mimeType || mimeType, requestId }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (uploadedFileId) await deleteDriveFile(uploadedFileId).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo subir el vídeo de Feedback Online." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const accessToken = bearer(request);
    if (!accessToken) return NextResponse.json({ ok: true });
    const body = await request.json().catch(() => null) as { ticket?: string } | null;
    const payload = verifyDriveUploadTicket(String(body?.ticket || ""), "feedback-upload");
    if (!payload || !payload.requestId || !payload.personId) return NextResponse.json({ ok: true });
    const context = await feedbackUploadContext(accessToken, payload.requestId);
    if (!context || Number(context.person_id) !== payload.personId) return NextResponse.json({ ok: true });
    const file = await queryCompletedDriveUpload(payload).catch(() => null);
    if (file?.id) await deleteDriveFile(file.id).catch(() => undefined);
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  }
}
