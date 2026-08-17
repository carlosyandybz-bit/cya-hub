import { NextRequest, NextResponse } from "next/server";
import { emailRuntimeStatus, verifyEmailSmtp } from "../../../email-smtp-server";
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
    throw new Error("Tu cuenta no tiene permiso administrativo para configurar el correo.");
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const runtime = emailRuntimeStatus();
    if (!runtime.configured) {
      return NextResponse.json({
        configured: false,
        verified: false,
        fromAddress: runtime.fromAddress,
        fromName: runtime.fromName,
        missing: runtime.missing,
        error: runtime.secure ? "La configuración SMTP está incompleta." : "CYA exige SMTP con SSL/TLS para esta integración.",
      }, { status: 503, headers: { "cache-control": "no-store" } });
    }

    const verified = await verifyEmailSmtp();
    return NextResponse.json({
      configured: true,
      verified: true,
      fromAddress: verified.fromAddress,
      fromName: verified.fromName,
      host: verified.host,
      port: verified.port,
      secure: verified.secure,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      configured: emailRuntimeStatus().configured,
      verified: false,
      error: error instanceof Error ? error.message : "No se pudo comprobar el correo.",
    }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
