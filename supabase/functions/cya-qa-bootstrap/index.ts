import { createClient, type User } from "npm:@supabase/supabase-js@2.112.2";

const EXPECTED_ISSUER = "https://token.actions.githubusercontent.com";
const EXPECTED_AUDIENCE = "cya-hub-qa";
const EXPECTED_REPOSITORY = "carlosyandybz-bit/cya-hub";
const EXPECTED_REPOSITORY_ID = "1328286685";
const EXPECTED_WORKFLOW_PREFIX = `${EXPECTED_REPOSITORY}/.github/workflows/cya-qa-e2e.yml@`;
const GITHUB_JWKS_URL = "https://token.actions.githubusercontent.com/.well-known/jwks";

type GitHubClaims = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  repository?: string;
  repository_id?: string;
  repository_visibility?: string;
  workflow_ref?: string;
  runner_environment?: string;
  event_name?: string;
  run_id?: string;
};

type Fixture = {
  role: "teacher" | "student" | "admin";
  email: string;
  displayName: string;
  primaryRole: "teacher" | "student" | "admin";
  roles: Array<"admin" | "teacher" | "student">;
};

const fixtures: Fixture[] = [
  {
    role: "teacher",
    email: "carlosyandybz+qa-teacher@gmail.com",
    displayName: "QA · Profesor",
    primaryRole: "teacher",
    roles: ["teacher", "student"],
  },
  {
    role: "student",
    email: "carlosyandybz+qa-student@gmail.com",
    displayName: "QA · Alumno",
    primaryRole: "student",
    roles: ["student"],
  },
  {
    role: "admin",
    email: "carlosyandybz+qa-admin@gmail.com",
    displayName: "QA · Administrador",
    primaryRole: "admin",
    roles: ["admin", "teacher", "student"],
  },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJsonSegment<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

async function verifyGitHubOidc(token: string): Promise<GitHubClaims> {
  const segments = token.split(".");
  if (segments.length !== 3) throw new Error("Malformed OIDC token");

  const header = decodeJsonSegment<{ alg?: string; kid?: string }>(segments[0]);
  const claims = decodeJsonSegment<GitHubClaims>(segments[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported OIDC signing key");

  const jwksResponse = await fetch(GITHUB_JWKS_URL, {
    headers: { accept: "application/json" },
  });
  if (!jwksResponse.ok) throw new Error("Unable to load GitHub OIDC signing keys");
  const jwks = await jwksResponse.json() as { keys?: JsonWebKey[] };
  const jwk = jwks.keys?.find((candidate) => candidate.kid === header.kid);
  if (!jwk) throw new Error("Unknown GitHub OIDC signing key");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signedBytes = new TextEncoder().encode(`${segments[0]}.${segments[1]}`);
  const signature = decodeBase64Url(segments[2]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signedBytes);
  if (!valid) throw new Error("Invalid GitHub OIDC signature");

  const now = Math.floor(Date.now() / 1000);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const eventAllowed = ["push", "pull_request", "workflow_dispatch"].includes(claims.event_name ?? "");

  if (claims.iss !== EXPECTED_ISSUER) throw new Error("Unexpected OIDC issuer");
  if (!audience.includes(EXPECTED_AUDIENCE)) throw new Error("Unexpected OIDC audience");
  if (!claims.exp || claims.exp <= now) throw new Error("Expired OIDC token");
  if (claims.nbf && claims.nbf > now + 30) throw new Error("OIDC token is not active yet");
  if (claims.repository !== EXPECTED_REPOSITORY || claims.repository_id !== EXPECTED_REPOSITORY_ID) {
    throw new Error("OIDC token belongs to another repository");
  }
  if (claims.repository_visibility !== "private") throw new Error("QA bootstrap requires the private repository");
  if (!claims.workflow_ref?.startsWith(EXPECTED_WORKFLOW_PREFIX)) throw new Error("OIDC token belongs to another workflow");
  if (claims.runner_environment !== "github-hosted") throw new Error("QA bootstrap requires a GitHub-hosted runner");
  if (!eventAllowed) throw new Error("Unsupported workflow event");

  return claims;
}

function makePassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(30));
  const binary = String.fromCharCode(...bytes);
  const token = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `CyaQA!${token}`;
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
  const normalized = email.toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === normalized);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
  throw new Error("Unable to locate QA user within the bounded Auth user scan");
}

async function ensureFixture(admin: ReturnType<typeof createClient>, fixture: Fixture) {
  const password = makePassword();
  let user = await findUserByEmail(admin, fixture.email);

  if (user) {
    const { data, error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fixture.displayName, cya_qa_fixture: true },
      app_metadata: { cya_qa_fixture: true },
    });
    if (error || !data.user) throw error ?? new Error(`Unable to update ${fixture.role} QA user`);
    user = data.user;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: fixture.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fixture.displayName, cya_qa_fixture: true },
      app_metadata: { cya_qa_fixture: true },
    });
    if (error || !data.user) throw error ?? new Error(`Unable to create ${fixture.role} QA user`);
    user = data.user;
  }

  const { error: profileError } = await admin.from("user_profiles").upsert({
    id: user.id,
    display_name: fixture.displayName,
  }, { onConflict: "id" });
  if (profileError) throw profileError;

  const { error: memberError } = await admin.from("app_members").upsert({
    user_id: user.id,
    role: fixture.primaryRole,
    active: true,
  }, { onConflict: "user_id" });
  if (memberError) throw memberError;

  const { error: deactivateError } = await admin.from("app_member_roles")
    .update({ active: false })
    .eq("user_id", user.id);
  if (deactivateError) throw deactivateError;

  const { error: rolesError } = await admin.from("app_member_roles").upsert(
    fixture.roles.map((role) => ({ user_id: user!.id, role, active: true, granted_by: null })),
    { onConflict: "user_id,role" },
  );
  if (rolesError) throw rolesError;

  let { data: person, error: personReadError } = await admin.from("people")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (personReadError) throw personReadError;

  if (!person) {
    const { data, error } = await admin.from("people").insert({
      auth_user_id: user.id,
      display_name: fixture.displayName,
      email: fixture.email,
      crm_stage: "student",
      source: "qa_automation",
      notes: "AUTOMATED QA FIXTURE — do not use for real classes or billing.",
      active: true,
      created_by: user.id,
    }).select("id").single();
    if (error) throw error;
    person = data;
  } else {
    const { error } = await admin.from("people").update({
      display_name: fixture.displayName,
      email: fixture.email,
      crm_stage: "student",
      source: "qa_automation",
      notes: "AUTOMATED QA FIXTURE — do not use for real classes or billing.",
      active: true,
    }).eq("id", person.id);
    if (error) throw error;
  }

  const { error: studentProfileError } = await admin.from("student_profiles").upsert({
    person_id: person.id,
    active: true,
    created_by: user.id,
  }, { onConflict: "person_id" });
  if (studentProfileError) throw studentProfileError;

  return { email: fixture.email, password };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const claims = await verifyGitHubOidc(authorization.slice("Bearer ".length));

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) throw new Error("SUPABASE_URL is unavailable");
    const admin = createClient(supabaseUrl, secretKeyFromEnvironment(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const credentials: Record<string, { email: string; password: string }> = {};
    for (const fixture of fixtures) {
      credentials[fixture.role] = await ensureFixture(admin, fixture);
    }

    return json({ ok: true, run_id: claims.run_id ?? null, credentials });
  } catch (error) {
    const message = error instanceof Error ? error.message : "QA bootstrap failed";
    return json({ error: message }, message.toLowerCase().includes("oidc") || message.includes("repository") || message.includes("workflow") ? 403 : 500);
  }
});
