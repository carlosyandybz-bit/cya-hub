import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/v47_p19_persona_unica.sql','utf8');
const app=fs.readFileSync('app/cya-app.tsx','utf8');
const detail=fs.readFileSync('app/student-detail.tsx','utf8');
const marketing=fs.readFileSync('app/marketing-view-legacy.tsx','utf8');
const editor=fs.readFileSync('app/person-identity-editor.tsx','utf8');

test('P19 derives lifecycle instead of duplicating it as mutable state',()=>{
  assert.match(migration,/person_lifecycle_status_unchecked/);
  assert.match(migration,/when sp\.person_id is null then 'potential'/);
  assert.match(migration,/when p\.auth_user_id is null then 'provisional'/);
  assert.match(migration,/else 'registered'/);
  assert.doesNotMatch(migration,/add column\s+(person_status|student_status|lifecycle_status)/i);
});

test('new CRM/student operations reuse a unique matching person and reject ambiguous identities',()=>{
  assert.match(migration,/match_person_identity/);
  assert.match(migration,/Hay varias fichas que coinciden con ese email o teléfono/);
  assert.match(migration,/Ficha provisional habilitada reutilizando la persona existente/);
  assert.match(migration,/Contacto vinculado con una persona existente; no se creó una ficha duplicada/);
  assert.match(migration,/pg_advisory_xact_lock/);
});

test('editing identity cannot silently collide with another person',()=>{
  assert.match(migration,/create or replace function public\.save_person_identity/);
  assert.match(migration,/Ese email o teléfono pertenece a otra ficha/);
  assert.match(editor,/save_person_identity/);
  assert.match(detail,/StudentIdentityEditor/);
});

test('P19 keeps potential provisional registered visible in the product',()=>{
  assert.match(app,/student\.auth_user_id \? "Registrado" : "Provisional"/);
  assert.match(marketing,/"Registrado" : "Provisional"\) : "Potencial"/);
  assert.match(marketing,/Potenciales, provisionales y registrados comparten una sola persona/);
});

test('Dar clase can create provisional without leaving the manual class flow',()=>{
  assert.match(app,/QuickProvisionalStudentModal/);
  assert.match(app,/Crear alumno provisional/);
  assert.match(app,/Crear y seleccionar|quickSlot/);
  assert.match(app,/refresh=\{refresh\}/);
});

test('auth linking never falls back to a generic Persona or Alumno identity',()=>{
  const link=migration.slice(migration.indexOf('create or replace function private.link_confirmed_student'));
  assert.doesNotMatch(link,/'Persona'/);
  assert.doesNotMatch(link,/'Alumno'/);
  assert.match(link,/split_part\(v_email,'@',1\)/);
});
