import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app/cya-app.tsx','utf8');
const editor=fs.readFileSync('app/class-summary-content-editor.tsx','utf8');
const sql=fs.readFileSync('supabase/v45_fix_teaching_rls_and_summary_edit.sql','utf8');

test('final pedagogical summary embeds an editable content review panel',()=>{
  assert.match(app,/ClassSummaryContentEditor/);
  assert.match(app,/onChanged=\{loadSummaryEvents\}/);
  assert.match(editor,/Revisar contenido trabajado/);
  assert.match(editor,/Añade lo que olvidaste o corrige un estado antes de enviar el resumen/);
});

test('summary editor can correct all teaching content states before pedagogical close',()=>{
  assert.match(editor,/update_correction_assignment/);
  assert.match(editor,/update_class_teaching_assignment_status/);
  assert.match(editor,/record_class_content_event/);
  assert.match(editor,/exercise_\$\{state\}/);
  assert.match(editor,/Frecuencia/);
  assert.match(editor,/Importancia/);
});

test('summary editor can search, add and quick-create forgotten content',()=>{
  assert.match(editor,/search_class_teaching_content/);
  assert.match(editor,/assign_teaching_content/);
  assert.match(editor,/create_class_correction/);
  assert.match(editor,/create_quick_class_content/);
  assert.match(editor,/Crear y añadir/);
});

test('summary editor handles pair participants independently',()=>{
  assert.match(editor,/participants\.length > 1/);
  assert.match(editor,/setPersonId\(row\.person_id\)/);
  assert.match(editor,/p_person_id: personId/);
});

test('v45 breaks the circular RLS dependency without disabling RLS',()=>{
  assert.match(sql,/private\.student_can_read_assignment/);
  assert.match(sql,/private\.student_can_read_teaching_content/);
  assert.match(sql,/drop policy if exists student_content_assignments_select/);
  assert.match(sql,/drop policy if exists teaching_contents_select/);
  assert.match(sql,/security definer/);
  assert.doesNotMatch(sql,/disable row level security/i);
});

test('teaching search and quick creation remain available after administrative close',()=>{
  const finishedOpen=/c\.status in \('active','finished'\)[\s\S]*?c\.pedagogy_closed_at is null[\s\S]*?administrative_finished_at is not null/g;
  assert.ok((sql.match(finishedOpen) ?? []).length >= 2);
});
