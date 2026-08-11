import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("app/cya-app.tsx", "utf8");
const admin = fs.readFileSync("app/admin-view.tsx", "utf8");
const evalAdmin = fs.readFileSync("app/evaluation-admin.tsx", "utf8");
const evalEngine = fs.readFileSync("app/evaluation-engine.tsx", "utf8");
const migration = fs.readFileSync("supabase/v38-point12r-regression-polish.sql", "utf8");

test("live correction lifecycle exposes pending, in correction and corrected", () => {
  assert.match(app, /\["pending", "Pendiente de corrección"\]/);
  assert.match(app, /\["in_correction", "En corrección"\]/);
  assert.match(app, /\["corrected", "Corregida"\]/);
  assert.match(migration, /p_assignment_status not in \('pending','in_correction','corrected'\)/);
  assert.match(migration, /assignment_status in \('pending','in_correction','corrected','explained','active','completed'\)/);
});

test("Mejorado is a usable event and not a correction status", () => {
  assert.match(app, /recordEvent\(assignment\.content_id,'improved'\)/);
  assert.match(app, />↑ Mejorado<\/button>/);
  assert.doesNotMatch(app, /\["improved",\s*"Mejorad/);
  assert.doesNotMatch(migration, /p_assignment_status not in \([^)]*improved/);
});

test("global class search creates from the already typed title", () => {
  assert.match(app, /const title=search\.trim\(\)/);
  assert.match(app, /Crear nuevo: “\{search\.trim\(\)\}”/);
  assert.match(app, /Se reutiliza exactamente “\{search\.trim\(\)\}”/);
  assert.doesNotMatch(app, /quickTitle/);
  for (const kind of ["correction", "explanation", "exercise", "sequence"]) {
    assert.match(app, new RegExp(`<option value="${kind}">`));
  }
});

test("pedagogical summary has explicit student visibility without deleting class events", () => {
  assert.match(app, /visibleEventIds/);
  assert.match(app, /Mostrar al alumno/);
  assert.match(app, /close_class_pedagogy_v3/);
  assert.match(migration, /set visible_to_student=\(id=any\(v_ids\)\)/);
  assert.match(migration, /v_result:=public\.close_class_pedagogy_v2/);
});

test("pedagogical close preserves private media and reusable class-video flow", () => {
  assert.match(app, /Específico para el alumno/);
  assert.match(app, /<option value="reusable">Reutilizable<\/option>/);
  assert.match(app, /register_class_media_resource/);
  assert.match(app, /register_class_video_resource/);
  assert.match(app, /p_visibility_scope:'reusable'/);
  assert.match(app, /Vincular a contenido reutilizable/);
});

test("Point 12R is wired into live class, pedagogical close and admin", () => {
  assert.match(app, /InitialEvaluationQuiz/);
  assert.match(app, /ClassEvaluationClose/);
  assert.match(admin, /EvaluationAdminEditor/);
  assert.match(evalEngine, /data-evaluation-mode="diagnostic"/);
  assert.match(evalEngine, /data-evaluation-mode="review"/);
});

test("Bachata completes before optional Bachazouk evaluation", () => {
  assert.match(evalEngine, /complete_evaluation_v3/);
  assert.match(evalEngine, /let shouldAskComplement=false/);
  assert.match(evalEngine, /if\(!shouldAskComplement\)onCompleted\?\.\(\)/);
  assert.match(evalEngine, /Sí, sabe Bachazouk/);
  assert.match(evalEngine, /No sabe, pero quiere aprender/);
});

test("evaluation answers are administratively editable and still map to milestones", () => {
  assert.match(evalAdmin, /updateQuestionOption/);
  assert.match(evalAdmin, /Añadir respuesta/);
  assert.match(evalAdmin, /milestone_id:Number\(e\.target\.value\)/);
  assert.match(evalAdmin, /Puntuación interna/);
});

test("student radar does not expose internal scores", () => {
  assert.match(app, /showValues=\{false\}/);
  assert.match(app, /Valoración guardada/);
  assert.match(app, /sin compararte con otros alumnos/);
});

test("prior class workflows are still present", () => {
  assert.match(app, /function FinishClassModal/);
  assert.match(app, /administratively_finish_class_v6/);
  assert.match(app, /register_class_video_resource/);
  assert.match(app, /register_class_media_resource/);
  assert.match(app, /search_class_teaching_content/);
  assert.match(app, /function ClassPreparationStage/);
  assert.match(app, /function ClassPostAdministrative/);
});
