import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const nextConfig = await readFile(new URL('../next.config.ts', import.meta.url), 'utf8');
const buildInfo = await readFile(new URL('../app/api/build-info/route.ts', import.meta.url), 'utf8');

test('AUD-011 embeds a deterministic Git build fingerprint when provider env is absent', () => {
  assert.match(nextConfig, /CYA_BUILD_SHA/);
  assert.match(nextConfig, /GIT_COMMIT_SHA/);
  assert.match(nextConfig, /git["'], \[?["']rev-parse["']/);
  assert.match(nextConfig, /["']HEAD["']/);
  assert.match(nextConfig, /env:\s*buildSha\s*\?\s*\{\s*CYA_BUILD_SHA:\s*buildSha\s*\}/s);
});

test('AUD-011 build-info remains no-store and exposes only a short commit reference', () => {
  assert.match(buildInfo, /commit:\s*commit\s*\?\s*commit\.slice\(0, 12\)\s*:\s*null/);
  assert.match(buildInfo, /cache-control["']:\s*["']no-store, max-age=0["']/);
  assert.doesNotMatch(buildInfo, /process\.env\.(?:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|GOOGLE_DRIVE_CLIENT_SECRET|CYA_SERVER_SECRET)/);
});
