import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { bearerToken, requireStaff } from "../../../../google-calendar-server";

export const dynamic = "force-dynamic";

const META_APP_ID = "1585899772877530";
const META_CONFIG_ID = "886780604243575";
const META_OAUTH_REDIRECT_URI = "https://app.carlosyandy.com/";
const META_OAUTH_STATE_COOKIE = "cya_wa_oauth_state";

export async function POST(request: NextRequest) {
  try {
    await requireStaff(bearerToken(request));

    const state = `cya_wa_${randomBytes(24).toString("hex")}`;
    const authUrl = new URL("https://www.facebook.com/v25.0/dialog/oauth");
    authUrl.searchParams.set("client_id", META_APP_ID);
    authUrl.searchParams.set("redirect_uri", META_OAUTH_REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("config_id", META_CONFIG_ID);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("override_default_response_type", "true");
    authUrl.searchParams.set("auth_type", "rerequest");
    authUrl.searchParams.set("display", "popup");
    authUrl.searchParams.set("extras", JSON.stringify({
      setup: {},
      featureType: "whatsapp_business_app_onboarding",
      sessionInfoVersion: "3",
    }));

    const response = NextResponse.json({
      ok: true,
      authUrl: authUrl.toString(),
      redirectUri: META_OAUTH_REDIRECT_URI,
    }, { headers: { "cache-control": "no-store" } });

    response.cookies.set(META_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });

    return response;
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "No se pudo iniciar la autorización manual de Meta.",
    }, { status: 403, headers: { "cache-control": "no-store" } });
  }
}
