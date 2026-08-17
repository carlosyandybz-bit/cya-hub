import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "../../../email-smtp-server";
import { bearerToken, requireStaff, supabaseRequest } from "../../../google-calendar-server";

export const dynamic = "force-dynamic";

async function requireAdmin(request: NextRequest) {
  const accessToken = bearerToken(request);
  const identity = await requireStaff(accessToken);
  const roles = await supabaseRequest<Array<{ role: string }>>(
    `/rest/v1/app_member_roles?select=role&user_id=eq.${encodeURIComponent(identity.id)}&active=eq.true`,
    accessToken,
  );
  if (!roles.some((item) => item.role === "admin" || item.role === "teacher_admin")) {
    throw new Error("Tu cuenta no tiene permiso administrativo para enviar pruebas de correo.");
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = await request.json().catch(() => null) as { to?: string } | null;
    const to = body?.to?.trim() ?? "";
    if (!to) return NextResponse.json({ error: "Indica una dirección donde recibir el correo de prueba." }, { status: 400 });

    const result = await sendEmail({
      to,
      subject: "Prueba de correo - CYA Hub",
      text: [
        "Este correo confirma que CYA Hub puede enviar correctamente desde hola@carlosyandy.com.",
        "",
        "Si puedes leerlo y responder, la integración de correo está funcionando.",
        "",
        "Carlos & Andy",
      ].join("\n"),
    });

    return NextResponse.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "No se pudo enviar el correo de prueba.",
    }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
