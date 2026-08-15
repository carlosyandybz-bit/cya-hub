import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const legacy=fs.readFileSync("app/marketing-view-legacy.tsx","utf8");const css=fs.readFileSync("app/p36-marketing.css","utf8");const layout=fs.readFileSync("app/layout.tsx","utf8");
test("P36 marketing preserves six visible work areas",()=>{for(const label of ["CRM","Contenido","Campañas","Mensajes","Eventos","Tarifas"])assert.match(legacy,new RegExp(label));assert.match(legacy,/crm-pipeline/);assert.match(legacy,/Nuevo contacto/);});
test("P36 marketing replaces horizontal navigation with grids",()=>{assert.match(layout,/import "\.\/p36-marketing\.css"/);assert.match(css,/\.marketing-tabs\{display:grid!important/);assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);assert.doesNotMatch(css,/marketing-tabs[^}]*overflow-x:\s*auto/i);assert.doesNotMatch(css,/crm-pipeline[^}]*overflow-x:\s*auto/i);});
test("P36 CRM states are semantic and touch safe",()=>{for(const token of ["--cya-info-soft","--cya-warning-soft","--cya-success-soft","--cya-danger-soft"])assert.match(css,new RegExp(token));assert.match(css,/\.crm-row-actions \.btn,\.crm-row-actions \.icon-btn\{min-height:44px\}/);assert.doesNotMatch(css,/#ffff00|yellow/i);});
