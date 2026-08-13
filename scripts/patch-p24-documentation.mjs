import fs from 'node:fs';

function replaceExact(path, before, after, expected = 1) {
  const input = fs.readFileSync(path, 'utf8');
  const count = input.split(before).length - 1;
  if (count !== expected) throw new Error(`${path}: expected ${expected} occurrence(s), found ${count}: ${before.slice(0, 100)}`);
  fs.writeFileSync(path, input.replace(before, after));
}

const plan = 'docs/CYA_HUB_PLAN_MAESTRO_CIERRE.md';
const audit = 'docs/CYA_HUB_AUDITORIA_VIVA_LANZAMIENTO.md';
const test = 'tests/documentation-consistency.test.mjs';

replaceExact(plan, 'Versión: **4.2**', 'Versión: **4.3**');
replaceExact(plan, 'Fecha de corte: **2026-08-12**', 'Fecha de corte: **2026-08-13**');
replaceExact(plan, 'Última actualización secuencial cerrada: **P23 / v51**', 'Última actualización secuencial cerrada: **P24 / v58–v59**');
replaceExact(plan, 'Siguiente actualización funcional: **P24 — Inicio contextual**', 'Siguiente actualización funcional: **P25 — Misiones — pendiente de aprobación**');
replaceExact(plan, '- **P0B ✅** — este documento queda canonizado a P23 cerrado → P24 actual y protegido por un check automático de consistencia documental.', '- **P0B ✅** — el documento permanece protegido por un check automático; la transición canónica vigente se actualiza deliberadamente a P24 cerrado → P25 siguiente.');
replaceExact(plan,
`- la transición canónica actual es **P23 cerrado → P24 actual**;
- \`tests/documentation-consistency.test.mjs\` debe fallar si una rama vuelve a introducir el estado P22/P23 anterior;
- cuando P24 se cierre, la transición se actualizará explícitamente en el cierre de P24 y en este test. Nunca se avanza o retrocede por un merge accidental.`,
`- la transición canónica actual es **P24 cerrado → P25 siguiente / pendiente de aprobación**;
- \`tests/documentation-consistency.test.mjs\` debe fallar si una rama vuelve a declarar P24 como pendiente/actual o retrocede al estado P22/P23 anterior;
- cualquier avance posterior a P25 se actualizará explícitamente en el cierre del paquete correspondiente y en este test. Nunca se avanza o retrocede por un merge accidental.`);
replaceExact(plan, '- **P23 — Enseñanza + relaciones + árboles, v51.**', '- **P23 — Enseñanza + relaciones + árboles, v51.**\n- **P24 — Inicio contextual, v58 + v59; PR #41 + correctivo OIDC PR #42; QA final 36/36.**');
replaceExact(plan,
`## 🟣 AHORA

### P24 — Inicio contextual

P24 debe convertir Inicio en un lanzador inteligente del día: saludo, frase diaria persistente, siguiente acción, misiones visibles, agenda, avisos, accesos rápidos y resumen del día. Una clase próxima debe dominar Inicio 30 minutos antes, sin absorber todavía el motor servidor completo de Misiones que pertenece a P25.

## ⏳ FALTA DESPUÉS

**P25 → P26 → P27 → P28 → P29 → P30 → P31 → P32.**`,
`## 🟣 SIGUIENTE PROPUESTA — PENDIENTE DE APROBACIÓN

### P25 — Misiones

P25 todavía NO se ha iniciado. La auditoría real confirma que debe cerrar la semántica de vencimiento/\`failure_behavior\`, automatización server-side, estados y configuración del motor de Misiones. La propuesta completa se presenta a Carlos antes de modificar código o Supabase.

## ⏳ FALTA DESPUÉS

**P26 → P27 → P28 → P29 → P30 → P31 → P32.**`);
replaceExact(plan, 'Una rama que vuelva a P23 como pendiente o rompa la transición P23 cerrado → P24 actual debe quedar roja.', 'Una rama que vuelva a P24 como pendiente/actual o rompa la transición P24 cerrado → P25 siguiente debe quedar roja.');
replaceExact(plan, '# 4. Evidencia de P17–P23 cerrados', '# 4. Evidencia de P17–P24 cerrados');
replaceExact(plan,
`Contrato: \`docs/P23_ENSENANZA_RELACIONES_ARBOLES.md\`.

---

# 5. P22 — Portal del alumno ✅ CERRADO`,
`Contrato: \`docs/P23_ENSENANZA_RELACIONES_ARBOLES.md\`.

## P24 — Inicio contextual ✅ CERRADO

- v58 ledger \`20260812214733\` + v59 ledger \`20260812214904\`;
- prioridad canónica: clase activa → clase ≤30 min → misión;
- reloj vivo, saludo Madrid y transición exacta 31→30 minutos sin recarga;
- frase diaria persistida por usuario+fecha con snapshot inmutable y rotación segura sobre las 15 frases existentes;
- Administración > General incorpora gestión de frases, fecha/recurrencia, preview y CSV con conflictos;
- \`home_snapshot()\` y \`preview_daily_quote(date)\` son SECURITY INVOKER; anon sin EXECUTE;
- PR #41 funcional + PR #42 hardening OIDC para repositorio público;
- \`cya-qa-bootstrap\` v6 ACTIVE y restringido a propietario o dispatch interno exacto de main;
- certificación final \`main@50fda0cdbc554f33ae5b5ce0a0d6c6977e66f06f\`: gate P24 \`31652164663\` PASS y Browser QA \`31652169267\` = 36/36;
- artifact final \`9163051155\`;
- producción/Hostinger G1 continúa como gate independiente P32.

Contrato: \`docs/P24_INICIO_CONTEXTUAL.md\`.

---

# 5. P22 — Portal del alumno ✅ CERRADO`);
replaceExact(plan,
`# 7. P24 — Inicio contextual 🟣 AHORA

Inicio = lanzador inteligente.

Debe incluir:

- saludo por franja horaria y nombre;
- frase diaria persistente;
- siguiente acción;
- misiones;
- agenda/calendario;
- avisos;
- accesos rápidos;
- resumen del día.

Clase próxima domina Inicio **30 minutos antes**.

Frases:

- mañana 05:00–11:59;
- tarde 12:00–19:59;
- noche 20:00–04:59;
- activar/desactivar;
- CSV;
- fecha específica;
- evitar duplicados;
- preview.`,
`# 7. P24 — Inicio contextual ✅ CERRADO

P24 queda cerrado por la evidencia del apartado 4 y el contrato \`docs/P24_INICIO_CONTEXTUAL.md\`. No volver a abrirlo salvo correctivo demostrado.

Inicio responde a «qué toca hacer ahora» con reloj vivo, saludo contextual, frase diaria persistida, una única acción dominante, resumen del día y accesos rápidos. Una clase realmente activa domina siempre; una clase programada domina desde 30 minutos o menos; a 31 minutos no desplaza una misión. P25 conserva la responsabilidad exclusiva sobre la semántica del motor de Misiones.`);
replaceExact(plan, '# 8. P25 — Misiones + worker ⏳', '# 8. P25 — Misiones + worker 🟣 SIGUIENTE / PENDIENTE DE APROBACIÓN');
replaceExact(plan, 'Absorbe F32–F33.\n\nTipos: principal / diaria / crecimiento.', 'Absorbe F32–F33.\n\n**P25 no se ha iniciado. Requiere aprobación expresa de Carlos antes de modificar código, Supabase o datos.**\n\nTipos: principal / diaria / crecimiento.');

