#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  CORE01_EVIDENCE_FILE,
  CORE01_POST_APPLY_WORKFLOW,
  CORE01_POST_APPLY_WORKFLOW_PATH,
  CORE01_REPOSITORY,
  CORE01_TRUSTED_REF,
  compileJsonSchema,
  evidenceArtifactName,
  safeErrorMessage,
  validateEvidenceArtifactSchema,
} from "./core01-provenance.mjs";
import {
  CORE02_DEPLOYMENT_EVIDENCE_FILE,
  CORE02_DEPLOYMENT_WORKFLOW,
  CORE02_DEPLOYMENT_WORKFLOW_PATH,
  CORE02_STAGING_PROJECT_REF,
  assertCore02TrustedContext,
  core02DeploymentArtifactName,
  validateCore02DeploymentAuthority,
  validateCore02LedgerRow,
  validateCore02SourceData,
} from "./verify-migration-source-data.mjs";

const RECORD_SCHEMA_PATH = "docs/CORE_01_MIGRATION_PROVENANCE.schema.json";
const EVIDENCE_SCHEMA_PATH = "docs/CORE_01_POST_APPLY_EVIDENCE.schema.json";
const DEPLOYMENT_SCHEMA_PATH = "docs/CORE_01_DEPLOYMENT_EVIDENCE.schema.json";
const MAX_ARTIFACT_BYTES = 1024 * 1024;
const MAX_JSON_BYTES = 512 * 1024;

