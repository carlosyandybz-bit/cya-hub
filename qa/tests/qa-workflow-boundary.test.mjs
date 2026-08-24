import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const workflow = readFileSync(resolve(root, ".github/workflows/cya-qa-e2e.yml"), "utf8");
const bootstrap = readFileSync(resolve(root, "supabase/functions/cya-qa-bootstrap/index.ts"), "utf8");

function jobBlock(name) {
  const marker = `  ${name}:\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `Missing workflow job ${name}`);
  const tail = workflow.slice(start + marker.length);
  const next = tail.search(/\n  [A-Za-z0-9_-]+:\n/);
  return next === -1 ? workflow.slice(start) : workflow.slice(start, start + marker.length + next);
}

function assertOrdered(block, labels) {
  let previous = -1;
  for (const label of labels) {
    const index = block.indexOf(label);
    assert.ok(index > previous, `${label} must appear after the previous runtime gate`);
    previous = index;
  }
}

test("workflow grants OIDC only to the staging runtime job", () => {
  const header = workflow.slice(0, workflow.indexOf("\njobs:\n"));
  assert.match(header, /permissions:\n  contents: read/);
  assert.doesNotMatch(header, /id-token:\s*write/);

  const premerge = jobBlock("premerge-contract");
  assert.match(premerge, /permissions:\n      contents: read/);
  assert.doesNotMatch(premerge, /id-token:\s*write/);

  const runtime = jobBlock("runtime-staging");
  assert.match(runtime, /permissions:\n      contents: read\n      id-token: write/);
});

test("pull_request lane is explicit, non-mutating, and still runs harness contracts and build", () => {
  const premerge = jobBlock("premerge-contract");
  assert.match(premerge, /if: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  assert.match(premerge, /fixture-readiness\.test\.mjs/);
  assert.match(premerge, /bootstrap-student-fixtures\.test\.mjs/);
  assert.match(premerge, /qa-workflow-boundary\.test\.mjs/);
  assert.match(premerge, /npm run build/);
  assert.match(premerge, /RUNTIME QA = DEFERRED TO STAGING INTEGRATION/);

  assert.doesNotMatch(premerge, /CYA_QA_BOOTSTRAP_URL/);
  assert.doesNotMatch(premerge, /ACTIONS_ID_TOKEN_REQUEST/);
  assert.doesNotMatch(premerge, /cya-qa-bootstrap/);
  assert.doesNotMatch(premerge, /class-attendance-auth-postapply/);
  assert.doesNotMatch(premerge, /test:visual|test:e2e/);
  assert.doesNotMatch(premerge, /supabase\s+functions\s+deploy|deploy_edge_function/i);
});

test("staging runtime lane keeps exact ref boundary and complete authenticated QA ordering", () => {
  const runtime = jobBlock("runtime-staging");
  assert.match(runtime, /github\.event_name == 'push' \|\| github\.event_name == 'workflow_dispatch'/);
  assert.match(runtime, /GITHUB_REF.*refs\/heads\/staging/);
  assert.match(runtime, /qlngfkzmncihtdzktcmd\.supabase\.co/);
  assert.match(runtime, /ldvyeyhzrepaaouzavgs\.supabase\.co/);
  assert.match(runtime, /ACTIONS_ID_TOKEN_REQUEST_TOKEN/);
  assert.match(runtime, /audience=cya-hub-qa/);

  assertOrdered(runtime, [
    "Refuse non-staging runtime ref",
    "Bootstrap dedicated QA identities with GitHub OIDC",
    "Verify student fixture readiness before Playwright",
    "Run authenticated Attendance post-apply gate",
    "Build application",
    "Run fast visual design gate",
    "Run browser QA",
    "Upload browser evidence",
  ]);
});

test("workflow_dispatch cannot become a permissive deployment or mutation bypass", () => {
  assert.match(workflow, /workflow_dispatch:/);
  const runtime = jobBlock("runtime-staging");
  assert.match(runtime, /\[\[ "\$\{GITHUB_REF\}" == "refs\/heads\/staging" \]\]/);
  assert.doesNotMatch(workflow, /supabase\s+functions\s+deploy|deploy_edge_function/i);
});

test("Edge bootstrap keeps its strict staging-only OIDC contract", () => {
  assert.match(bootstrap, /EXPECTED_STAGING_REF = "refs\/heads\/staging"/);
  assert.match(bootstrap, /claims\.ref !== EXPECTED_STAGING_REF/);
  assert.match(bootstrap, /EXPECTED_WORKFLOW_REF/);
  assert.doesNotMatch(bootstrap, /refs\/pull\//);
});
