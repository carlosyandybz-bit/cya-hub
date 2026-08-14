import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createDriveResumableUpload, deleteDriveFile, driveServerConfigured } from "../../../google-drive-server";
import { queryCompletedDriveUpload, signDriveUploadTicket, verifyDriveUploadTicket } from "../../../drive-upload-session-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UploadContext = { class_id: number; person_id: number };
type UploadedDriveFile = { id: string; name?: string; mimeType?: string; webViewLink?: string };

function bearer(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

function authenticatedClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) throw new Error("CYA Hub no ha podido conectar con sus datos.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { authorization: `Bearer ${accessToken}` } },
  });
}

async function uploadContext(accessToken: string, classId: number) {
  const client = authenticatedClient(accessToken);
  const result = await client.rpc("class_preparation_upload_context", { p_class_id: classId });
  if (result.error) throw new Error(result.error.message);
  const row = (result.data as UploadContext[] | null)?.[0] ?? null;
  return row;
}

async function registerVideo(accessToken: string, classId: number, file: UploadedDriveFile, fallbackName: string) {
  const client = authenticatedClient(accessToken);
  const result = await client.rpc("register_class_preparation_video", {
    p_class_id: classId,
    p_external_file_id: file.id,
    p_title: file.name || fallbackName,
  });
  if (result.error) throw new Error(result.error.message);
  return Number(result.data);
}

async function removeVideo(accessToken: string, requestId: number) {
  const client = authenticatedClient(accessToken);
  const result = await client.rpc("remove_class_preparation_video", { p_request_id: requestId });
  if (result.error) throw new Error(result.error.message);
  return String(result.data || "");
}

