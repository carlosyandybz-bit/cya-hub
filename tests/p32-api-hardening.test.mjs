import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("app/cya-app.tsx", "utf8");
const runtime = readFileSync("app/api/runtime-config/route.ts", "utf8");
const buildInfo = readFileSync("app/api/build-info/route.ts", "utf8");
const drive = readFileSync("app/google-drive-server.ts", "utf8");
const env = readFileSync(".env.example", "utf8");
const calendarDisconnect = readFileSync("app/api/google-calendar/disconnect/route.ts", "utf8");
const calendarResolve = readFileSync("app/api/google-calendar/resolve/route.ts", "utf8");

test("runtime config remains the explicit Supabase browser bootstrap", () => {
  assert.match(app, /fetch\("\/api\/runtime-config"/);
  assert.match(app, /createClient\(config\.supabaseUrl, config\.supabasePublishableKey/);
  assert.match(runtime, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(runtime, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(runtime, /cache-control.*no-store/is);
  assert.doesNotMatch(runtime, /service_role|sb_secret_/i);
});

test("build info identifies the P32 release without a stale phase marker", () => {
  assert.match(buildInfo, /release: "p32-release"/);
  assert.match(buildInfo, /CYA_BUILD_SHA/);
  assert.match(buildInfo, /commit\.slice\(0, 12\)/);
  assert.doesNotMatch(buildInfo, /p23|teaching-graph-v51/i);
  assert.match(buildInfo, /no-store/);
});

test("Drive class videos have no embedded historical destination", () => {
  assert.doesNotMatch(drive, /DEFAULT_CLASS_VIDEOS_FOLDER_ID/);
  assert.doesNotMatch(drive, /1QqL1Wt0lNebcTO-2qtUGdgCsOF_IRiV_/);
  assert.match(drive, /GOOGLE_DRIVE_CLASS_VIDEOS_FOLDER_ID/);
  assert.match(drive, /return ensureTeachingFolder\(token\)/);
  assert.match(env, /GOOGLE_DRIVE_CLASS_VIDEOS_FOLDER_ID=/);
});

test("Calendar mutations remain staff-authenticated", () => {
  for (const route of [calendarDisconnect, calendarResolve]) {
    assert.match(route, /bearerToken\(request\)/);
    assert.match(route, /requireStaff/);
    assert.match(route, /cache-control": "no-store/);
  }
});
