import { NextRequest, NextResponse } from "next/server";
import { bearerToken, requireStaff } from "../../../google-calendar-server";
import { whatsappRuntimeDiagnostics } from "../../../whatsapp-server";

export const dynamic = "force-dynamic";

const labels = {
  access_token: "token de acceso de Meta",
  phone_number_id: "número de WhatsApp Business",
  graph_api_version: "versión de la API de Meta",
  verify_token: "verificación del webhook",
  app_secret: "firma segura del webhook",
} as const;

export async function GET(request: NextRequest) {
  try {
    await requireStaff(bearerToken(request));
    const diagnostics = whatsappRuntimeDiagnostics();
    return NextResponse.json({
      ...diagnostics,
      missingLabels: diagnostics.missingRequirements.map((item) => labels[item]),
      webhookPath: "/api/integrations/whatsapp/webhook",
      supports: ["server_text_send", "webhook_verification", "signed_webhooks", "manual_fallback"],
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "No se pudo comprobar WhatsApp.",
    }, { status: 403, headers: { "cache-control": "no-store" } });
  }
}
