import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const v80=readFileSync("db/migrations/v80_feedback_online_core.sql","utf8");
const v80b=readFileSync("db/migrations/v80b_feedback_upload_owner_scope.sql","utf8");
const v80c=readFileSync("db/migrations/v80c_feedback_staff_context.sql","utf8");
const v81=readFileSync("db/migrations/v81_feedback_backup_reset_integration.sql","utf8");
const student=readFileSync("app/feedback-online-student.tsx","utf8");
const staff=readFileSync("app/feedback-online-staff.tsx","utf8");
const admin=readFileSync("app/feedback-online-admin.tsx","utf8");
const css=readFileSync("app/feedback-online.module.css","utf8");
const drive=readFileSync("app/google-drive-server.ts","utf8");
const upload=readFileSync("app/api/feedback-online/upload/route.ts","utf8");
const mediaTicket=readFileSync("app/api/google-drive/media-ticket/route.ts","utf8");
const app=readFileSync("app/cya-app.tsx","utf8");
const adminView=readFileSync("app/admin-view.tsx","utf8");
const transfer=readFileSync("app/admin-data-transfer.tsx","utf8");
const reset=readFileSync("app/admin-data-reset.tsx","utf8");
const catalog=readFileSync("app/statistics-catalog.ts","utf8");
const engine=readFileSync("app/statistics-engine.ts","utf8");

test("Feedback Online is a separate discrete-credit domain, not a fake class or minute balance",()=>{
  for(const table of ["feedback_products","feedback_credit_orders","feedback_credit_ledger","feedback_requests","feedback_request_events","feedback_request_contents"]){
    assert.match(v80,new RegExp(`create table if not exists public\\.${table}`),table);
  }
  assert.match(v80,/credits_per_purchase integer not null default 1/);
  assert.match(v80,/feedback_products_single_credit_check check \(credits_per_purchase = 1\)/);
  assert.match(v80,/delta_credits integer not null/);
  assert.doesNotMatch(v80,/insert into public\.classes|credit_grants|credit_movements|duration_minutes|minutes_total|minutes_remaining/);
});

