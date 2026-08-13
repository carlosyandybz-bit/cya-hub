import fs from 'node:fs';
const path='docs/CYA_HUB_PLAN_MAESTRO_CIERRE.md';
let text=fs.readFileSync(path,'utf8');
const from='- `tests/documentation-consistency.test.mjs` debe fallar si una rama vuelve a declarar P24 como pendiente/actual o retrocede al estado P22/P23 anterior;';
const to='- `tests/documentation-consistency.test.mjs` debe fallar si una rama vuelve a declarar P25 como pendiente/actual o rompe la transición P25 cerrado → P26 siguiente;';
const count=text.split(from).length-1;
if(count!==1) throw new Error(`expected one stale gate line, got ${count}`);
text=text.replace(from,to);
fs.writeFileSync(path,text);
