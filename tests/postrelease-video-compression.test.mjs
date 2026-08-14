import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pkg=JSON.parse(readFileSync("package.json","utf8"));
const client=readFileSync("app/video-upload-client.ts","utf8");
const sessionServer=readFileSync("app/drive-upload-session-server.ts","utf8");
const sessionRoute=readFileSync("app/api/google-drive/upload-session/route.ts","utf8");
const feedbackRoute=readFileSync("app/api/feedback-online/upload/route.ts","utf8");
const teaching=readFileSync("app/teaching-media-editor.tsx","utf8");
const feedback=readFileSync("app/feedback-online-student.tsx","utf8");

test("video optimization is optional, bounded and never blocks the original",()=>{
  assert.match(String(pkg.dependencies?.mediabunny||""),/1\.51\.0/);
  assert.ok(!pkg.dependencies?.["@mediabunny/server"]);
  assert.match(client,/VIDEO_COMPRESSION_MIN_BYTES = 24 \* MIB/);
  assert.match(client,/VIDEO_COMPRESSION_MAX_BYTES = 250 \* MIB/);
  assert.match(client,/await import\("mediabunny"\)/);
  assert.match(client,/codec: "avc"/);
  assert.match(client,/codec: "aac"/);
  assert.match(client,/width > 1920/);
  assert.match(client,/height > 1920/);
  assert.match(client,/forceTranscode: true/);
  assert.match(client,/savings < MIN_SAVINGS_RATIO/);
  assert.match(client,/return original\(file, "unsupported"\)/);
  assert.match(client,/return original\(file, "failed"\)/);
});

test("direct Drive sessions are HMAC bound and status-verified server-side",()=>{
  assert.match(sessionServer,/createHmac\("sha256"/);
  assert.match(sessionServer,/timingSafeEqual/);
  assert.match(sessionServer,/purpose: "teaching-upload" \| "feedback-upload"/);
  assert.match(sessionServer,/uploadUrl: string/);
  assert.match(sessionServer,/exp: number/);
  assert.match(sessionServer,/bytes \*\/\$\{payload\.size\}/);
  assert.match(sessionRoute,/signDriveUploadTicket/);
  assert.match(sessionRoute,/verifyDriveUploadTicket/);
  assert.match(sessionRoute,/queryCompletedDriveUpload/);
});

test("teaching media prepares video and prefers browser-to-Drive upload",()=>{
  assert.match(teaching,/prepareVideoForUpload/);
  assert.match(teaching,/uploadPreparedToDrive/);
  assert.match(teaching,/Vídeo optimizado/);
  assert.match(client,/directPut\(session\.uploadUrl, prepared\)/);
  assert.match(client,/fetch\(uploadUrl,[\s\S]*method: "PUT"/);
  assert.match(client,/proxyTeachingUpload/);
  assert.match(client,/\/api\/google-drive\/upload-session/);
});

test("Feedback uploads bytes directly when possible and keeps a streaming fallback",()=>{
  assert.match(feedback,/prepareVideoForUpload/);
  assert.match(feedback,/uploadPreparedFeedback/);
  assert.match(feedback,/Vídeo optimizado/);
  assert.match(feedbackRoute,/export async function POST/);
  assert.match(feedbackRoute,/export async function PATCH/);
  assert.match(feedbackRoute,/export async function PUT/);
  assert.match(feedbackRoute,/duplex: "half"/);
  assert.match(feedbackRoute,/signFeedbackUploadProof/);
  assert.match(feedbackRoute,/deleteDriveFile\(previousFileId\)/);
  assert.doesNotMatch(feedbackRoute,/arrayBuffer\(/);
  assert.match(client,/proxyFeedbackUpload/);
});

test("compression never becomes a hard dependency on FFmpeg or server transcoding",()=>{
  assert.doesNotMatch(client,/ffmpeg/i);
  assert.doesNotMatch(sessionRoute,/mediabunny|ffmpeg/i);
  assert.doesNotMatch(feedbackRoute,/mediabunny|ffmpeg/i);
  assert.match(client,/large-file/);
  assert.match(client,/small-file/);
});
