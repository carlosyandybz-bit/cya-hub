import { NextRequest, NextResponse } from "next/server";
import { bearerToken, requireStaff, supabaseRequest } from "../../../google-calendar-server";
import { sendWhatsAppText, whatsappRuntimeDiagnostics } from "../../../whatsapp-server";

export const dynamic = "force-dynamic";

type DispatchValidation = {
  allowed: boolean;
  reason: string | null;
  channel: "whatsapp" | "email" | null;
  destination: string | null;
  message_snapshot: string | null;
  campaign_title: string | null;
};

function firstRow<T>(value: T | T[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function POST(request: NextRequest) {
  try {
    const diagnostics = whatsappRuntimeDiagnostics();
    if (!diagnostics.sendConfigured) {
      return NextResponse.json({ error: "WhatsApp todavía no está configurado para envío automático." }, { status: 503 });
    }

    const accessToken = bearerToken(request);
    await requireStaff(accessToken);
    const body = await request.json().catch(() => null) as { recipientId?: number } | null;
    const recipientId = Number(body?.recipientId ?? 0);
    if (!Number.isSafeInteger(recipientId) || recipientId <= 0) {
      return NextResponse.json({ error: "Destinatario no válido." }, { status: 400 });
    }

    const validationResult = await supabaseRequest<DispatchValidation | DispatchValidation[]>(
      "/rest/v1/rpc/validate_communication_dispatch",
      accessToken,
      { method: "POST", body: JSON.stringify({ p_recipient_id: recipientId }) },
    );
    const dispatch = firstRow(validationResult);
    if (!dispatch?.allowed) {
      return NextResponse.json({ error: dispatch?.reason || "El envío no está permitido." }, { status: 409 });
    }
    if (dispatch.channel !== "whatsapp" || !dispatch.destination || !dispatch.message_snapshot) {
      return NextResponse.json({ error: "El destinatario no tiene un envío de WhatsApp preparado." }, { status: 409 });
    }

    const sent = await sendWhatsAppText({ to: dispatch.destination, body: dispatch.message_snapshot });
    await supabaseRequest(
      "/rest/v1/rpc/mark_communication_sent",
      accessToken,
      { method: "POST", body: JSON.stringify({ p_recipient_id: recipientId }) },
    );

    return NextResponse.json({ ok: true, messageId: sent.messageId }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "No se pudo enviar el mensaje por WhatsApp.",
    }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
