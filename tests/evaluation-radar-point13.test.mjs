import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const radar = fs.readFileSync('app/evaluation-radar.tsx','utf8');
const radarCss = fs.readFileSync('app/evaluation-radar.module.css','utf8');
const app = fs.readFileSync('app/cya-app.tsx','utf8');
const detail = fs.readFileSync('app/student-detail.tsx','utf8');
const panel = fs.readFileSync('app/context-evaluation-panel-p0f.tsx','utf8');

test('shared radar supports touch selection and five-level editing', () => {
  assert.match(radar, /export function EvaluationRadar/);
  assert.match(radar, /onClick=\{\(\) => select\(item\.id\)\}/);
  assert.match(radar, /aria-pressed=\{selected\.value === option\.score\}/);
  assert.match(radar, /onChange\?\.\(selected\.id, option\.score\)/);
  assert.match(radar, /pointMissing/);
  assert.match(radarCss, /grid-template-columns:repeat\(5/);
});

test('live class uses the current contextual milestone evaluator with explicit context', () => {
  assert.match(app, /import \{ ContextEvaluationPanel \} from "\.\/context-evaluation-panel-p0f"/);
  assert.match(app, /styleTermId=\{item\.style_term_id\}/);
  assert.match(app, /roleTermId=\{participant\.role_term_id\}/);
  assert.match(app, /levelTermId=\{participant\.level_term_id\}/);
  assert.match(panel, /Hito actual/);
  assert.match(panel, /start_context_evaluation/);
});

test('student detail uses the contextual engine for capture and the shared radar for latest state', () => {
  assert.match(detail, /import \{ EvaluationRadar \} from "\.\/evaluation-radar"/);
  assert.match(detail, /import \{ ContextEvaluationPanel \} from "\.\/context-evaluation-panel-p0f"/);
  assert.match(detail, /<ContextEvaluationPanel client=\{client\}/);
  assert.match(detail, /items=\{radarItems\}.*readonly/s);
  assert.doesNotMatch(detail, /saveEvaluationCapture|startEvaluationCapture/);
  assert.doesNotMatch(detail, /function StudentRadar\(/);
});

test('Point 13 does not implement history interaction yet', () => {
  assert.doesNotMatch(radar, /history|historial/i);
  assert.doesNotMatch(radar, /onHistory|openHistory/);
});
