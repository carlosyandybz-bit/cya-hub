import { NextRequest, NextResponse } from "next/server";
import { bearerToken, requireStaff } from "../../../../google-calendar-server";

export const dynamic = "force-dynamic";

const GRAPH_API_ORIGIN = "https://graph.facebook.com";
const META_APP_ID = "1585899772877530";
const META_OAUTH_REDIRECT_URI = "https://app.carlosyandy.com/";
const META_OAUTH_STATE_COOKIE = "cya_wa_oauth_state";

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

function clearOAuthState(response: NextResponse) {
  response.cookies.set(META_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

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
  const version = env("WHATSAPP_GRAPH_API_VERSION") || "v25.0";
  return metaFetch<T>(`${GRAPH_API_ORIGIN}/${version}/${path}`, accessToken, init);
}

async function exchangeEmbeddedSignupCode(code: string) {
  const appSecret = env("WHATSAPP_APP_SECRET");
  if (!appSecret) throw new Error("WHATSAPP_APP_SECRET no está configurado para completar Embedded Signup.");
  const version = env("WHATSAPP_GRAPH_API_VERSION") || "v25.0";
  const query = new URLSearchParams({
    client_id: META_APP_ID,
    client_secret: appSecret,
    code,
    redirect_uri: META_OAUTH_REDIRECT_URI,
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
  const version = env("WHATSAPP_GRAPH_API_VERSION") || "v25.0";
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
      state?: string;
    };

    const code = String(body.code || "").trim();
    const returnedState = String(body.state || "").trim();
    const expectedState = request.cookies.get(META_OAUTH_STATE_COOKIE)?.value || "";

    if (!code) {
      return clearOAuthState(NextResponse.json({
        error: "Meta no devolvió el código de autorización.",
      }, { status: 400, headers: { "cache-control": "no-store" } }));
    }

    if (!returnedState || !expectedState || returnedState !== expectedState || !returnedState.startsWith("cya_wa_")) {
      return clearOAuthState(NextResponse.json({
        error: "La respuesta OAuth de Meta no coincide con la sesión que inició CYA Hub. Vuelve a iniciar la coexistencia.",
      }, { status: 400, headers: { "cache-control": "no-store" } }));
    }

    const permanentToken = env("WHATSAPP_ACCESS_TOKEN");
    if (!permanentToken) throw new Error("WHATSAPP_ACCESS_TOKEN no está configurado.");

    const oauthUserToken = await exchangeEmbeddedSignupCode(code);
    const candidateWabaIds = await discoverWabaIds(oauthUserToken);

    if (candidateWabaIds.length === 0) {
      return clearOAuthState(NextResponse.json({
        error: "Meta completó el OAuth, pero no compartió ninguna cuenta de WhatsApp Business con CYA Hub.",
      }, { status: 409, headers: { "cache-control": "no-store" } }));
    }

    const currentPhoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
    let selectedWabaId = "";
    let selected: PhoneNumber | null = null;
    let fallbackPhones: PhoneNumber[] = [];

    for (const candidateWabaId of candidateWabaIds) {
      try {
        const phones = await loadPhones(candidateWabaId, oauthUserToken);
        if (!fallbackPhones.length && phones.length) fallbackPhones = phones;
        const exact = phones.find((item) => item.id === currentPhoneNumberId);
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
        // Algunos WABA compartidos pueden no exponer teléfonos con el token temporal.
      }
    }

    if (!selectedWabaId) selectedWabaId = candidateWabaIds[0];
    if (!selected && fallbackPhones[0]) selected = fallbackPhones[0];

    await graph<{ success?: boolean }>(
      `${encodeURIComponent(selectedWabaId)}/subscribed_apps`,
      oauthUserToken,
      { method: "POST" },
    );

    return clearOAuthState(NextResponse.json({
      ok: true,
      wabaId: selectedWabaId,
      discoveredWabaIds: candidateWabaIds,
      phoneNumberId: selected?.id || null,
      displayPhoneNumber: selected?.display_phone_number || null,
      verifiedName: selected?.verified_name || null,
      verificationStatus: selected?.code_verification_status || null,
      platformType: selected?.platform_type || null,
      qualityRating: selected?.quality_rating || null,
      currentConfiguredPhoneNumberId: currentPhoneNumberId || null,
      needsPhoneNumberEnvUpdate: Boolean(selected?.id && currentPhoneNumberId && selected.id !== currentPhoneNumberId),
      usedManualOAuth: true,
      redirectUri: META_OAUTH_REDIRECT_URI,
    }, { headers: { "cache-control": "no-store" } }));
  } catch (error) {
    return clearOAuthState(NextResponse.json({
      error: error instanceof Error ? error.message : "No se pudo completar Embedded Signup de WhatsApp.",
    }, { status: 400, headers: { "cache-control": "no-store" } }));
  }
}