replaceExact(audit, 'Fecha de corte: **2026-08-12**', 'Fecha de corte: **2026-08-13**');
replaceExact(audit, 'Base funcional post-P0E auditada: `main@a1697c4d573e381064e0d3dc5084a77202cb6634` + Supabase `CyA hub 2` (`ldvyeyhzrepaaouzavgs`)', 'Base funcional actual auditada: `main@50fda0cdbc554f33ae5b5ce0a0d6c6977e66f06f` + Supabase `CyA hub 2` (`ldvyeyhzrepaaouzavgs`)');
replaceExact(audit, 'Estado: **AUDITORÍA P0 VIVA — P0A/P0B/P0C/P0D/P0E cerrados; P24 — Inicio contextual es el siguiente paquete; todavía existen gates antes del release**', 'Estado: **AUDITORÍA VIVA — P24 cerrado; P25 — Misiones es la siguiente propuesta pendiente de aprobación; todavía existen gates antes del release**');
replaceExact(audit, '- la transición canónica vigente es **P23 cerrado → P24 actual**;', '- la transición canónica vigente es **P24 cerrado → P25 siguiente / pendiente de aprobación**;');
replaceExact(audit, '### Resultado actual post-P0E en `main`', '### Resultado actual post-P24 en `main`');
replaceExact(audit, 'Workflow `CYA QA E2E`, run **31610773094**, ejecutado sobre `main@a1697c4d573e381064e0d3dc5084a77202cb6634`:', 'Workflow `CYA QA E2E`, run **31652169267**, ejecutado sobre `main@50fda0cdbc554f33ae5b5ce0a0d6c6977e66f06f`:');
replaceExact(audit, '- gate documental: **2/2**;\n- lint: **0 errores / 24 warnings no bloqueantes**;\n- build Next.js: **OK**;\n- servidor local: **OK**;\n- Playwright total: **26/26 passed**;', '- gate documental: **2/2**;\n- lint: **0 errores / 25 warnings no bloqueantes**;\n- build Next.js: **OK**;\n- servidor local: **OK**;\n- Playwright total: **36/36 passed**;');
replaceExact(audit, '- artifacts: **OK**, artifact `9147197152`.', '- artifacts: **OK**, artifact `9163051155`.');
replaceExact(audit, '| **CYA-AUD-001** | Proceso / documentación | Alta | **RESUELTO — P0B** | `P23_ENSENANZA_RELACIONES_ARBOLES.md` declara P23 cerrado y P24 siguiente; el Plan Maestro v4.1 queda canonizado a `P23 / v51` cerrado y `P24 — Inicio contextual` actual. `tests/documentation-consistency.test.mjs` comprueba la transición y el workflow `CYA QA E2E` lo ejecuta antes del QA de navegador. | Mantener el gate; cuando P24 cierre, actualizar deliberadamente cierre + Plan + test en la misma transición. |', '| **CYA-AUD-001** | Proceso / documentación | Alta | **RESUELTO — P0B / transición P24** | `P24_INICIO_CONTEXTUAL.md` declara P24 cerrado y P25 siguiente; el Plan Maestro v4.3 queda canonizado a `P24 / v58–v59` cerrado y `P25 — Misiones` pendiente de aprobación. `tests/documentation-consistency.test.mjs` protege la transición y el workflow `CYA QA E2E` lo ejecuta antes del navegador. | Mantener el gate y actualizarlo deliberadamente en cada cierre secuencial. |');
replaceExact(audit, '| **CYA-AUD-003** | Misiones | Media | **ABIERTO — BUG CONFIRMADO** | Misiones diarias del 10 y 11/08 permanecen `available` tras vencer. `daily.review_information` usa `failure_behavior=\'expire\'`, pero `refresh_missions()` solo procesa vencimiento cuando el comportamiento es `mark_not_done`. | Implementar semántica `expire` explícita y backfill seguro de vencidas. P25. |', '| **CYA-AUD-003** | Misiones | Media | **ABIERTO — BUG CONFIRMADO** | Corte 13/08: 3 misiones vencidas de `daily.review_information` con `failure_behavior=\'expire\'` siguen `available`; además existe 1 `daily.complete_internal_content` vencida con `failure_behavior=\'repeat\'` aún `available`. `refresh_missions()` solo implementa la transición vencida `mark_not_done`. | P25 debe definir `expire` y `repeat`, automatización server-side y backfill seguro sin borrar historial. |');
replaceExact(audit, '| **CYA-AUD-006** | QA release-wide | — | **EJECUTADO — 26/26** | Run post-merge P0E `31610773094`: documentación 2/2 + Playwright 26/26, iPhone + desktop, ciclo Profesor→Alumno→Admin, build y artifact `9147197152` verdes. | Mantener como gate real tras cada paquete relevante y en P32. |', '| **CYA-AUD-006** | QA release-wide | — | **EJECUTADO — 36/36** | Run post-merge P24 `31652169267`: documentación 2/2 + Playwright 36/36, iPhone + desktop, ciclo Profesor→Alumno→Admin, frontera 31/30, saludo Madrid, frase estable tras reload y Administración de frases; artifact `9163051155`. | Mantener como gate real tras cada paquete relevante y en P32. |');
replaceExact(audit, '| Inicio contextual | **PARCIAL AVANZADO / P24 ACTUAL** | `HomeView`, `home_snapshot`, saludo, próxima acción, misiones, agenda, accesos | Revalidar contrato completo de frases/administración y clase dominante a 30 min. |', '| Inicio contextual | **EXISTE / P24 CERRADO** | v58/v59 + PR #41/#42 + Browser QA 36/36 | Mantener regresión; P25 modifica Misiones, no la prioridad P24. |');
replaceExact(audit, '| Frases diarias | **PARCIAL** | Tabla `daily_quotes` con 15 registros; Home consume quote/snapshot | Cerrar administración/CSV/fechas/no repetición/preview según P24. |', '| Frases diarias | **EXISTE / P24 CERRADO** | 15 frases preservadas + `daily_quote_assignments`; Admin General + CSV/preview/fecha/recurrencia | Mantener integridad usuario+fecha, snapshots y privilegios v59. |');
replaceExact(audit, '- **24 warnings**.', '- **25 warnings**.');
replaceExact(audit, '2. **P0B / CYA-AUD-001 — ✅ CERRADO**: Plan Maestro P23 cerrado → P24 actual + gate documental en CI.', '2. **P0B / CYA-AUD-001 — ✅ CERRADO**: gate documental actualizado deliberadamente a P24 cerrado → P25 siguiente.');
replaceExact(audit, '6. P24 — cerrar Inicio contextual.\n7. P25 — corregir `expire` y cerrar Misiones/worker.', '6. **P24 — ✅ CERRADO**: Inicio contextual, v58/v59, PR #41/#42 y Browser QA 36/36.\n7. **P25 — SIGUIENTE / PENDIENTE DE APROBACIÓN**: definir `expire`/`repeat` y cerrar Misiones/worker.');
replaceExact(audit, '- P24–P32 formalmente cerrados con evidencia.', '- P25–P32 formalmente cerrados con evidencia.');
replaceExact(audit, 'Los correctivos P0A–P0E están cerrados. La secuencia funcional continúa en **P24 — Inicio contextual**.', 'P24 está cerrado y protegido por QA. La siguiente propuesta es **P25 — Misiones**, todavía pendiente de aprobación expresa.');

