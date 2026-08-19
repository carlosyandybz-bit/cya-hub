import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const moduleGates = [
  ".github/workflows/integrate-p20-form-runtime.yml",
  ".github/workflows/validate-p21-dar-clase.yml",
  ".github/workflows/validate-p22-student-portal.yml",
  ".github/workflows/validate-p23-teaching.yml",
  ".github/workflows/p24-contextual-home.yml",
  ".github/workflows/p25-missions.yml",
  ".github/workflows/p26-calendar-sync.yml",
  ".github/workflows/p27-notifications.yml",
  ".github/workflows/p28-data-transfer.yml",
  ".github/workflows/p29-marketing.yml",
  ".github/workflows/p30-statistics.yml",
  ".github/workflows/p31-admin-config.yml",
];

const p32 = readFileSync(".github/workflows/p32-release-qa.yml", "utf8");
const e2e = readFileSync(".github/workflows/cya-qa-e2e.yml", "utf8");
const stagingGate = readFileSync(".github/workflows/validate-evaluation-v35.yml", "utf8");

test("module regression gates remain manually dispatchable without duplicating every staging PR", () => {
  for (const path of moduleGates) {
    const workflow = readFileSync(path, "utf8");
    assert.doesNotMatch(workflow, /\bpull_request\s*:/, path);
    assert.match(workflow, /workflow_dispatch\s*:/, path);
  }
});

test("P32 is the canonical contract gate for pull requests to staging", () => {
  assert.match(p32, /pull_request:\s*\n\s*branches: \[staging\]/);
  assert.doesNotMatch(p32, /branches: \[main\]/);
  assert.match(p32, /tests\/postrelease-teacher-invite\.test\.mjs/);
});

test("browser QA runs on staging pushes and PRs and remains manually dispatchable", () => {
  assert.match(e2e, /push:\s*\n\s*branches:\s*\n\s*- staging/);
  assert.match(e2e, /pull_request:\s*\n\s*branches:\s*\n\s*- staging/);
  assert.doesNotMatch(e2e, /\n\s*- main\s*$/m);
  assert.match(e2e, /workflow_dispatch\s*:/);
});

test("staging always receives one canonical build validation", () => {
  assert.match(stagingGate, /push:\s*\n\s*branches: \[staging\]/);
  assert.doesNotMatch(stagingGate, /branches: \[main\]/);
  assert.doesNotMatch(stagingGate, /\n\s*paths\s*:/);
  assert.match(stagingGate, /npm run build/);
});
