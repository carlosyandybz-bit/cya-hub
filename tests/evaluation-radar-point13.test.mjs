import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const radar = fs.readFileSync('app/evaluation-radar.tsx','utf8');
const radarCss = fs.readFileSync('app/evaluation-radar.module.css','utf8');
const app = fs.readFileSync('app/cya-app.tsx','utf8');
const detail = fs.readFileSync('app/student-detail.tsx','utf8');

test('shared radar supports touch selection and five-level editing', () => {
  assert.match(radar, /export function EvaluationRadar/);
  assert.match(radar, /onClick=\{\(\) => select\(item\.id\)\}/);
  assert.match(radar, /aria-pressed=\{selected\.value === option\.score\}/);
  assert.match(radar, /onChange\?\.\(selected\.id, option\.score\)/);
  assert.match(radar, /pointMissing/);
  assert.match(radarCss, /grid-template-columns:repeat\(5/);
});

test('live class uses shared interactive radar and explicit level context', () => {
  assert.match(app, /import \{ EvaluationRadar \} from "\.\/evaluation-radar"/);
  assert.match(app, /evaluationRadarItems=aptitudes\.map/);
  assert.match(app, /<EvaluationRadar items=\{evaluationRadarItems\}/);
  assert.match(app, /save_class_evaluation_v2/);
  assert.match(app, /setEvaluations\(\(current\) => \[row,/);
  assert.match(app, /Nivel que estás evaluando/);
});

test('student detail uses the same component for capture and latest state', () => {
  assert.match(detail, /import \{ EvaluationRadar \} from "\.\/evaluation-radar"/);
  assert.match(detail, /items=\{evaluationAptitudes\.map/);
  assert.match(detail, /saveEvaluationCapture\(aptitudeId,score\)/);
  assert.match(detail, /items=\{radarItems\}.*readonly/s);
  assert.doesNotMatch(detail, /function StudentRadar\(/);
});

test('Point 13 does not implement history interaction yet', () => {
  assert.doesNotMatch(radar, /history|historial/i);
  assert.doesNotMatch(radar, /onHistory|openHistory/);
});
