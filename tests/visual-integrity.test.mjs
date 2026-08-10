import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const globalCss = fs.readFileSync('app/globals.css', 'utf8');
const studentCss = fs.readFileSync('app/student-detail.module.css', 'utf8');

function tinyFonts(css) {
  return [...css.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)]
    .map((match) => Number(match[1]))
    .filter((value) => value < 11.5);
}

test('primary UI styles contain no illegibly tiny fonts', () => {
  assert.deepEqual(tinyFonts(globalCss), []);
  assert.deepEqual(tinyFonts(studentCss), []);
});

test('mobile modals are centered rather than bottom sheets', () => {
  assert.ok(globalCss.includes('/* v23 · integridad visual y móvil */'));
  assert.ok(studentCss.includes('/* v23 · ficha centrada y táctil */'));
  assert.equal(globalCss.includes('.backdrop { align-items:end; padding:8px; }'), false);
  assert.equal(studentCss.includes('.backdrop{align-items:end;padding:7px}'), false);
  assert.equal(studentCss.includes('.modal{width:100vw;height:100dvh'), false);
});

test('visual integrity layer protects iPhone safe areas and touch targets', () => {
  assert.ok(globalCss.includes('env(safe-area-inset-bottom)'));
  assert.ok(globalCss.includes('button:not(.switch),summary'));
  assert.ok(globalCss.includes('min-height:44px'));
  assert.ok(globalCss.includes('font-size:16px!important'));
  assert.ok(globalCss.includes('body:has([role="dialog"]){overflow:hidden}'));
});

test('page shell prevents accidental viewport overflow', () => {
  assert.ok(globalCss.includes('html,body{max-width:100%;overflow-x:hidden}'));
});
