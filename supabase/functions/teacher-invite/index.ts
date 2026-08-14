import { createClient, type User } from "npm:@supabase/supabase-js@2.112.2";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function publishableKeyFromEnvironment() {
  const modern = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (modern) {
    const parsed = JSON.parse(modern) as Record<string, string>;
    if (parsed.default) return parsed.default;
    const first = Object.values(parsed)[0];
    if (first) return first;
  }
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) return legacy;
  throw new Error("Supabase publishable key is unavailable");
}

function secretKeyFromEnvironment() {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    const parsed = JSON.parse(modern) as Record<string, string>;
    if (parsed.default) return parsed.default;
    const first = Object.values(parsed)[0];
    if (first) return first;
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("Supabase secret key is unavailable");
}

async function findUserByEmail(admin: ReturnType<typeof createClient>, email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.trim().toLowerCase() === normalized);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
  throw new Error("Auth user lookup exceeded the safe page limit");
}

type InviteBody = {
  first_name?: unknown;
  last_name?: unknown;
  email?: unknown;
  phone?: unknown;
  country_code?: unknown;
};

type Preflight = {
  first_name: string;
  last_name: string | null;
  display_name: string;
  email: string;
  phone: string | null;
  country_code: string | null;
  person_id: number | null;
  auth_user_id: string | null;
  reused_person: boolean;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ ok: false, error: "Método no permitido." }, 405);

  try {
    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return json({ ok: false, error: "Inicia sesión para continuar." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) throw new Error("Supabase URL is unavailable");

    const body = await request.json() as InviteBody;
    const payload = {
      p_first_name: String(body.first_name ?? "").trim(),
      p_last_name: String(body.last_name ?? "").trim() || null,
      p_email: String(body.email ?? "").trim() || null,
      p_phone: String(body.phone ?? "").trim() || null,
      p_country_code: String(body.country_code ?? "").trim() || null,
    };

    const caller = createClient(supabaseUrl, publishableKeyFromEnvironment(), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    });

    // La sesión real del administrador valida permisos y P19 antes de tocar Auth.
    const preflightResult = await caller.rpc("admin_teacher_invite_preflight", payload);
    if (preflightResult.error) return json({ ok: false, error: preflightResult.error.message });
    const preflight = preflightResult.data as Preflight;

    const admin = createClient(supabaseUrl, secretKeyFromEnvironment(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let user: User | null = null;
    if (preflight.auth_user_id) {
      const existing = await admin.auth.admin.getUserById(preflight.auth_user_id);
      if (existing.error) throw existing.error;
      user = existing.data.user;
      if (user.email?.trim().toLowerCase() !== preflight.email) {
        return json({ ok: false, error: "La ficha encontrada está vinculada a otra cuenta de acceso." });
      }
    } else {
      user = await findUserByEmail(admin, preflight.email);
    }

    let invitationSent = false;
    if (!user) {
      const invited = await admin.auth.admin.inviteUserByEmail(preflight.email, {
        data: { full_name: preflight.display_name, cya_invited_role: "teacher" },
      });
      if (invited.error || !invited.data.user) throw invited.error ?? new Error("Invite did not return a user");
      user = invited.data.user;
      invitationSent = true;
    }

    const finalize = await caller.rpc("admin_finalize_teacher_invite", {
      p_auth_user_id: user.id,
      p_first_name: preflight.first_name,
      p_last_name: preflight.last_name,
      p_email: preflight.email,
      p_phone: preflight.phone,
      p_country_code: preflight.country_code,
    });
    if (finalize.error) {
      // Si esta operación acaba de crear la cuenta Auth, no dejamos una invitación
      // parcialmente provisionada que pueda entrar solo como alumno.
      if (invitationSent) {
        try {
          const cleanup = await admin.auth.admin.deleteUser(user.id);
          if (cleanup.error) console.error("teacher-invite auth rollback failed", cleanup.error);
        } catch (cleanupError) {
          console.error("teacher-invite auth rollback failed", cleanupError);
        }
      }
      return json({ ok: false, error: finalize.error.message, invitation_sent: invitationSent });
    }

    return json({
      ok: true,
      invitation_sent: invitationSent,
      account_reused: !invitationSent,
      person_reused: preflight.reused_person,
      teacher: finalize.data,
      message: invitationSent
        ? `Invitación enviada a ${preflight.email}.`
        : "La cuenta ya existía y se ha activado como profesor.",
    });
  } catch (error) {
    console.error("teacher-invite failed", error);
    return json({ ok: false, error: "No se pudo añadir el profesor. Inténtalo de nuevo." }, 500);
  }
});