function validClassId(value: unknown) {
  const id = Number(value || 0);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function uploadInput(nameValue: unknown, mimeValue: unknown, sizeValue: unknown) {
  const name = String(nameValue || "video-practica.mp4").trim().slice(0, 180) || "video-practica.mp4";
  const mimeType = String(mimeValue || "application/octet-stream").split(";")[0].trim();
  const size = Number(sizeValue || 0);
  if (!Number.isFinite(size) || size <= 0 || size > 1024 * 1024 * 1024) throw new Error("El vídeo debe ser menor de 1 GB.");
  if (!mimeType.startsWith("video/")) throw new Error("Selecciona un vídeo para preparar la clase.");
  return { name, mimeType, size };
}

export async function POST(request: NextRequest) {
  try {
    if (!driveServerConfigured()) return NextResponse.json({ error: "Ahora mismo no podemos recibir el vídeo. Puedes dejarnos un enlace y probar de nuevo después." }, { status: 503 });
    const accessToken = bearer(request);
    if (!accessToken) return NextResponse.json({ error: "Tu sesión ha caducado. Vuelve a entrar para enviarnos el vídeo." }, { status: 401 });
    const body = await request.json().catch(() => null) as { classId?: number; name?: string; mimeType?: string; size?: number } | null;
    const classId = validClassId(body?.classId);
    if (!classId) return NextResponse.json({ error: "No encontramos la clase que quieres preparar." }, { status: 400 });
    const context = await uploadContext(accessToken, classId);
    if (!context || Number(context.class_id) !== classId) return NextResponse.json({ error: "Esta clase ya no admite preparación desde tu perfil." }, { status: 403 });
    const personId = Number(context.person_id);
    const { name, mimeType, size } = uploadInput(body?.name, body?.mimeType, body?.size);

    const uploadUrl = await createDriveResumableUpload(name, mimeType, size, "class_video");
    const ticket = signDriveUploadTicket({
      purpose: "class-preparation-upload",
      uploadUrl,
      name,
      mimeType,
      size,
      scope: "class_video",
      classId,
      personId,
    });
    return NextResponse.json({ uploadUrl, ticket }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No hemos podido preparar la subida del vídeo." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  let uploadedFileId = "";
  try {
    const accessToken = bearer(request);
    if (!accessToken) return NextResponse.json({ error: "Tu sesión ha caducado. Vuelve a entrar para enviarnos el vídeo." }, { status: 401 });
    const body = await request.json().catch(() => null) as { ticket?: string } | null;
    const payload = verifyDriveUploadTicket(String(body?.ticket || ""), "class-preparation-upload");
    if (!payload?.classId || !payload.personId) return NextResponse.json({ error: "La subida ha caducado. Puedes volver a intentarlo." }, { status: 400 });
    const context = await uploadContext(accessToken, payload.classId);
    if (!context || Number(context.class_id) !== payload.classId || Number(context.person_id) !== payload.personId) return NextResponse.json({ error: "Esta clase ya no admite ese vídeo." }, { status: 403 });

    const file = await queryCompletedDriveUpload(payload);
    if (!file) return NextResponse.json({ error: "El vídeo todavía se está terminando de subir." }, { status: 409 });
    uploadedFileId = file.id;
    const requestId = await registerVideo(accessToken, payload.classId, file, payload.name);
    uploadedFileId = "";
    return NextResponse.json({ id: file.id, name: file.name || payload.name, mimeType: file.mimeType || payload.mimeType, requestId }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (uploadedFileId) await deleteDriveFile(uploadedFileId).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "No hemos podido guardar el vídeo en la preparación." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  let uploadedFileId = "";
  try {
    if (!driveServerConfigured()) return NextResponse.json({ error: "Ahora mismo no podemos recibir el vídeo. Puedes dejarnos un enlace y probar de nuevo después." }, { status: 503 });
    const accessToken = bearer(request);
    if (!accessToken) return NextResponse.json({ error: "Tu sesión ha caducado. Vuelve a entrar para enviarnos el vídeo." }, { status: 401 });
    const classId = validClassId(request.headers.get("x-cya-class-id"));
    if (!classId) return NextResponse.json({ error: "No encontramos la clase que quieres preparar." }, { status: 400 });
    const context = await uploadContext(accessToken, classId);
    if (!context || Number(context.class_id) !== classId) return NextResponse.json({ error: "Esta clase ya no admite preparación desde tu perfil." }, { status: 403 });
    const { name, mimeType, size } = uploadInput(
      decodeURIComponent(request.headers.get("x-cya-file-name") || "video-practica.mp4"),
      request.headers.get("content-type"),
      request.headers.get("x-cya-file-size") || request.headers.get("content-length"),
    );
    if (!request.body) return NextResponse.json({ error: "El vídeo está vacío." }, { status: 400 });

    const location = await createDriveResumableUpload(name, mimeType, size, "class_video");
    const init: RequestInit & { duplex: "half" } = {
      method: "PUT",
      headers: { "content-type": mimeType, "content-length": String(size) },
      body: request.body,
      duplex: "half",
    };
    const upload = await fetch(location, init);
    const file = await upload.json().catch(() => null) as UploadedDriveFile | null;
    if (!upload.ok || !file?.id) return NextResponse.json({ error: `No hemos podido guardar el vídeo (${upload.status}).` }, { status: 502 });
    uploadedFileId = file.id;
    const requestId = await registerVideo(accessToken, classId, file, name);
    uploadedFileId = "";
    return NextResponse.json({ id: file.id, name: file.name || name, mimeType: file.mimeType || mimeType, requestId }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (uploadedFileId) await deleteDriveFile(uploadedFileId).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "No hemos podido subir el vídeo esta vez. Puedes probar de nuevo o dejarnos un enlace." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const accessToken = bearer(request);
    if (!accessToken) return NextResponse.json({ ok: true });
    const body = await request.json().catch(() => null) as { ticket?: string; requestId?: number } | null;

    if (body?.requestId) {
      const requestId = validClassId(body.requestId);
      if (!requestId) return NextResponse.json({ ok: true });
      const fileId = await removeVideo(accessToken, requestId);
      if (fileId) await deleteDriveFile(fileId).catch(() => undefined);
      return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
    }

    const payload = verifyDriveUploadTicket(String(body?.ticket || ""), "class-preparation-upload");
    if (!payload?.classId || !payload.personId) return NextResponse.json({ ok: true });
    const context = await uploadContext(accessToken, payload.classId).catch(() => null);
    if (!context || Number(context.person_id) !== payload.personId) return NextResponse.json({ ok: true });
    const file = await queryCompletedDriveUpload(payload).catch(() => null);
    if (file?.id) await deleteDriveFile(file.id).catch(() => undefined);
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  }
}
