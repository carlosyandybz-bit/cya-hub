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
const mainGate = readFileSync(".github/workflows/validate-evaluation-v35.yml", "utf8");

test("module regression gates do not duplicate every pull request to main", () => {
  for (const path of moduleGates) {
    const workflow = readFileSync(path, "utf8");
    assert.doesNotMatch(workflow, /\bpull_request\s*:/, path);
    assert.match(workflow, /workflow_dispatch\s*:/, path);
  }
});

test("P32 is the canonical contract gate for pull requests to main", () => {
  assert.match(p32, /pull_request:\s*\n\s*branches: \[main\]/);
  assert.match(p32, /tests\/postrelease-teacher-invite\.test\.mjs/);
});

test("browser QA runs once per PR and remains dispatchable for main", () => {
  assert.doesNotMatch(e2e, /^\s*push\s*:/m);
  assert.match(e2e, /pull_request:\s*\n\s*branches:\s*\n\s*- main/);
  assert.match(e2e, /workflow_dispatch\s*:/);
});

test("main always receives one canonical build validation", () => {
  assert.match(mainGate, /push:\s*\n\s*branches: \[main\]/);
  assert.doesNotMatch(mainGate, /\n\s*paths\s*:/);
  assert.match(mainGate, /npm run build/);
});
