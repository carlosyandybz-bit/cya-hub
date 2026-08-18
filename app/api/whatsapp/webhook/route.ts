import { NextRequest, NextResponse } from "next/server";
import { verifyWhatsAppWebhookSignature, whatsappRuntimeDiagnostics, whatsappVerifyTokenMatches } from "../../../whatsapp-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const diagnostics = whatsappRuntimeDiagnostics();
  if (!diagnostics.webhookConfigured) return new NextResponse("Webhook not configured", { status: 503 });

  const mode = request.nextUrl.searchParams.get("hub.mode") ?? "";
  const token = request.nextUrl.searchParams.get("hub.verify_token") ?? "";
  const challenge = request.nextUrl.searchParams.get("hub.challenge") ?? "";
  if (mode !== "subscribe" || !challenge || !whatsappVerifyTokenMatches(token)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return new NextResponse(challenge, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const diagnostics = whatsappRuntimeDiagnostics();
  if (!diagnostics.webhookConfigured) return new NextResponse("Webhook not configured", { status: 503 });

  const rawBody = await request.text();
  if (!verifyWhatsAppWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