test("product launch and payment remain explicit instead of inventing a price or payment success",()=>{
  assert.match(v80,/price_cents integer/);
  assert.match(v80,/active boolean not null default false/);
  assert.ok(v80.includes("feedback_products(name,description,price_cents,currency,credits_per_purchase,target_response_hours,active,sort_order)"));
  assert.ok(v80.includes("select 'Feedback Online','Envía un vídeo y recibe una revisión pedagógica.',null,'EUR',1,null,false,10"));
  assert.match(v80,/payment_status text not null default 'pending'/);
  assert.match(v80,/feedback_request_purchase[\s\S]*'pending'/);
  assert.match(v80,/admin_feedback_confirm_purchase/);
  assert.match(v80,/admin_feedback_create_paid_purchase/);
  assert.doesNotMatch(student,/payment_status\s*:\s*["']paid["']/);
});

test("purchasing Feedback activates the existing canonical person as a student without duplicating people",()=>{
  assert.match(v80,/private\.feedback_activate_student\(p_person_id bigint\)/);
  assert.match(v80,/insert into public\.student_profiles\(person_id/);
  assert.match(v80,/select auth_user_id into v_auth from public\.people where id=p_person_id/);
  assert.match(v80,/insert into public\.app_member_roles\(user_id,role,active,granted_by\)/);
  assert.doesNotMatch(v80,/insert into public\.people/);
});

test("credits are ledger-derived, serialized and idempotent on submit/refund",()=>{
  assert.ok(v80.includes("idempotency_key text not null unique"));
  assert.ok(v80.includes("on conflict(idempotency_key) do nothing returning * into v_row"));
  assert.ok(v80.includes("perform 1 from public.people where id=v_person and active for update;"));
  assert.ok(v80.includes("private.feedback_add_ledger(v_person,null,v_request.id,'consumption',-1,'feedback:request:'||v_request.id||':consume'"));
  assert.ok(v80.includes("private.feedback_add_ledger(v_person,null,v_request.id,'refund',1,'feedback:request:'||v_request.id||':refund'"));
  assert.match(v80,/create or replace function public\.feedback_credit_balance[\s\S]*?from public\.feedback_credit_ledger where person_id=v_person;/);
});

test("all Feedback writes stay behind RLS and guarded RPCs",()=>{
  for(const table of ["feedback_products","feedback_credit_orders","feedback_credit_ledger","feedback_requests","feedback_request_events","feedback_request_contents"]){
    assert.match(v80,new RegExp(`alter table public\\.${table} enable row level security`),table);
  }
  assert.match(v80,/revoke insert, update, delete on public\.feedback_products/);
  assert.match(v80,/revoke all on function private\.feedback_activate_student\(bigint\) from public, anon, authenticated/);
  assert.match(v80,/revoke all on function private\.feedback_add_ledger/);
  assert.match(v80,/private\.current_person_id\(\)/);
  assert.match(v80,/private\.is_staff\(\)/);
  assert.match(v80,/private\.is_admin\(\)/);
  assert.match(v80b,/r\.person_id=\(select private\.current_person_id\(\)\)/);
  assert.match(v80c,/if not \(select private\.is_staff\(\)\)/);
});

test("student video upload is owner-scoped, server-associated and HMAC protected",()=>{
  assert.match(upload,/feedbackUploadContext\(accessToken, requestId\)/);
  assert.match(upload,/mimeType\.startsWith\("video\/"\)/);
  assert.match(upload,/1024 \* 1024 \* 1024/);
  assert.match(upload,/createDriveResumableUpload\(name, mimeType, size, "feedback"\)/);
  assert.match(upload,/signFeedbackUploadProof\(requestId, personId, payload\.id\)/);
  assert.match(upload,/attachFeedbackVideo\(accessToken/);
  assert.match(upload,/deleteDriveFile\(uploadedFileId\)/);
  assert.match(upload,/deleteDriveFile\(previousFileId\)/);
  assert.doesNotMatch(upload,/service[_-]?role/i);
  assert.match(drive,/feedbackProofPayload\(requestId: number, personId: number, fileId: string\)/);
  assert.match(drive,/createHmac\("sha256", signingKey\(\)\)/);
  assert.match(drive,/verifyFeedbackUploadProof/);
  assert.match(mediaTicket,/userCanAccessTeachingMedia/);
  assert.match(mediaTicket,/userCanAccessFeedbackMedia/);
});

test("Feedback reuses canonical teaching and manual evaluation without a class",()=>{
  assert.match(v80,/public\.assign_teaching_content\(v_request\.person_id,p_content_id,v_request\.style_term_id,v_request\.role_term_id,v_request\.level_term_id,null\)/);
  assert.match(v80,/public\.start_student_evaluation\(v_request\.person_id,v_request\.level_term_id,'manual',v_request\.style_term_id,v_request\.role_term_id,null/);
  assert.match(v80,/private\.assignment_is_student_releasable/);
  assert.match(staff,/ContextEvaluationPanel/);
  assert.match(staff,/classId=\{null\}/);
  assert.match(staff,/feedback_assign_content/);
  assert.match(staff,/update_teaching_assignment_status/);
});

test("P27 notifies staff on submit and the student on completion",()=>{
  assert.match(v80,/'feedback\.online\.pending'/);
  assert.match(v80,/'feedback\.online\.completed'/);
  assert.match(v80,/private\.enqueue_notification\('feedback\.online\.pending'/);
  assert.match(v80,/private\.enqueue_notification\('feedback\.online\.completed'/);
});

test("student, teacher and Administration surfaces are wired into the real CYA navigation",()=>{
  for(const rpc of ["feedback_credit_balance","feedback_request_purchase","feedback_create_draft","feedback_submit_request","feedback_cancel_request"]) assert.match(student,new RegExp(rpc),rpc);
  assert.match(student,/\/api\/feedback-online\/upload/);
  assert.match(student,/SecureDriveAsset/);
  for(const rpc of ["feedback_start_review","feedback_update_context","feedback_assign_content","feedback_start_evaluation","feedback_complete_request"]) assert.match(staff,new RegExp(rpc),rpc);
  for(const rpc of ["admin_feedback_save_product","admin_feedback_confirm_purchase","admin_feedback_create_paid_purchase","admin_feedback_adjust_credits"]) assert.match(admin,new RegExp(rpc),rpc);
  assert.match(app,/<FeedbackOnlineStudentPanel client=\{client\}/);
  assert.match(app,/<FeedbackOnlineStaffQueue client=\{db!\}/);
  assert.match(adminView,/\["feedback", "Feedback Online", GraduationCap\]/);
  assert.match(adminView,/section === "feedback" \? feedbackSection\(\)/);
  assert.match(css,/@media \(max-width: 720px\)/);
  assert.match(css,/min-height: 44px/);
});

test("P28/P32 include Feedback in backup, restore selection and scoped reset while preserving product config",()=>{
  assert.match(v81,/if p_domain='feedback' then[\s\S]*'feedback_products'[\s\S]*'feedback_credit_orders'[\s\S]*'feedback_requests'[\s\S]*'feedback_credit_ledger'[\s\S]*'feedback_request_events'[\s\S]*'feedback_request_contents'/);
  assert.match(v81,/p_domain='settings'[\s\S]*feedback_products/);
  assert.match(v81,/p_domain='complete'[\s\S]*feedback_request_contents/);
  assert.match(v81,/p_scope='person'/);
  assert.match(v81,/p_scope='students'/);
  assert.match(v81,/p_scope='teaching_content'/);
  assert.match(v81,/p_scope='teaching'/);
  assert.match(v81,/p_scope in \('operational','full'\)/);
  assert.doesNotMatch(v81,/delete from public\.feedback_products/);
  assert.match(v81,/jsonb_build_object\('feedback_online'/);
  assert.match(transfer,/\["feedback", "Feedback Online"\]/);
  assert.match(transfer,/Feedback Online se importa desde una copia JSON exportada por CYA Hub/);
  assert.match(reset,/feedback_online: "registros de Feedback Online"/);
});

test("P30 exposes Feedback metrics from requests and the audited credit ledger",()=>{
  assert.match(catalog,/feedback: "Feedback Online"/);
  for(const key of ["feedback_submitted","feedback_completed","feedback_pending","feedback_response_hours","feedback_credits_purchased","feedback_credits_consumed"]) assert.match(catalog,new RegExp(key),key);
  assert.match(engine,/async function feedbackMetric/);
  assert.match(engine,/client\.from\("feedback_requests"\)/);
  assert.match(engine,/client\.from\("feedback_credit_ledger"\)/);
  assert.ok(engine.includes('const movement=key==="feedback_credits_purchased"?"purchase":"consumption";'));
  assert.ok(engine.includes('.eq("movement_type",movement)'));
  assert.match(engine,/metric\.block==="feedback"/);
});
