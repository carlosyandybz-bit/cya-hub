#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "STAGING_ONLY.manifest.json");
const STAGING_REF = "qlngfkzmncihtdzktcmd";
const PRODUCTION_REF = "ldvyeyhzrepaaouzavgs";

function fail(message) {
  console.error(`\n[CYA environment boundary] ${message}\n`);
  process.exit(1);
}

function readManifest() {
  if (!fs.existsSync(manifestPath)) {
    fail("Falta STAGING_ONLY.manifest.json. No se puede demostrar el aislamiento del laboratorio.");
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.stagingSupabaseProjectRef !== STAGING_REF || manifest.productionSupabaseProjectRef !== PRODUCTION_REF) {
    fail("El manifiesto contiene project refs de Supabase inesperados.");
  }
  if (!Array.isArray(manifest.resources) || manifest.resources.length === 0) {
    fail("El manifiesto STAGING_ONLY no declara recursos protegidos.");
  }
  return manifest;
}

function supabaseProjectRef(rawUrl) {
  if (!rawUrl) return "";
  try {
    const hostname = new URL(rawUrl).hostname;
    const match = hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return match?.[1] ?? "";
  } catch {
    fail("NEXT_PUBLIC_SUPABASE_URL no es una URL válida.");
  }
}

function resolveDeployEnvironment(projectRef) {
  const explicit = (process.env.CYA_DEPLOY_ENV ?? "").trim().toLowerCase();
  if (explicit && !["staging", "production"].includes(explicit)) {
    fail("CYA_DEPLOY_ENV solo puede ser staging o production.");
  }
  if (explicit === "staging" && projectRef && projectRef !== STAGING_REF) {
    fail(`CYA_DEPLOY_ENV=staging pero Supabase apunta a ${projectRef}.`);
  }
  if (explicit === "production" && projectRef && projectRef !== PRODUCTION_REF) {
    fail(`CYA_DEPLOY_ENV=production pero Supabase apunta a ${projectRef}.`);
  }
  if (explicit) return explicit;
  if (projectRef === STAGING_REF) return "staging";
  if (projectRef === PRODUCTION_REF) return "production";
  return "unknown";
}

function existingProtectedResources(manifest) {
  return manifest.resources.filter((resource) => fs.existsSync(path.join(root, resource)));
}

function scanForbiddenImports() {
  const roots = ["app", "components", "lib", "src"].map((value) => path.join(root, value));
  const extensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);
  const matches = [];
  const forbidden = ["staging-lab", "/qa/", "cya-hub-qa"];

  function walk(current) {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", ".next"].includes(entry.name)) continue;
        walk(absolute);
        continue;
      }
      if (!extensions.has(path.extname(entry.name))) continue;
      const relative = path.relative(root, absolute).replaceAll("\\", "/");
      if (relative.startsWith("app/staging-lab/")) continue;
      const text = fs.readFileSync(absolute, "utf8");
      for (const marker of forbidden) {
        if (text.includes(marker)) matches.push(`${relative} -> ${marker}`);
      }
    }
  }

  roots.forEach(walk);
  return matches;
}

const manifest = readManifest();
const projectRef = supabaseProjectRef(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "");
const environment = resolveDeployEnvironment(projectRef);
const protectedResources = existingProtectedResources(manifest);
const forbiddenImports = scanForbiddenImports();

if (environment === "unknown") {
  const allowLocal = process.env.CYA_ALLOW_UNVERIFIED_LOCAL_BUILD === "1" && process.env.CI !== "true";
  if (!allowLocal) {
    fail("No se puede verificar el entorno. Define NEXT_PUBLIC_SUPABASE_URL con el proyecto staging/production correcto o usa CYA_ALLOW_UNVERIFIED_LOCAL_BUILD=1 únicamente para un build local no CI.");
  }
  console.warn("[CYA environment boundary] Build local no verificado permitido explícitamente.");
  process.exit(0);
}

if (environment === "production") {
  if (protectedResources.length > 0) {
    fail(`BUILD BLOQUEADO: infraestructura STAGING_ONLY detectada en producción:\n- ${protectedResources.join("\n- ")}`);
  }
  if (forbiddenImports.length > 0) {
    fail(`BUILD BLOQUEADO: imports/referencias a infraestructura interna detectados:\n- ${forbiddenImports.join("\n- ")}`);
  }
  console.log("[CYA environment boundary] Producción limpia: no se detectó infraestructura STAGING_ONLY.");
  process.exit(0);
}

if (projectRef !== STAGING_REF) {
  fail("El build de staging no está conectado al Supabase dedicado de staging.");
}

const branch = (process.env.GITHUB_REF_NAME ?? process.env.CF_PAGES_BRANCH ?? "").trim();
if (branch && branch !== "staging") {
  fail(`El entorno staging se está compilando desde una rama inesperada: ${branch}.`);
}

console.log(`[CYA environment boundary] Staging verificado contra ${STAGING_REF}. Recursos protegidos: ${protectedResources.length}.`);
