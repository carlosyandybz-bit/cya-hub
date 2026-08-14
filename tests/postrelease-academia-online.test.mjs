import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const v82=readFileSync("db/migrations/v82_academia_online_core.sql","utf8");
const v82b=readFileSync("db/migrations/v82b_academia_content_order.sql","utf8");
const v82c=readFileSync("db/migrations/v82c_app_module_order.sql","utf8");
const v82d=readFileSync("db/migrations/v82d_academia_content_remove_order.sql","utf8");
const v82e=readFileSync("db/migrations/v82e_academia_program_context_guard.sql","utf8");
const v83=readFileSync("db/migrations/v83_academia_backup_reset_integration.sql","utf8");
const teacher=readFileSync("app/academy-online-teacher.tsx","utf8");
const student=readFileSync("app/academy-online-student.tsx","utf8");
const admin=readFileSync("app/academy-online-admin.tsx","utf8");
const css=readFileSync("app/academy-online.module.css","utf8");
const app=readFileSync("app/cya-app.tsx","utf8");
const home=readFileSync("app/home-view.tsx","utf8");
const adminView=readFileSync("app/admin-view.tsx","utf8");
const transfer=readFileSync("app/admin-data-transfer.tsx","utf8");
const reset=readFileSync("app/admin-data-reset.tsx","utf8");
const catalog=readFileSync("app/statistics-catalog.ts","utf8");
const engine=readFileSync("app/statistics-engine.ts","utf8");

test("Academia is an access/catalog layer over canonical people and teaching content",()=>{
  for(const table of ["app_module_settings","academy_programs","academy_program_contents","academy_enrollments","academy_progress"]){
    assert.match(v82,new RegExp(`create table if not exists public\\.${table}`),table);
  }
  assert.match(v82,/content_id bigint not null references public\.teaching_contents\(id\)/);
  assert.match(v82,/person_id bigint not null references public\.people\(id\)/);
  assert.doesNotMatch(v82,/create table if not exists public\.academy_(teaching_contents|people|evaluations)/);
  assert.doesNotMatch(v82,/insert into public\.people/);
});

test("Academia course progress does not falsify pedagogical assignment state",()=>{
  assert.match(v82,/status text not null default 'not_started'/);
  assert.match(v82,/status in \('not_started','in_progress','completed'\)/);
  assert.doesNotMatch(v82,/insert into public\.student_content_assignments/);
  assert.doesNotMatch(v82,/assign_teaching_content/);
  assert.doesNotMatch(v82,/update public\.student_content_assignments/);
});

test("program context and content compatibility are enforced on the server",()=>{
  assert.match(v82,/private\.academy_validate_context/);
  assert.match(v82,/taxonomy='dance_style'/);
  assert.match(v82,/taxonomy='dance_role'/);
  assert.match(v82,/taxonomy='dance_level'/);
  assert.match(v82,/completion_status='complete'/);
  assert.match(v82,/publication_status='published'/);
  assert.match(v82,/visibility='student'/);
  assert.match(v82e,/El nuevo contexto no es compatible con todo el temario actual/);
});

test("lesson ordering is transactional and remains contiguous",()=>{
  assert.match(v82b,/deferrable initially immediate/);
  assert.match(v82b,/academy_move_program_content/);
  assert.match(v82b,/set constraints academy_program_contents_program_id_position_key deferred/);
  assert.match(v82d,/row_number\(\) over\(order by position,id\)/);
  assert.match(v82d,/academy_remove_program_content/);
});

test("Academia uses canonical identity and Administration controls publication and enrollment",()=>{
  assert.match(v82,/private\.academy_activate_student/);
  assert.match(v82,/insert into public\.student_profiles/);
  assert.match(v82,/insert into public\.app_member_roles\(user_id,role,active,granted_by\)/);
  assert.match(v82,/admin_academy_publish_program/);
  assert.match(v82,/admin_academy_enroll/);
  assert.match(v82,/if not \(select private\.is_admin\(\)\)/);
  assert.match(v82,/price_cents integer/);
  assert.match(v82,/publication_status text not null default 'draft'/);
});

test("all Academia tables are RLS protected and direct client writes are closed",()=>{
  for(const table of ["app_module_settings","academy_programs","academy_program_contents","academy_enrollments","academy_progress"]){
    assert.match(v82,new RegExp(`alter table public\\.${table} enable row level security`),table);
  }
  assert.match(v82,/revoke insert, update, delete on public\.app_module_settings/);
  assert.match(v82,/grant select on public\.app_module_settings/);
  assert.match(v82,/private\.current_person_id\(\)/);
  assert.match(v82,/private\.is_staff\(\)/);
  assert.match(v82,/private\.is_admin\(\)/);
});

test("module governance preserves the fixed mobile DAR CLASE architecture",()=>{
  for(const key of ["home","students","teaching","marketing","statistics","academy"]) assert.match(v82,new RegExp(`'${key}'`));
  assert.doesNotMatch(v82,/\('live','Dar clase'/);
  assert.match(v82c,/admin_move_module/);
  assert.match(admin,/DAR CLASE permanece fijo en el centro de la barra móvil/);
  assert.match(admin,/admin_move_module/);
});

test("teacher, student and Administration surfaces express the PR-D contract",()=>{
  for(const rpc of ["academy_save_program","academy_set_program_content","academy_move_program_content","academy_remove_program_content"]) assert.match(teacher,new RegExp(rpc),rpc);
  for(const rpc of ["admin_academy_publish_program","admin_academy_enroll","admin_academy_cancel_enrollment"]) assert.match(teacher,new RegExp(rpc),rpc);
  assert.match(student,/Academia Online/);
  assert.match(student,/Próximamente/);
  assert.match(css,/@media \(max-width: 720px\)/);
  assert.match(css,/min-height: 52px/);
  assert.match(app,/AcademyOnlineTeacherView/);
  assert.match(app,/AcademyOnlineStudentComingSoon/);
  assert.match(home,/academy/);
  assert.match(adminView,/AcademyOnlineAdmin/);
});

test("P28/P32 treat Academy configuration and operational access with different reset semantics",()=>{
  assert.match(v83,/if p_domain='academy'/);
  assert.match(v83,/p_domain='settings'[\s\S]*app_module_settings/);
  assert.match(v83,/p_domain='complete'[\s\S]*academy_progress/);
  assert.match(v83,/p_scope='operational'[\s\S]*delete from public\.academy_progress;[\s\S]*delete from public\.academy_enrollments;/);
  assert.match(v83,/p_scope='full'[\s\S]*delete from public\.academy_program_contents;[\s\S]*delete from public\.academy_programs;/);
  assert.doesNotMatch(v83,/delete from public\.app_module_settings/);
  assert.match(v83,/jsonb_build_object\('academy_online'/);
  assert.match(transfer,/\["academy", "Academia Online"\]/);
  assert.match(reset,/academy_online: "registros de Academia Online"/);
});

test("P30 measures Academy without inventing revenue before a payment flow exists",()=>{
  assert.match(catalog,/academy: "Academia Online"/);
  for(const key of ["academy_programs_published","academy_enrollments_active","academy_people_enrolled","academy_progress_percent"]) assert.match(catalog,new RegExp(key),key);
  assert.doesNotMatch(catalog,/academy_revenue/);
  assert.match(engine,/async function academyMetric/);
  assert.match(engine,/client\.from\("academy_programs"\)/);
  assert.match(engine,/client\.from\("academy_enrollments"\)/);
  assert.match(engine,/client\.from\("academy_progress"\)/);
  assert.match(engine,/metric\.block==="academy"/);
});
