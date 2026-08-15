import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const shell=fs.readFileSync("app/cya-app.tsx","utf8");const css=fs.readFileSync("app/p36-teaching.css","utf8");const layout=fs.readFileSync("app/layout.tsx","utf8");
test("P36 teaching preserves three work modes and four content families",()=>{for(const label of ["Biblioteca","Enseñar alumnos","Mapa","Correcciones","Explicaciones","Ejercicios","Secuencias"])assert.match(shell,new RegExp(label));});
test("P36 teaching uses responsive semantic hierarchy",()=>{assert.match(layout,/import "\.\/p36-teaching\.css"/);assert.match(css,/\.teaching-switch\{display:grid/);assert.match(css,/\.teaching-kind-grid\{display:grid/);assert.match(css,/\.graph-tree-presets\{display:grid!important/);assert.match(css,/var\(--cya-warning-soft\)/);});
test("P36 teaching removes map carousels",()=>{assert.match(css,/@media\(max-width:760px\)/);assert.doesNotMatch(css,/graph-tree-presets[^}]*overflow-x:\s*auto/i);assert.doesNotMatch(css,/graph-actions[^}]*overflow-x:\s*auto/i);assert.doesNotMatch(css,/#ffff00|yellow/i);});
