import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import {
  CORE01_CANONICAL_PATH_RE,
  CORE01_REPOSITORY,
  CORE01_SHA_RE,
} from "./core01-schema.mjs";

function authoringSnapshot(record) {
  return {
    path: record?.path,
    migration_version: record?.migration_version,
    operational_class: record?.operational_class,
    owner: record?.provenance?.owner,
    func_id: record?.provenance?.func_id,
    authorship: record?.provenance?.authorship,
    intended_targets: record?.provenance?.intended_targets,
    recovery: record?.provenance?.recovery,
  };
}

export function validateAuthoringPreservation(previousRegistry, currentRegistry) {
  const errors = [];
  const previous = new Map((previousRegistry?.migrations ?? []).map((record) => [record.path, record]));
  for (const current of currentRegistry?.migrations ?? []) {
    const before = previous.get(current.path);
    if (!before) continue;
    const transition = before.applied_state === "PREPARADA_NO_APLICADA" && current.applied_state === "APLICADA";
    const alreadyApplied = before.applied_state === "APLICADA";
    if ((transition || alreadyApplied) && !isDeepStrictEqual(authoringSnapshot(before), authoringSnapshot(current))) {
      errors.push(`${current.path}: los campos AUTHORING son inmutables durante/después de la promoción a APPLIED.`);
    }
    if (alreadyApplied) {
      const oldEvidence = before?.provenance?.application_evidence ?? [];
      const newEvidence = current?.provenance?.application_evidence ?? [];
      if (newEvidence.length < oldEvidence.length || !isDeepStrictEqual(newEvidence.slice(0, oldEvidence.length), oldEvidence)) {
        errors.push(`${current.path}: application_evidence ya certificada es inmutable; solo se permite añadir evidencia nueva al final.`);
      }
    }
    if (transition) {
      if (before?.provenance?.lifecycle_phase !== "AUTHORING" || before?.provenance?.application_evidence !== null) {
        errors.push(`${current.path}: la promoción debe partir de AUTHORING/PREPARADA_NO_APLICADA sin evidence futura.`);
      }
      if (current?.provenance?.lifecycle_phase !== "APPLIED") errors.push(`${current.path}: la promoción a APLICADA exige lifecycle APPLIED.`);
    } else if (before.applied_state !== current.applied_state) {
      errors.push(`${current.path}: transición de applied_state no permitida (${before.applied_state} -> ${current.applied_state}).`);
    }
  }
  return errors;
}

export function gitCommitExists(sha, cwd = process.cwd()) {
  if (!CORE01_SHA_RE.test(sha ?? "")) return false;
  try { execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd, stdio: "ignore" }); return true; }
  catch { return false; }
}

export function gitCommitContainsPath(sha, path, cwd = process.cwd()) {
  if (!CORE01_SHA_RE.test(sha ?? "") || !CORE01_CANONICAL_PATH_RE.test(path ?? "")) return false;
  try { execFileSync("git", ["cat-file", "-e", `${sha}:${path}`], { cwd, stdio: "ignore" }); return true; }
  catch { return false; }
}

export function parseAuthorizedTargets(raw) {
  let value;
  try { value = JSON.parse(raw || "[]"); }
  catch { throw new Error("CORE01_AUTHORIZED_TARGETS_JSON no contiene JSON válido."); }
  if (!Array.isArray(value)) throw new Error("CORE01_AUTHORIZED_TARGETS_JSON debe ser un array.");
  return value;
}

export function loadGitHubAuthoringContext({ env = process.env, readJsonFile } = {}) {
  const read = readJsonFile ?? ((path) => JSON.parse(readFileSync(path, "utf8")));
  let event = null;
  if (env.GITHUB_EVENT_PATH) {
    try { event = read(env.GITHUB_EVENT_PATH); }
    catch (error) { throw new Error(`No se pudo leer GITHUB_EVENT_PATH: ${error.message}`); }
  }
  const pull = event?.pull_request ?? null;
  return {
    repository: env.GITHUB_REPOSITORY ?? null,
    eventName: env.GITHUB_EVENT_NAME ?? null,
    prNumber: pull?.number ?? event?.number ?? null,
    prBaseSha: pull?.base?.sha ?? null,
    prHeadSha: pull?.head?.sha ?? null,
    authorizedTargets: parseAuthorizedTargets(env.CORE01_AUTHORIZED_TARGETS_JSON),
    githubToken: env.GITHUB_TOKEN ?? null,
    githubApiUrl: env.GITHUB_API_URL ?? "https://api.github.com",
  };
}

export function validateAuthoringContext(record, context, { commitExists, isNewMigration = false } = {}) {
  const errors = [];
  const path = record?.path ?? "<sin path>";
  const authorship = record?.provenance?.authorship ?? {};
  if (!context?.repository || authorship.repository !== context.repository || context.repository !== CORE01_REPOSITORY) {
    errors.push(`${path}: authorship.repository no coincide con el repositorio real del workflow (${context?.repository}).`);
  }
  if (typeof authorship.base_sha === "string" && !commitExists(authorship.base_sha)) {
    errors.push(`${path}: authorship.base_sha ${authorship.base_sha} no existe como commit Git corroborable.`);
  }
  if (isNewMigration && context?.eventName === "pull_request") {
    if (authorship.pr_number !== context.prNumber) errors.push(`${path}: authorship.pr_number=${authorship.pr_number} no coincide con el PR real #${context.prNumber}.`);
    if (authorship.base_sha !== context.prBaseSha) errors.push(`${path}: authorship.base_sha no coincide con la base SHA real del PR (${context.prBaseSha}).`);
  }
  const allowed = new Set((context?.authorizedTargets ?? []).map((target) => `${target.environment}:${target.project_ref}`));
  for (const target of record?.provenance?.intended_targets ?? []) {
    const key = `${target.environment}:${target.project_ref}`;
    if (!allowed.has(key)) errors.push(`${path}: intended target ${key} no está autorizado/corroborado por la configuración CI del entorno.`);
  }
  return errors;
}
