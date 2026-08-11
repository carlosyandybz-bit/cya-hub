import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/v48_p20_form_engine.sql','utf8');
const runtime=fs.readFileSync('app/runtime-form.tsx','utf8');
const admin=fs.readFileSync('app/admin-form-library.tsx','utf8');
const person=fs.readFileSync('app/person-identity-editor.tsx','utf8');
const buildInfo=fs.readFileSync('app/api/build-info/route.ts','utf8');

test('P20 reuses v14 form tables instead of creating a parallel library',()=>{
  assert.doesNotMatch(sql,/create table\s+(if not exists\s+)?public\.form_(definitions|versions|fields|submissions)/i);
  assert.match(sql,/alter table public\.form_versions/);
  assert.match(sql,/alter table public\.form_submissions/);
});

test('canonical paths are allowlisted and noncanonical answers stay separate',()=>{
  assert.match(sql,/form_canonical_path_allowed/);
  assert.match(sql,/people\.first_name/);
  assert.match(sql,/student_profiles\.goals/);
  assert.match(sql,/v_canonical_updates:=/);
  assert.match(sql,/v_noncanonical:=/);
  assert.match(sql,/canonical_snapshot,answers/);
  assert.doesNotMatch(sql,/execute\s+format\(/i);
});

test('published form fields are immutable and changes use draft then publish',()=>{
  assert.match(sql,/guard_published_form_fields/);
  assert.match(sql,/status is distinct from 'draft'/i);
  assert.match(sql,/create_form_draft_version/);
  assert.match(sql,/publish_form_version/);
  assert.match(admin,/create_form_draft_version/);
  assert.match(admin,/publish_form_version/);
  assert.match(admin,/La versión publicada es inmutable/);
});

test('runtime performs server validation visibility and conditions',()=>{
  assert.match(sql,/form_normalize_value/);
  assert.match(sql,/form_condition_matches/);
  assert.match(sql,/form_field_visible/);
  assert.match(sql,/Completa el campo:/);
  assert.match(sql,/La opción seleccionada no está permitida/);
  assert.match(sql,/revoke insert,update,delete on public\.form_submissions from authenticated/);
});

test('student personal v2 is canonical and reconciles historical stale fields',()=>{
  assert.match(sql,/add column if not exists birth_date date/);
  assert.match(sql,/add column if not exists motivation text/);
  assert.match(sql,/\('student_personal','birth_date','date'/);
  assert.match(sql,/\('student_personal','motivation','textarea'/);
  assert.match(sql,/\('student_dance','context_info','information'/);
  assert.match(sql,/active_version=2/);
});

test('generic runtime cannot impersonate domain-service forms',()=>{
  assert.match(sql,/runtime_engine','generic_v1'/);
  assert.match(sql,/runtime_engine','domain_service'/);
  assert.ok((sql.match(/flujo de negocio específico y no se ejecuta con el motor genérico/g)||[]).length>=2,'read and submit must both reject domain-service forms');
  assert.match(sql,/servicio de dominio y no se versiona desde el editor genérico/);
  assert.match(sql,/servicio de dominio y no se publica desde el editor genérico/);
  assert.match(sql,/flujo de negocio específico y no puede activarse en el motor genérico/);
  assert.match(sql,/where form_key not in \('student_personal','student_dance','onboarding'\)/);
});

test('generic builder creates forms and configurable draft fields without SQL authoring',()=>{
  assert.match(sql,/create or replace function public\.create_generic_form/);
  assert.match(sql,/create or replace function public\.add_form_draft_field/);
  assert.match(sql,/create or replace function public\.configure_form_draft_field/);
  assert.match(sql,/Tipo de campo no soportado/);
  assert.match(sql,/Ruta canónica no permitida/);
  assert.match(sql,/condición que apunta a un campo inexistente/);
  assert.match(admin,/create_generic_form/);
  assert.match(admin,/add_form_draft_field/);
  assert.match(admin,/configure_form_draft_field/);
  assert.match(admin,/Nuevo formulario/);
  assert.match(admin,/Añadir campo/);
});

test('teacher notes have a server-enforced staff-only visibility floor',()=>{
  const runtimeRead=sql.slice(sql.indexOf('create or replace function public.form_runtime'),sql.indexOf('create or replace function public.submit_form_runtime'));
  const runtimeSubmit=sql.slice(sql.indexOf('create or replace function public.submit_form_runtime'),sql.indexOf('create or replace function public.create_generic_form'));
  const builder=sql.slice(sql.indexOf('create or replace function public.add_form_draft_field'),sql.indexOf('create or replace function public.create_form_draft_version'));
  assert.match(runtimeRead,/canonical_path='student_profiles\.teacher_notes' and not v_staff then continue/);
  assert.match(runtimeSubmit,/canonical_path='student_profiles\.teacher_notes' and not v_staff then continue/);
  assert.match(builder,/p_canonical_path='student_profiles\.teacher_notes'/);
  assert.match(builder,/audiences[^\n]*staff[^\n]*editable_by[^\n]*staff/);
});

test('runtime renderer supports minimum field types and G3 numeric behavior',()=>{
  for (const type of ['information','text','textarea','select','multiselect','checkbox','number','date','email','phone']) assert.match(runtime,new RegExp(`\\"${type}\\"`));
  assert.match(runtime,/inputMode=\{decimal \? "decimal" : "numeric"\}/);
  assert.match(runtime,/value=\{scalar\(value\)\}/);
  assert.doesNotMatch(runtime,/defaultValue=\"0\"/);
  assert.match(runtime,/CYA ya conoce/);
});

test('frontend remains functional before v48 and switches to runtime after cutover',()=>{
  assert.match(runtime,/runtimeUnavailable/);
  assert.match(runtime,/PGRST202/);
  assert.match(runtime,/unavailableFallback/);
  assert.match(person,/formKey="student_personal"/);
  assert.match(person,/unavailableFallback=\{<LegacyStudentIdentityForm/);
  assert.match(person,/client\.rpc\("save_person_identity"/);
  assert.match(sql,/match_person_identity\(v_email,v_phone,p_person_id\)/);
});

test('admin builder is read-only until the P20 backend is actually active',()=>{
  assert.match(admin,/type EngineState = "checking" \| "ready" \| "pending"/);
  assert.match(admin,/PGRST202/);
  assert.match(admin,/La biblioteca se muestra en modo lectura hasta que v48 esté activa/);
  assert.match(admin,/engine==="ready"&&generic/);
  assert.match(admin,/Contrato histórico de un flujo de negocio/);
});

test('P20 exposes a deployment marker for G1 before v48 cutover',()=>{
  assert.match(buildInfo,/p20-form-runtime-v48-ready/);
  assert.match(buildInfo,/cache-control/);
  assert.match(buildInfo,/no-store/);
});
