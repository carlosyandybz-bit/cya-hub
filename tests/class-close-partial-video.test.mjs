import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("app/cya-app.tsx", "utf8");
const mediaEditor = fs.readFileSync("app/teaching-media-editor.tsx", "utf8");
const driveServer = fs.readFileSync("app/google-drive-server.ts", "utf8");
const uploadRoute = fs.readFileSync("app/api/google-drive/upload/route.ts", "utf8");
const sql = fs.readFileSync("supabase/v29-partial-payments-class-videos.sql", "utf8");
const start = app.indexOf("function FinishClassModal(");
const end = app.indexOf("\nfunction LiveSession(", start);
const finish = app.slice(start, end);

test("class close supports full, half, custom and zero payment with persisted outstanding balance", () => {
  assert.match(finish, /paymentMode/);
  assert.match(finish, /Todo ·/);
  assert.match(finish, /Mitad ·/);
  assert.match(finish, /Otra cantidad/);
  assert.match(finish, /Nada ahora/);
  assert.match(finish, /p_paid_now_cents: paidNowCents/);
  assert.match(finish, /administratively_finish_class_v5/);
  assert.match(sql, /class_financial_accounts/);
  assert.match(sql, /class_payment_movements/);
  assert.match(sql, /status in \('paid','partial','unpaid'\)/);
  assert.match(sql, /record_class_payment/);
});

test("quick bonus payment is decided at final close instead of pre-marked paid", () => {
  assert.match(finish, /p_payment_status: "pending"/);
  assert.doesNotMatch(finish, /quickPaymentStatus/);
  assert.match(finish, /p_quick_created_grant_id: quickCreatedGrantId/);
  assert.match(sql, /payment_status=case when v_paid>=v_quick_price then 'paid' else 'pending'/);
});

test("class explanatory video uploads to Drive and can be private or reusable", () => {
  assert.match(finish, /Vídeo explicativo/);
  assert.match(finish, /Solo para alumno/);
  assert.match(finish, /Reutilizable/);
  assert.match(finish, /x-cya-media-scope": "class_video"/);
  assert.match(finish, /register_class_video_resource/);
  assert.match(sql, /class_video_resources/);
  assert.match(sql, /visibility_scope in \('private_student','reusable'\)/);
  assert.match(uploadRoute, /x-cya-media-scope/);
  assert.match(driveServer, /DEFAULT_CLASS_VIDEOS_FOLDER_ID/);
});

test("class videos are resources only and never teaching-tree relations", () => {
  const registerStart = sql.indexOf("create or replace function public.register_class_video_resource");
  const registerEnd = sql.indexOf("create or replace function public.can_access_teaching_media", registerStart);
  const register = sql.slice(registerStart, registerEnd);
  assert.doesNotMatch(register, /teaching_content_relations/);
  assert.match(register, /teaching_content_media/);
  assert.match(register, /content_type not in \('correction','explanation','sequence'\)/);
  assert.match(mediaEditor, /class_video_resources/);
  assert.match(mediaEditor, /Vídeos de clase/);
  assert.match(app, /allowClassVideos=\{\["correction","explanation","sequence"\]\.includes\(type\)\}/);
});

test("private class videos can be displayed only for the selected student portal", () => {
  assert.match(sql, /class_video_resources_student_select/);
  assert.match(sql, /person_id=\(select private\.current_person_id\(\)\)/);
  assert.match(sql, /v\.visibility_scope='private_student'/);
  assert.match(app, /Vídeos de mis clases/);
  assert.match(app, /SecureDriveAsset/);
});

test("new class financial and video records remain included in CYA backups", () => {
  assert.match(sql, /'class_financial_items','class_financial_accounts','class_payment_movements','class_video_resources'/);
});
