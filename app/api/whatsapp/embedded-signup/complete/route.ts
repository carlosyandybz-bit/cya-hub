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
  is_on_biz_app?: boolean;
};

async function metaFetch<T>(url: string, accessToken: string, init?: RequestInit) {
  const response = await fetch(url, {
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

async function graph<T>(path: string, accessToken: string, init?: RequestInit) {
  const version = env("WHATSAPP_GRAPH_API_VERSION") || "v25.0";
  return metaFetch<T>(`${GRAPH_API_ORIGIN}/${version}/${path}`, accessToken, init);
}

async function loadPhones(wabaId: string, accessToken: string) {
  const phones = await graph<{ data?: PhoneNumber[] }>(
    `${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,platform_type,quality_rating,is_on_biz_app`,
    accessToken,
  );
  return Array.isArray(phones?.data) ? phones.data : [];
}

export async function POST(request: NextRequest) {
  try {
    await requireStaff(bearerToken(request));
    const body = await request.json().catch(() => ({})) as {
      wabaId?: string;
      phoneNumberId?: string;
      event?: string;
    };

    const configuredWabaId = env("WHATSAPP_WABA_ID").replace(/\D/g, "");
    const configuredPhoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID").replace(/\D/g, "");
    const permanentToken = env("WHATSAPP_ACCESS_TOKEN");
    if (!configuredWabaId) throw new Error("WHATSAPP_WABA_ID no está configurado.");
    if (!configuredPhoneNumberId) throw new Error("WHATSAPP_PHONE_NUMBER_ID no está configurado.");
    if (!permanentToken) throw new Error("WHATSAPP_ACCESS_TOKEN no está configurado.");

    const resultWabaId = String(body.wabaId || "").replace(/\D/g, "");
    const resultPhoneNumberId = String(body.phoneNumberId || "").replace(/\D/g, "");
    const event = String(body.event || "");

    if (!event.startsWith("FINISH")) {
      return NextResponse.json({ error: "Meta no confirmó que Embedded Signup haya terminado." }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    if (!resultWabaId) {
      return NextResponse.json({ error: "Meta terminó Embedded Signup sin devolver el WABA enlazado." }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    if (resultWabaId !== configuredWabaId) {
      return NextResponse.json({
        error: `Meta terminó la coexistencia con otra WABA (${resultWabaId}). La cuenta configurada en CYA es ${configuredWabaId}.`,
        resultWabaId,
        configuredWabaId,
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    if (resultPhoneNumberId && resultPhoneNumberId !== configuredPhoneNumberId) {
      return NextResponse.json({
        error: `Meta terminó la coexistencia con otro Phone Number ID (${resultPhoneNumberId}). CYA tiene configurado ${configuredPhoneNumberId}.`,
        resultPhoneNumberId,
        configuredPhoneNumberId,
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }

    let phones: PhoneNumber[];
    try {
      phones = await loadPhones(configuredWabaId, permanentToken);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Meta rechazó el token.";
      return NextResponse.json({
        error: `Embedded Signup terminó, pero WHATSAPP_ACCESS_TOKEN no puede administrar la WABA ${configuredWabaId}. Asigna esa WABA al usuario del sistema y genera un token nuevo con whatsapp_business_management y whatsapp_business_messaging. Meta: ${detail}`,
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }

    const selected = phones.find((item) => String(item.id || "").replace(/\D/g, "") === configuredPhoneNumberId) || null;
    if (!selected) {
      const availableIds = phones.map((item) => String(item.id || "").replace(/\D/g, "")).filter(Boolean);
      return NextResponse.json({
        error: availableIds.length
          ? `La WABA ${configuredWabaId} es accesible, pero el Phone Number ID configurado (${configuredPhoneNumberId}) no pertenece a ella. Meta devuelve: ${availableIds.join(", ")}.`
          : `La WABA ${configuredWabaId} es accesible, pero no contiene ningún número disponible para Cloud API.`,
        availablePhoneNumberIds: availableIds,
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }

    try {
      await graph<{ success?: boolean }>(
        `${encodeURIComponent(configuredWabaId)}/subscribed_apps`,
        permanentToken,
        { method: "POST" },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Meta rechazó la suscripción.";
      return NextResponse.json({
        error: `El número aparece en la WABA correcta, pero CYA no pudo suscribirse a sus webhooks con WHATSAPP_ACCESS_TOKEN. Genera un token del usuario del sistema con acceso completo a esa WABA. Meta: ${detail}`,
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }

    const isOnBizApp = selected.is_on_biz_app === true;
    const platformType = selected.platform_type || null;
    if (!isOnBizApp || platformType !== "CLOUD_API") {
      return NextResponse.json({
        error: `Meta terminó el flujo, pero todavía no confirma coexistencia para este número (is_on_biz_app=${String(selected.is_on_biz_app)}, platform_type=${platformType || "sin valor"}). No uses la verificación/migración estándar; vuelve a completar Embedded Signup de coexistencia.`,
        isOnBizApp: selected.is_on_biz_app ?? null,
        platformType,
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }

    return NextResponse.json({
      ok: true,
      wabaId: configuredWabaId,
      phoneNumberId: selected.id || configuredPhoneNumberId,
      displayPhoneNumber: selected.display_phone_number || null,
      verifiedName: selected.verified_name || null,
      verificationStatus: selected.code_verification_status || null,
      platformType,
      qualityRating: selected.quality_rating || null,
      isOnBizApp,
      usedOfficialEmbeddedSignupEvent: true,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "No se pudo completar Embedded Signup de WhatsApp.",
    }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
