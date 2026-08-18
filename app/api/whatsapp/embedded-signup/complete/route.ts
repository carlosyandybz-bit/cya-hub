import { NextRequest, NextResponse } from "next/server";
import { bearerToken, requireStaff } from "../../../../google-calendar-server";

export const dynamic = "force-dynamic";

const GRAPH_API_ORIGIN = "https://graph.facebook.com";

function env(name: string) {
  return process.env[name]?.trim() ?? "";
}

type MetaError = {
  error?: { message?: string; code?: number; error_subcode?: number };
};

type PhoneNumber = {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  code_verification_status?: string;
  platform_type?: string;
  quality_rating?: string;
};

async function graph<T>(path: string, init?: RequestInit) {
  const version = env("WHATSAPP_GRAPH_API_VERSION") || "v26.0";
  const accessToken = env("WHATSAPP_ACCESS_TOKEN");
  if (!accessToken) throw new Error("WHATSAPP_ACCESS_TOKEN no está configurado.");

  const response = await fetch(`${GRAPH_API_ORIGIN}/${version}/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as (T & MetaError) | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Meta respondió ${response.status}.`);
  }
  return payload as T;
}

export async function POST(request: NextRequest) {
  try {
    await requireStaff(bearerToken(request));
    const body = await request.json().catch(() => ({})) as {
      wabaId?: string;
      phoneNumberId?: string;
      event?: string;
    };
    const wabaId = String(body.wabaId || "").replace(/\D/g, "");
    const hintedPhoneNumberId = String(body.phoneNumberId || "").replace(/\D/g, "");
    if (!wabaId) {
      return NextResponse.json({ error: "Meta no devolvió el identificador de la cuenta de WhatsApp Business." }, { status: 400 });
    }

    // Embedded Signup no sustituye el token permanente de producción. Una vez Meta
    // termina el onboarding, CYA suscribe su app a la WABA usando el system-user token
    // permanente que ya vive únicamente en Hostinger.
    await graph<{ success?: boolean }>(`${encodeURIComponent(wabaId)}/subscribed_apps`, { method: "POST" });

    const phones = await graph<{ data?: PhoneNumber[] }>(
      `${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,platform_type,quality_rating`,
    );
    const phoneNumbers = Array.isArray(phones?.data) ? phones.data : [];
    const selected = phoneNumbers.find((item) => item.id === hintedPhoneNumberId) || phoneNumbers[0] || null;

    return NextResponse.json({
      ok: true,
      wabaId,
      phoneNumberId: selected?.id || hintedPhoneNumberId || null,
      displayPhoneNumber: selected?.display_phone_number || null,
      verifiedName: selected?.verified_name || null,
      verificationStatus: selected?.code_verification_status || null,
      platformType: selected?.platform_type || null,
      qualityRating: selected?.quality_rating || null,
      currentConfiguredPhoneNumberId: env("WHATSAPP_PHONE_NUMBER_ID") || null,
      needsPhoneNumberEnvUpdate: Boolean(selected?.id && env("WHATSAPP_PHONE_NUMBER_ID") && selected.id !== env("WHATSAPP_PHONE_NUMBER_ID")),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "No se pudo completar Embedded Signup de WhatsApp.",
    }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
