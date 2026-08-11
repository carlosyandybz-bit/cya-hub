import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const reset=fs.readFileSync('app/admin-data-reset.tsx','utf8');
const transfer=fs.readFileSync('app/admin-data-transfer.tsx','utf8');
const sql=fs.readFileSync('supabase/v44_admin_data_reset.sql','utf8');
const guard=fs.readFileSync('supabase/v44b_admin_data_reset_backup_guard.sql','utf8');

test('admin data page exposes selective, area and mass reset tools',()=>{
  assert.match(transfer,/AdminDataReset/);
  assert.match(reset,/Borrado selectivo/);
  assert.match(reset,/Borrado por áreas/);
  assert.match(reset,/Reinicio completo de CYA Hub/);
  assert.match(reset,/search_admin_reset_targets/);
  assert.match(reset,/preview_admin_data_reset/);
  assert.match(reset,/apply_admin_data_reset/);
});

test('mass resets require a complete backup in UI and server',()=>{
  assert.match(reset,/export_data_bundle/);
  assert.match(reset,/p_domain:\s*"complete"/);
  assert.match(reset,/disabled=\{!backupReady/);
  assert.match(guard,/v_job\.scope in \('operational','full'\)/);
  assert.match(guard,/event_type='data_export_created'/);
  assert.match(guard,/entity_id='complete'/);
  assert.match(guard,/created_at>=now\(\)-interval '30 minutes'/);
});

test('destructive reset uses expiring preview jobs and double confirmation',()=>{
  assert.match(sql,/admin_reset_jobs/);
  assert.match(sql,/expires_at timestamptz not null default \(now\(\) \+ interval '30 minutes'\)/);
  assert.match(sql,/confirmation_phrase/);
  assert.match(sql,/La frase de confirmación no coincide/);
  assert.match(reset,/Primera confirmación/);
  assert.match(reset,/Confirmación final/);
  assert.match(reset,/Sí, borrar definitivamente/);
});

test('reset backend is admin-only and not directly table-accessible',()=>{
  assert.match(sql,/private\.is_admin\(\)/);
  assert.match(sql,/alter table public\.admin_reset_jobs enable row level security/);
  assert.match(sql,/revoke all on table public\.admin_reset_jobs from public, anon, authenticated/);
  assert.match(sql,/grant execute on function public\.search_admin_reset_targets/);
  assert.match(sql,/grant execute on function public\.preview_admin_data_reset/);
  assert.match(guard,/grant execute on function public\.apply_admin_data_reset/);
});

test('full reset deletes operational business data but preserves technical foundation',()=>{
  for(const table of [
    'student_evaluations','student_aptitude_progress','evaluation_sessions',
    'student_content_measurements','student_content_assignments','student_incidents',
    'credit_movements','classes','credit_grants','student_profiles',
    'marketing_campaigns','marketing_content','marketing_events','crm_profiles',
    'missions','calendar_events','internal_notifications','notification_deliveries',
    'form_submissions','teaching_contents','marketing_rates','daily_quotes',
  ]) {
    assert.match(sql,new RegExp(`delete from public\\.${table}`));
  }

  for(const protectedTable of [
    'app_member_roles','app_members','user_profiles','catalog_terms',
    'form_definitions','form_versions','form_fields','mission_rules',
    'notification_rules','integration_settings','calendar_connections',
  ]) {
    assert.doesNotMatch(sql,new RegExp(`delete from public\\.${protectedTable}(?:\\s|;)`));
  }

  assert.doesNotMatch(sql,/delete\s+from\s+auth\.users/i);
  assert.doesNotMatch(sql,/truncate\s+/i);
});

test('single person deletion protects active staff identity',()=>{
  assert.match(sql,/is_staff_identity_person/);
  assert.match(sql,/No se puede borrar una identidad activa del equipo/);
  assert.match(reset,/Protegido/);
});

test('teaching content can be searched and safely removed with dependent progress awards first',()=>{
  assert.match(sql,/p_kind='teaching_content'/);
  assert.match(sql,/delete from public\.evaluation_progress_awards where content_id=p_target_id/);
  assert.match(sql,/delete from public\.teaching_contents where id=p_target_id/);
  assert.match(reset,/Corrección, explicación, ejercicio, secuencia/);
});

test('reset execution is serialized and audited',()=>{
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/admin_data_reset/);
  assert.match(sql,/insert into public\.audit_events/);
});
