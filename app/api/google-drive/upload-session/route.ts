import { NextRequest, NextResponse } from "next/server";
import { deleteDriveFile, createDriveResumableUpload, driveServerConfigured, userCanManageTeaching, type DriveUploadScope } from "../../../google-drive-server";
import { queryCompletedDriveUpload, signDriveUploadTicket, verifyDriveUploadTicket } from "../../../drive-upload-session-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearer(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

function validScope(value: unknown): DriveUploadScope {
  return value === "class_video" ? "class_video" : "teaching";
}

export async function POST(request: NextRequest) {
  try {
    if (!driveServerConfigured()) return NextResponse.json({ error: "Google Drive todavía no está conectado al servidor de CYA Hub." }, { status: 503 });
    const accessToken = bearer(request);
    if (!accessToken || !(await userCanManageTeaching(accessToken))) return NextResponse.json({ error: "No tienes permiso para subir archivos." }, { status: 403 });
    const body = await request.json().catch(() => null) as { name?: string; mimeType?: string; size?: number; scope?: string } | null;
    const name = String(body?.name || "archivo").trim().slice(0, 180) || "archivo";
    const mimeType = String(body?.mimeType || "application/octet-stream").split(";")[0].trim();
    const size = Number(body?.size || 0);
    const scope = validScope(body?.scope);
    if (!Number.isFinite(size) || size <= 0 || size > 1024 * 1024 * 1024) return NextResponse.json({ error: "El archivo debe ser menor de 1 GB." }, { status: 400 });
    if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) return NextResponse.json({ error: "Solo se admiten fotos y vídeos." }, { status: 400 });

    const uploadUrl = await createDriveResumableUpload(name, mimeType, size, scope);
    const ticket = signDriveUploadTicket({ purpose: "teaching-upload", uploadUrl, name, mimeType, size, scope });
    return NextResponse.json({ uploadUrl, ticket }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo preparar la subida." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const accessToken = bearer(request);
    if (!accessToken || !(await userCanManageTeaching(accessToken))) return NextResponse.json({ error: "No tienes permiso para confirmar archivos." }, { status: 403 });
    const body = await request.json().catch(() => null) as { ticket?: string } | null;
    const payload = verifyDriveUploadTicket(String(body?.ticket || ""), "teaching-upload");
    if (!payload) return NextResponse.json({ error: "La sesión de subida no es válida o ha caducado." }, { status: 400 });
    const file = await queryCompletedDriveUpload(payload);
    if (!file) return NextResponse.json({ error: "La subida todavía no ha terminado." }, { status: 409 });
    return NextResponse.json(file, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo confirmar la subida." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const accessToken = bearer(request);
    if (!accessToken || !(await userCanManageTeaching(accessToken))) return NextResponse.json({ error: "No tienes permiso para cancelar archivos." }, { status: 403 });
    const body = await request.json().catch(() => null) as { ticket?: string } | null;
    const payload = verifyDriveUploadTicket(String(body?.ticket || ""), "teaching-upload");
    if (!payload) return NextResponse.json({ ok: true });
    const file = await queryCompletedDriveUpload(payload).catch(() => null);
    if (file?.id) await deleteDriveFile(file.id).catch(() => undefined);
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  }
}
