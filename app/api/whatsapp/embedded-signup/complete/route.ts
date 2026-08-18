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
      accessToken?: string;
      code?: string;
      wabaId?: string;
      phoneNumberId?: string;
      event?: string;
    };

    const oauthUserToken = String(body.accessToken || "").trim();
    const hintedWabaId = String(body.wabaId || "").replace(/\D/g, "");
    const hintedPhoneNumberId = String(body.phoneNumberId || "").replace(/\D/g, "");
    const permanentToken = env("WHATSAPP_ACCESS_TOKEN");
    if (!permanentToken) throw new Error("WHATSAPP_ACCESS_TOKEN no está configurado.");

    // La vía principal ya no intercambia authorization codes. El JavaScript SDK de Meta
    // entrega un access token de usuario de corta duración y lo usamos directamente para
    // descubrir los WABA compartidos. Así eliminamos por completo el punto que producía
    // el error 36008 por discrepancias de redirect_uri.
    const discoveredWabaIds = oauthUserToken ? await discoverWabaIds(oauthUserToken) : [];
    const candidateWabaIds = [...new Set([hintedWabaId, ...discoveredWabaIds].filter(Boolean))];

    if (candidateWabaIds.length === 0) {
      const legacyCode = String(body.code || "").trim();
      return NextResponse.json({
        error: legacyCode
          ? "Meta devolvió un código OAuth pero no un access token utilizable. CYA ya no intercambia ese código para evitar el error de redirect_uri; vuelve a iniciar la coexistencia después del nuevo despliegue."
          : "Meta terminó el diálogo, pero no devolvió ningún WABA compartido ni access token utilizable.",
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
      usedAccessToken: Boolean(oauthUserToken),
      usedOAuthCode: false,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "No se pudo completar Embedded Signup de WhatsApp.",
    }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