function required(value, label) { if (!value) throw new Error(`${label} es obligatorio.`); return value; }
function githubHeaders(token) { return { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" }; }
async function githubJson(url, token, label) { const response = await fetch(url, { headers: githubHeaders(token) }); if (!response.ok) throw new Error(`${label}: HTTP ${response.status}.`); return response.json(); }
async function githubBytes(url, token, label) { const response = await fetch(url, { headers: githubHeaders(token), redirect: "follow" }); if (!response.ok) throw new Error(`${label}: HTTP ${response.status}.`); const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.byteLength > MAX_ARTIFACT_BYTES) throw new Error(`${label}: artifact excede límite CORE-02.`); return bytes; }
async function githubCommit(sha, token, apiUrl) { return githubJson(`${apiUrl}/repos/${CORE01_REPOSITORY}/commits/${sha}`, token, "source commit no corroborable"); }
async function githubPull(pr, token, apiUrl) { return githubJson(`${apiUrl}/repos/${CORE01_REPOSITORY}/pulls/${pr}`, token, `PR #${pr} no corroborable`); }
async function githubPullFiles(pr, token, apiUrl) { const files=[]; for(let page=1;page<=10;page++){ const batch=await githubJson(`${apiUrl}/repos/${CORE01_REPOSITORY}/pulls/${pr}/files?per_page=100&page=${page}`,token,`archivos PR #${pr} no corroborables`); if(!Array.isArray(batch)) throw new Error("GitHub no devolvió files[] para el PR."); files.push(...batch); if(batch.length<100)return files;} throw new Error("PR excede el límite CORE-02 de 1000 archivos."); }
async function githubContent(path, sha, token, apiUrl) { const encoded=path.split("/").map(encodeURIComponent).join("/"); return githubJson(`${apiUrl}/repos/${CORE01_REPOSITORY}/contents/${encoded}?ref=${encodeURIComponent(sha)}`,token,`${path} no corroborable en source SHA`); }
async function githubRun(runId, token, apiUrl) { return githubJson(`${apiUrl}/repos/${CORE01_REPOSITORY}/actions/runs/${runId}`,token,`deployment run ${runId} no corroborable`); }
async function githubRunArtifacts(runId, token, apiUrl) { const data=await githubJson(`${apiUrl}/repos/${CORE01_REPOSITORY}/actions/runs/${runId}/artifacts?per_page=100`,token,`artifacts de deployment run ${runId} no corroborables`); return data?.artifacts ?? []; }
async function githubArtifactZip(artifactId, token, apiUrl) { return githubBytes(`${apiUrl}/repos/${CORE01_REPOSITORY}/actions/artifacts/${artifactId}/zip`,token,`deployment artifact ${artifactId} no descargable`); }

function checkoutSha(rootDir) { return execFileSync("git",["rev-parse","HEAD"],{cwd:rootDir,encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim(); }
function parseWorkflowAllowlist(raw) { const values=String(required(raw,"CORE01_AUTHORIZED_DEPLOYMENT_WORKFLOW_IDS")).split(",").map(v=>v.trim()); if(values.some(v=>!/^[1-9][0-9]*$/.test(v))) throw new Error("CORE01_AUTHORIZED_DEPLOYMENT_WORKFLOW_IDS debe contener IDs enteros positivos separados por coma."); const ids=values.map(Number); if(ids.some(v=>!Number.isSafeInteger(v)||v<=0)) throw new Error("CORE01_AUTHORIZED_DEPLOYMENT_WORKFLOW_IDS contiene ID inválido."); return new Set(ids); }

function queryLedger(databaseUrl, version) {
  const sql=`select version::text || E'\\t' || name::text from supabase_migrations.schema_migrations where version::text = '${version}' order by version limit 1;`;
  try { const output=execFileSync("psql",["--no-psqlrc","--tuples-only","--no-align","--set=ON_ERROR_STOP=1","--command",sql],{encoding:"utf8",stdio:["ignore","pipe","pipe"],env:{PATH:process.env.PATH??"",HOME:process.env.HOME??"",PGDATABASE:databaseUrl}}).trim(); if(!output)return null; const [versionOut,nameOut]=output.split("\t"); return {version:versionOut,name:nameOut}; }
  catch { throw new Error("No se pudo consultar el ledger STAGING en modo lectura."); }
}

function readSingleJsonZip(zipBytes, expectedName) {
  if (!(zipBytes instanceof Uint8Array) && !Buffer.isBuffer(zipBytes)) throw new Error("Artifact ZIP inválido.");
  const dir=mkdtempSync(join(tmpdir(),"core02-deploy-evidence-")); const zipPath=join(dir,"artifact.zip");
  try {
    writeFileSync(zipPath,zipBytes,{mode:0o600});
    const listing=execFileSync("unzip",["-Z1",zipPath],{encoding:"utf8",maxBuffer:64*1024}).trim().split(/\r?\n/).filter(Boolean);
    if(listing.length!==1||listing[0]!==expectedName) throw new Error(`Artifact ZIP debe contener únicamente ${expectedName}.`);
    const content=execFileSync("unzip",["-p",zipPath,expectedName],{encoding:"utf8",maxBuffer:MAX_JSON_BYTES});
    if(Buffer.byteLength(content,"utf8")>MAX_JSON_BYTES) throw new Error("Artifact JSON excede límite CORE-02.");
    return JSON.parse(content);
  } finally { rmSync(dir,{recursive:true,force:true}); }
}

async function loadDeploymentEvidence(context, token, apiUrl, rootDir) {
  const run=await githubRun(context.deploymentRunId,token,apiUrl);
  const workflowId=Number(run?.workflow_id);
  const runErrors=validateCore02DeploymentAuthority(run, null, context, null);
  if(runErrors.length) throw new Error(runErrors.join(" | "));

  const expectedName=core02DeploymentArtifactName(context.deploymentRunId);
  const artifacts=await githubRunArtifacts(context.deploymentRunId,token,apiUrl);
  const candidates=artifacts.filter(a=>a?.name===expectedName&&a?.expired!==true);
  if(candidates.length!==1) throw new Error(`Se esperaba exactamente un deployment artifact ${expectedName}.`);
  const meta=candidates[0]; if(!Number.isSafeInteger(Number(meta?.id))||Number(meta.id)<=0) throw new Error("Deployment artifact sin ID GitHub válido.");
  if(meta?.workflow_run?.id!=null&&Number(meta.workflow_run.id)!==context.deploymentRunId) throw new Error("Deployment artifact pertenece a otro run.");
  const artifact=readSingleJsonZip(await githubArtifactZip(Number(meta.id),token,apiUrl),CORE02_DEPLOYMENT_EVIDENCE_FILE);
  const schema=JSON.parse(readFileSync(resolve(rootDir,DEPLOYMENT_SCHEMA_PATH),"utf8"));
  const compiled=compileJsonSchema(schema,rootDir);
  const schemaErrors=validateEvidenceArtifactSchema(artifact,schema,rootDir,compiled);
  if(schemaErrors.length) throw new Error(`Deployment evidence inválida: ${schemaErrors.join(" | ")}`);
  if(artifact.artifact_name!==expectedName) throw new Error("Deployment evidence artifact_name incorrecto.");
  const artifactErrors=validateCore02DeploymentAuthority(run, artifact, context, null);
  if(artifactErrors.length) throw new Error(artifactErrors.join(" | "));
  return {run,artifact,workflowId};
}

async function loadSource(rootDir, context, deploymentArtifact, token, apiUrl) {
  const recordSchema=JSON.parse(readFileSync(resolve(rootDir,RECORD_SCHEMA_PATH),"utf8")); const compiled=compileJsonSchema(recordSchema,rootDir);
  const source=await validateCore02SourceData({sourceCommitSha:context.sourceCommitSha,prNumber:context.prNumber,trustedBaseSha:deploymentArtifact.trusted_pipeline_sha,projectRef:CORE02_STAGING_PROJECT_REF,requireCurrentPrBase:false,recordSchema,compiledRecordValidator:compiled,rootDir},{getCommit:sha=>githubCommit(sha,token,apiUrl),getPullRequest:pr=>githubPull(pr,token,apiUrl),listPullRequestFiles:pr=>githubPullFiles(pr,token,apiUrl),getContent:(path,sha)=>githubContent(path,sha,token,apiUrl)});
  const exact = [
    [deploymentArtifact.repository,CORE01_REPOSITORY,"repository"],
    [deploymentArtifact.environment,"staging","environment"],
    [deploymentArtifact.project_ref,CORE02_STAGING_PROJECT_REF,"project_ref"],
    [deploymentArtifact.pr_number,source.prNumber,"pr_number"],
    [deploymentArtifact.source_commit_sha,source.sourceCommitSha,"source_commit_sha"],
    [deploymentArtifact.migration_path,source.migrationPath,"migration_path"],
    [deploymentArtifact.migration_version,source.migrationVersion,"migration_version"],
    [deploymentArtifact.migration_name,source.migrationName,"migration_name"],
    [deploymentArtifact.source_blob_sha,source.sourceBlobSha,"source_blob_sha"],
    [deploymentArtifact.source_sha256,source.sourceSha256,"source_sha256"],
  ];
  for(const [actual,expected,label] of exact) if(actual!==expected) throw new Error(`Deployment evidence ${label} no coincide con source data corroborada.`);
  return source;
}

async function preflight(rootDir,context,token,apiUrl){
  if(checkoutSha(rootDir)!==context.trustedPipelineSha) throw new Error("Checkout verifier no coincide con GITHUB_SHA/GITHUB_WORKFLOW_SHA.");
  const deployment=await loadDeploymentEvidence(context,token,apiUrl,rootDir);
  const source=await loadSource(rootDir,context,deployment.artifact,token,apiUrl);
  console.log(`CORE-02 POST-APPLY PREFLIGHT: PASS ${source.migrationPath}`);
  console.log(`Deployment run: ${context.deploymentRunId}; source PR #${source.prNumber}`);
  return {deployment,source};
}

async function verify(rootDir,context,token,apiUrl){
  const {deployment,source}=await preflight(rootDir,context,token,apiUrl);
  const allowlist=parseWorkflowAllowlist(process.env.CORE01_AUTHORIZED_DEPLOYMENT_WORKFLOW_IDS);
  if(!allowlist.has(deployment.workflowId)) throw new Error(`workflow_id ${deployment.workflowId} no está autorizado por Release.`);
  const databaseUrl=required(process.env.CORE01_STAGING_LEDGER_DATABASE_URL,"CORE01_STAGING_LEDGER_DATABASE_URL");
  const ledger=queryLedger(databaseUrl,source.migrationVersion);
  validateCore02LedgerRow(ledger, source);
  if(deployment.artifact.ledger.version!==ledger.version||deployment.artifact.ledger.name!==ledger.name) throw new Error("Ledger actual no coincide con deployment evidence.");

  const verificationRunIdText=required(process.env.GITHUB_RUN_ID,"GITHUB_RUN_ID"); if(!/^[1-9][0-9]*$/.test(verificationRunIdText)) throw new Error("GITHUB_RUN_ID inválido."); const verificationRunId=Number(verificationRunIdText); if(!Number.isSafeInteger(verificationRunId)) throw new Error("GITHUB_RUN_ID fuera de rango.");
  const artifact={contract:"CORE-01-POST-APPLY-EVIDENCE",schema_version:1,artifact_name:evidenceArtifactName(verificationRunId),migration_path:source.migrationPath,migration_version:source.migrationVersion,environment:"staging",project_ref:CORE02_STAGING_PROJECT_REF,source_commit_sha:source.sourceCommitSha,deployment:{kind:"github_actions",run_id:context.deploymentRunId,workflow_id:deployment.workflowId},ledger:{version:ledger.version,name:ledger.name},verification:{run_id:verificationRunId,workflow:CORE01_POST_APPLY_WORKFLOW,workflow_path:CORE01_POST_APPLY_WORKFLOW_PATH,repository:CORE01_REPOSITORY,ref:CORE01_TRUSTED_REF,trusted_verifier_sha:context.trustedPipelineSha},verified_at:new Date().toISOString()};
  const schema=JSON.parse(readFileSync(resolve(rootDir,EVIDENCE_SCHEMA_PATH),"utf8")); const compiled=compileJsonSchema(schema,rootDir); const errors=validateEvidenceArtifactSchema(artifact,schema,rootDir,compiled); if(errors.length) throw new Error(`Evidence artifact generado no cumple schema: ${errors.join(" | ")}`);
  writeFileSync(resolve(rootDir,CORE01_EVIDENCE_FILE),`${JSON.stringify(artifact,null,2)}\n`,{encoding:"utf8",mode:0o600});
  console.log(`CORE-01 POST-APPLY VERIFICATION: PASS ${source.migrationPath}`);
  console.log(`Ledger: ${ledger.version}/${ledger.name}`);
  console.log(`Deployment run: ${context.deploymentRunId}; verification run: ${verificationRunId}`);
}

async function main(){ const mode=process.argv[2]; if(!new Set(["--preflight","--verify"]).has(mode)) throw new Error("Uso: verify-migration-post-apply.mjs --preflight|--verify"); const context=assertCore02TrustedContext(process.env,"verify"); const token=required(process.env.GITHUB_TOKEN,"GITHUB_TOKEN"); const apiUrl=process.env.GITHUB_API_URL??"https://api.github.com"; const rootDir=process.cwd(); if(mode==="--preflight") await preflight(rootDir,context,token,apiUrl); else await verify(rootDir,context,token,apiUrl); }
try{await main();}catch(error){console.error("CORE-01 POST-APPLY VERIFICATION: FAIL");console.error(safeErrorMessage(error));process.exit(1);}
