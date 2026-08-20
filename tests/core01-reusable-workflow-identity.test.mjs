import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CALLER_PATH = ".github/workflows/core01-post-apply-verification.yml";
const TRUSTED_PATH = ".github/workflows/core01-post-apply-trusted.yml";
const EXPECTED_LOCAL_REFERENCE = "./.github/workflows/core01-post-apply-trusted.yml";
const IMMUTABLE_REMOTE_REFERENCE = /^carlosyandybz-bit\/cya-hub\/\.github\/workflows\/core01-post-apply-trusted\.yml@[0-9a-f]{40}$/;

const callerWorkflow = readFileSync(resolve(CALLER_PATH), "utf8");
const trustedWorkflow = readFileSync(resolve(TRUSTED_PATH), "utf8");

function trustedReusableReferences(source) {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("uses:") && line.includes("core01-post-apply-trusted.yml"))
    .map((line) => line.slice("uses:".length).trim());
}

function assertTrustedReusableIdentity(source) {
  const references = trustedReusableReferences(source);
  assert.equal(references.length, 1, "CORE-01 caller must contain exactly one trusted reusable workflow reference.");
  const reference = references[0];
  assert.ok(
    reference === EXPECTED_LOCAL_REFERENCE || IMMUTABLE_REMOTE_REFERENCE.test(reference),
    `Trusted reusable workflow reference must be same-commit local or an immutable 40-hex SHA, received: ${reference}`,
  );
  return reference;
}

test("P1 TOCTOU positive: caller uses same-repo local reusable reference", () => {
  assert.equal(assertTrustedReusableIdentity(callerWorkflow), EXPECTED_LOCAL_REFERENCE);
});

test("P1 TOCTOU negative: @staging mutable reusable reference is rejected", () => {
  assert.throws(
    () => assertTrustedReusableIdentity("uses: carlosyandybz-bit/cya-hub/.github/workflows/core01-post-apply-trusted.yml@staging"),
    /same-commit local or an immutable 40-hex SHA/,
  );
});

test("P1 TOCTOU negative: @main mutable reusable reference is rejected", () => {
  assert.throws(
    () => assertTrustedReusableIdentity("uses: carlosyandybz-bit/cya-hub/.github/workflows/core01-post-apply-trusted.yml@main"),
    /same-commit local or an immutable 40-hex SHA/,
  );
});

test("P1 TOCTOU negative: arbitrary mutable branch or tag references are rejected", () => {
  for (const mutableRef of ["feature/core01", "release/core01", "toctou-fix", "v1", "v1.2.3"]) {
    assert.throws(
      () => assertTrustedReusableIdentity(`uses: carlosyandybz-bit/cya-hub/.github/workflows/core01-post-apply-trusted.yml@${mutableRef}`),
      /same-commit local or an immutable 40-hex SHA/,
      mutableRef,
    );
  }
});

test("P1 TOCTOU invariant: caller commit = reusable commit = trusted checkout SHA = evidence trusted_verifier_sha", () => {
  assert.equal(assertTrustedReusableIdentity(callerWorkflow), EXPECTED_LOCAL_REFERENCE);

  const checkoutRefs = trustedWorkflow.match(/ref:\s*\$\{\{\s*github\.sha\s*\}\}/g) ?? [];
  assert.equal(checkoutRefs.length, 2, "Both trusted verifier checkouts must pin ref to github.sha from the caller context.");

  const evidenceShaBindings = trustedWorkflow.match(/CORE01_TRUSTED_VERIFIER_SHA:\s*\$\{\{\s*github\.sha\s*\}\}/g) ?? [];
  assert.equal(evidenceShaBindings.length, 1, "Authoritative evidence must bind trusted_verifier_sha to the same github.sha.");

  assert.doesNotMatch(callerWorkflow, /core01-post-apply-trusted\.yml@(staging|main|[^\s]+)/);
});
