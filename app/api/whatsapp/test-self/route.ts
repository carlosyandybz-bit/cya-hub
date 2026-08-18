import { NextRequest, NextResponse } from "next/server";
import { bearerToken, requireStaff, supabaseRequest } from "../../../google-calendar-server";
import { sendWhatsAppText, whatsappRuntimeDiagnostics } from "../../../whatsapp-server";

export const dynamic = "force-dynamic";

type AuthUser = {
  id?: string;
  phone?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function firstPhone(user: AuthUser) {
  const metadata = user.user_metadata ?? {};
  const candidates = [
    user.phone,
    metadata.phone,
    metadata.phone_number,
    metadata.mobile,
    metadata.telefono,
    metadata.telephone,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const normalized = candidate.replace(/\D/g, "");
    if (normalized.length >= 8) return normalized;
  }
  return "";
}

export async function POST(request: NextRequest) {
  try {
    const diagnostics = whatsappRuntimeDiagnostics();
    if (!diagnostics.sendConfigured) {
      return NextResponse.json({ error: "WhatsApp todavía no está configurado para enviar desde CYA Hub." }, { status: 503 });
    }

    const accessToken = bearerToken(request);
    const staff = await requireStaff(accessToken);
    const user = await supabaseRequest<AuthUser>("/auth/v1/user", accessToken);
    const destination = firstPhone(user);

    if (!destination) {
      return NextResponse.json({
        error: "Tu usuario de CYA Hub no tiene un teléfono disponible para la prueba. Añade tu teléfono a tu cuenta antes de repetirla.",
      }, { status: 409 });
    }

    const sent = await sendWhatsAppText({
      to: destination,
      body: "Prueba de WhatsApp de CYA Hub. Si recibes este mensaje, el canal de salida está funcionando correctamente.",
    });

    return NextResponse.json({
      ok: true,
      messageId: sent.messageId,
      recipient: destination.slice(-4).padStart(destination.length, "•"),
      staffId: staff.id,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "No se pudo enviar el mensaje de prueba por WhatsApp.",
    }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
