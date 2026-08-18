import { NextRequest, NextResponse } from "next/server";
import { bearerToken, requireStaff } from "../../../../google-calendar-server";

export const dynamic = "force-dynamic";

const GRAPH_API_ORIGIN = "https://graph.facebook.com";
const META_APP_ID = "1585899772877530";

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

type OAuthTokenResponse = MetaError & {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

type DebugTokenResponse = MetaError & {
  data?: {
    is_valid?: boolean;
    app_id?: string;
    scopes?: string[];
    granular_scopes?: Array<{
      scope?: string;
      target_ids?: string[];
    }>;
  };
};

async function metaFetch<T>(url: string, accessToken?: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
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
  const version = env("WHATSAPP_GRAPH_API_VERSION") || "v26.0";
  return metaFetch<T>(`${GRAPH_API_ORIGIN}/${version}/${path}`, accessToken, init);
}

async function exchangeEmbeddedSignupCode(code: string) {
  const appSecret = env("WHATSAPP_APP_SECRET");
  if (!appSecret) throw new Error("WHATSAPP_APP_SECRET no está configurado para completar Embedded Signup.");
  const version = env("WHATSAPP_GRAPH_API_VERSION") || "v26.0";

  // Facebook Login for Business + Embedded Signup genera el authorization code desde
  // FB.login(). En este flujo Meta gestiona internamente el redirect del popup. Reenviar
  // una redirect_uri inventada o forzada durante el intercambio provoca el error
  // "redirect_uri is identical to the one you used in the OAuth dialog request".
  // El intercambio del code se hace únicamente con app id, app secret y code.
  const query = new URLSearchParams({
    client_id: META_APP_ID,
    client_secret: appSecret,
    code,
  });
  const payload = await metaFetch<OAuthTokenResponse>(
    `${GRAPH_API_ORIGIN}/${version}/oauth/access_token?${query.toString()}`,
  );
  if (!payload?.access_token) throw new Error("Meta no devolvió un token al intercambiar el código de Embedded Signup.");
  return payload.access_token;
}

async function discoverWabaIds(oauthUserToken: string) {
  const systemUserToken = env("WHATSAPP_ACCESS_TOKEN");
  if (!systemUserToken) throw new Error("WHATSAPP_ACCESS_TOKEN no está configurado.");
  const version = env("WHATSAPP_GRAPH_API_VERSION") || "v26.0";
  const query = new URLSearchParams({ input_token: oauthUserToken });
  const debug = await metaFetch<DebugTokenResponse>(
    `${GRAPH_API_ORIGIN}/${version}/debug_token?${query.toString()}`,
    systemUserToken,
  );
  if (!debug?.data?.is_valid) throw new Error("Meta devolvió un token de Embedded Signup no válido.");
  if (debug.data.app_id && debug.data.app_id !== META_APP_ID) {
    throw new Error("El token de Embedded Signup pertenece a otra aplicación de Meta.");
  }
  const ids = new Set<string>();
  for (const scope of debug.data.granular_scopes ?? []) {
    if (scope.scope !== "whatsapp_business_management") continue;
    for (const id of scope.target_ids ?? []) {
      const normalized = String(id).replace(/\D/g, "");
      if (normalized) ids.add(normalized);
    }
  }
  return [...ids];
}

async function loadPhones(wabaId: string, accessToken: string) {
  const phones = await graph<{ data?: PhoneNumber[] }>(
    `${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,platform_type,quality_rating`,
    accessToken,
  );
  return Array.isArray(phones?.data) ? phones.data : [];
}

export async function POST(request: NextRequest) {
  try {
    await requireStaff(bearerToken(request));
    const body = await request.json().catch(() => ({})) as {
      code?: string;
      wabaId?: string;
      phoneNumberId?: string;
      event?: string;
    };

    const code = String(body.code || "").trim();
    const hintedWabaId = String(body.wabaId || "").replace(/\D/g, "");
    const hintedPhoneNumberId = String(body.phoneNumberId || "").replace(/\D/g, "");
    const permanentToken = env("WHATSAPP_ACCESS_TOKEN");
    if (!permanentToken) throw new Error("WHATSAPP_ACCESS_TOKEN no está configurado.");

    const oauthUserToken = code ? await exchangeEmbeddedSignupCode(code) : "";
    const discoveredWabaIds = oauthUserToken ? await discoverWabaIds(oauthUserToken) : [];
    const candidateWabaIds = [...new Set([hintedWabaId, ...discoveredWabaIds].filter(Boolean))];

    if (candidateWabaIds.length === 0) {
      return NextResponse.json({
        error: "Meta autorizó Facebook Login, pero no compartió ninguna cuenta de WhatsApp Business con este ajuste. Revisa que el flujo de coexistencia llegue a seleccionar el número de WhatsApp Business.",
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }

    const lookupToken = oauthUserToken || permanentToken;
    const currentPhoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
    let selectedWabaId = "";
    let selected: PhoneNumber | null = null;
    let fallbackPhones: PhoneNumber[] = [];

    for (const candidateWabaId of candidateWabaIds) {
      try {
        const phones = await loadPhones(candidateWabaId, lookupToken);
        if (!fallbackPhones.length && phones.length) fallbackPhones = phones;
        const exact = phones.find((item) => item.id === hintedPhoneNumberId)
          || phones.find((item) => item.id === currentPhoneNumberId);
        if (exact) {
          selectedWabaId = candidateWabaId;
          selected = exact;
          break;
        }
        if (!selected && phones[0]) {
          selectedWabaId = candidateWabaId;
          selected = phones[0];
        }
      } catch {
        // Algunos WABA compartidos pueden no estar accesibles con el token temporal;
        // seguimos probando el resto de IDs devueltos por Meta.
      }
    }

    if (!selectedWabaId) selectedWabaId = candidateWabaIds[0];
    if (!selected && fallbackPhones[0]) selected = fallbackPhones[0];

    // La suscripción puede realizarse con el token de usuario devuelto por Embedded Signup.
    // Así no dependemos de que el system user permanente ya esté asignado al WABA nuevo.
    await graph<{ success?: boolean }>(
      `${encodeURIComponent(selectedWabaId)}/subscribed_apps`,
      lookupToken,
      { method: "POST" },
    );

    return NextResponse.json({
      ok: true,
      wabaId: selectedWabaId,
      discoveredWabaIds: candidateWabaIds,
      phoneNumberId: selected?.id || hintedPhoneNumberId || null,
      displayPhoneNumber: selected?.display_phone_number || null,
      verifiedName: selected?.verified_name || null,
      verificationStatus: selected?.code_verification_status || null,
      platformType: selected?.platform_type || null,
      qualityRating: selected?.quality_rating || null,
      currentConfiguredPhoneNumberId: currentPhoneNumberId || null,
      needsPhoneNumberEnvUpdate: Boolean(selected?.id && currentPhoneNumberId && selected.id !== currentPhoneNumberId),
      usedOAuthCode: Boolean(code),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "No se pudo completar Embedded Signup de WhatsApp.",
    }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
