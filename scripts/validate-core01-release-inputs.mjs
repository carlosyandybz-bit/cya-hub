#!/usr/bin/env node
import { safeErrorMessage, validatePostApplyInputs } from "./core01-provenance.mjs";

try {
  const values = validatePostApplyInputs({
    migrationPath: process.env.CORE01_INPUT_MIGRATION_PATH,
    sourceCommitSha: process.env.CORE01_INPUT_SOURCE_COMMIT_SHA,
    deploymentRunId: process.env.CORE01_INPUT_DEPLOYMENT_RUN_ID,
  });
  console.log("CORE-01 RELEASE INPUT VALIDATION: PASS");
  console.log(`Migration version: ${values.migrationPath.slice("supabase/migrations/".length, "supabase/migrations/".length + 14)}`);
} catch (error) {
  console.error("CORE-01 RELEASE INPUT VALIDATION: FAIL");
  console.error(safeErrorMessage(error));
  process.exit(1);
}
