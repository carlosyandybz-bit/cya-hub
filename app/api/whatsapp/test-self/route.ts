import { NextRequest, NextResponse } from "next/server";
import { bearerToken, requireStaff, supabaseRequest } from "../../../google-calendar-server";
import { sendWhatsAppText, whatsappRuntimeDiagnostics } from "../../../whatsapp-server";

export const dynamic = "force-dynamic";

type AuthUser = {
  id?: string;
  phone?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

type PersonPhone = {
  phone?: string | null;
  country_code?: string | null;
};

function normalizePhone(value: unknown, countryCode?: string | null) {
  if (typeof value !== "string") return "";
  let normalized = value.replace(/\D/g, "");
  if (normalized.length < 8) return "";

  // Los teléfonos canónicos de CYA pueden guardarse como número nacional.
  // Para España, WhatsApp Cloud API necesita el prefijo internacional 34.
  if ((countryCode || "").toUpperCase() === "ES" && normalized.length === 9) {
    normalized = `34${normalized}`;
  }

  return normalized;
}

function firstAuthPhone(user: AuthUser) {
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
    const normalized = normalizePhone(candidate);
    if (normalized) return normalized;
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

    const people = await supabaseRequest<PersonPhone[]>(
      `/rest/v1/people?auth_user_id=eq.${encodeURIComponent(staff.id)}&select=phone,country_code&limit=1`,
      accessToken,
    );

    const canonical = people?.[0];
    const destination = normalizePhone(canonical?.phone, canonical?.country_code) || firstAuthPhone(user);

    if (!destination) {
      return NextResponse.json({
        error: "Tu usuario de CYA Hub no tiene un teléfono disponible para la prueba. Añade tu teléfono a tu perfil antes de repetirla.",
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