fs.writeFileSync(test, `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport fs from 'node:fs';\n\nconst read = (path) => fs.readFileSync(path, 'utf8');\nconst plan = read('docs/CYA_HUB_PLAN_MAESTRO_CIERRE.md');\nconst p23 = read('docs/P23_ENSENANZA_RELACIONES_ARBOLES.md');\nconst p24 = read('docs/P24_INICIO_CONTEXTUAL.md');\nconst audit = read('docs/CYA_HUB_AUDITORIA_VIVA_LANZAMIENTO.md');\n\ntest('P23 historical handoff and P24 closure stay canonical', () => {\n  assert.match(p23, /Estado: \\*\\*P23 CERRADO/);\n  assert.match(p23, /Siguiente paquete: \\*\\*P24 — Inicio contextual\\*\\*/);\n  assert.match(p24, /Estado: \\*\\*P24 CERRADO EN MAIN \\/ SUPABASE\\*\\*/);\n  assert.match(p24, /Siguiente paquete: \\*\\*P25 — Misiones — pendiente de aprobación\\*\\*/);\n  assert.match(plan, /Versión: \\*\\*4\\.3\\*\\*/);\n  assert.match(plan, /Última actualización secuencial cerrada: \\*\\*P24 \\/ v58–v59\\*\\*/);\n  assert.match(plan, /Siguiente actualización funcional: \\*\\*P25 — Misiones — pendiente de aprobación\\*\\*/);\n  assert.match(plan, /# 7\\. P24 — Inicio contextual ✅ CERRADO/);\n  assert.match(plan, /# 8\\. P25 — Misiones \\+ worker 🟣 SIGUIENTE \\/ PENDIENTE DE APROBACIÓN/);\n  assert.doesNotMatch(plan, /P24 — Inicio contextual 🟣 AHORA/);\n  assert.doesNotMatch(plan, /Siguiente actualización(?: funcional)?: \\*\\*P24/);\n});\n\ntest('P0 closures and P24 evidence remain protected', () => {\n  for (const token of ['P0A ✅','P0B ✅','P0C ✅','P0D ✅','P0E ✅']) assert.match(plan, new RegExp(token));\n  assert.match(audit, /CYA-AUD-001[\\s\\S]*?\\*\\*RESUELTO — P0B \\/ transición P24\\*\\*/);\n  assert.match(audit, /CYA-AUD-005[\\s\\S]*?\\*\\*RESUELTO/);\n  assert.match(audit, /CYA-AUD-007[\\s\\S]*?\\*\\*RESUELTO — P0C\\*\\*/);\n  assert.match(audit, /CYA-AUD-008[\\s\\S]*?\\*\\*RESUELTO — P0A\\*\\*/);\n  assert.match(audit, /CYA-AUD-013[\\s\\S]*?\\*\\*RESUELTO — P0E\\/v53\\*\\*/);\n  assert.match(audit, /31652169267/);\n  assert.match(audit, /9163051155/);\n  assert.match(audit, /P25 — Misiones/);\n  assert.doesNotMatch(audit, /Inicio contextual \\| \\*\\*PARCIAL/);\n  assert.doesNotMatch(plan, /P25 no se ha iniciado[^\\n]*aprobado/i);\n});\n`);

console.log('P24 documentation transition patched successfully');
