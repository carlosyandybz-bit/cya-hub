import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.112.2";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8", "cache-control": "no-store, max-age=0" },
  });
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

function normalizedEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function findAuthUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user) => normalizedEmail(user.email) === email);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
  throw new Error("No se pudo completar la búsqueda de usuarios.");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")?.trim();
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
    if (!url || !anonKey) return json({ error: "La invitación de profesores no está configurada." }, 503);

    const authorization = request.headers.get("authorization")?.trim() ?? "";
    if (!authorization.toLowerCase().startsWith("bearer ")) return json({ error: "Inicia sesión para continuar." }, 401);

    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: callerData, error: callerError } = await caller.auth.getUser();
    if (callerError || !callerData.user) return json({ error: "La sesión no es válida." }, 401);

    const { data: roleRows, error: roleError } = await caller
      .from("app_member_roles")
      .select("role")
      .eq("user_id", callerData.user.id)
      .eq("role", "admin")
      .eq("active", true)
      .limit(1);
    if (roleError || !roleRows?.length) return json({ error: "Solo un administrador puede dar de alta profesores." }, 403);

    const payload = await request.json().catch(() => ({})) as { email?: unknown; full_name?: unknown };
    const email = normalizedEmail(payload.email);
    const fullName = String(payload.full_name ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
    if (!validEmail(email)) return json({ error: "Escribe un email válido." }, 400);
    if (!fullName) return json({ error: "Escribe el nombre del profesor." }, 400);

    const admin = createClient(url, secretKeyFromEnvironment(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: people, error: peopleError } = await admin
      .from("people")
      .select("id,auth_user_id,display_name,email")
      .eq("active", true)
      .not("email", "is", null)
      .limit(5000);
    if (peopleError) throw peopleError;
    const canonicalMatches = (people ?? []).filter((person) => normalizedEmail(person.email) === email);
    if (canonicalMatches.length > 1) {
      return json({ error: "Ese email coincide con varias fichas. Resuelve primero la identidad duplicada en Alumnado." }, 409);
    }

    let authUser = await findAuthUserByEmail(admin, email);
    const canonical = canonicalMatches[0] ?? null;
    if (canonical?.auth_user_id && authUser && canonical.auth_user_id !== authUser.id) {
      return json({ error: "La ficha y la cuenta asociadas a ese email no coinciden. Revisa la identidad antes de continuar." }, 409);
    }

    let invited = false;
    if (!authUser) {
      const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
      });
      if (inviteError) throw inviteError;
      if (!invitation.user) throw new Error("Supabase no devolvió el usuario invitado.");
      authUser = invitation.user;
      invited = true;
    }

    if (canonical?.auth_user_id && canonical.auth_user_id !== authUser.id) {
      return json({ error: "Ese email ya está vinculado a otra cuenta. Revisa la ficha antes de continuar." }, 409);
    }

    const { data: currentMember, error: memberReadError } = await admin
      .from("app_members")
      .select("role")
      .eq("user_id", authUser.id)
      .maybeSingle();
    if (memberReadError) throw memberReadError;
    const primaryRole = ["admin", "teacher_admin"].includes(String(currentMember?.role ?? "")) ? currentMember!.role : "teacher";

    const { error: memberError } = await admin.from("app_members").upsert({
      user_id: authUser.id,
      role: primaryRole,
      active: true,
    }, { onConflict: "user_id" });
    if (memberError) throw memberError;

    const { error: teacherRoleError } = await admin.from("app_member_roles").upsert({
      user_id: authUser.id,
      role: "teacher",
      active: true,
      granted_by: callerData.user.id,
    }, { onConflict: "user_id,role" });
    if (teacherRoleError) throw teacherRoleError;

    const { error: profileError } = await admin.from("user_profiles").upsert({
      id: authUser.id,
      display_name: fullName,
    }, { onConflict: "id" });
    if (profileError) throw profileError;

    const { error: auditError } = await admin.from("audit_events").insert({
      event_type: invited ? "teacher_invited" : "teacher_role_enabled",
      entity_type: "auth_user",
      entity_id: authUser.id,
      summary: invited ? `Profesor invitado: ${fullName}` : `Profesor habilitado: ${fullName}`,
      detail: { email, canonical_person_id: canonical?.id ?? null },
      actor_user_id: callerData.user.id,
    });
    if (auditError) throw auditError;

    return json({
      ok: true,
      invited,
      user_id: authUser.id,
      canonical_person_id: canonical?.id ?? null,
      message: invited ? `Invitación enviada a ${email}.` : `${fullName} ya tenía cuenta y ahora tiene acceso de profesor.`,
    });
  } catch (error) {
    console.error("invite-teacher", error);
    return json({ error: error instanceof Error ? error.message : "No se pudo dar de alta al profesor." }, 500);
  }
});
