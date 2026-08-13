import fs from 'node:fs';

function patchFile(path, patcher) {
  let text = fs.readFileSync(path, 'utf8');
  const original = text;
  const replaceOnce = (from, to, label) => {
    const count = text.split(from).length - 1;
    if (count !== 1) throw new Error(`${path} ${label}: expected 1 match, got ${count}`);
    text = text.replace(from, to);
  };
  const replaceRegexOnce = (regex, to, label) => {
    const matches = text.match(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g')) ?? [];
    if (matches.length !== 1) throw new Error(`${path} ${label}: expected 1 match, got ${matches.length}`);
    text = text.replace(regex, to);
  };
  patcher({replaceOnce, replaceRegexOnce, get: () => text, set: (v) => { text = v; }});
  if (text === original) throw new Error(`${path}: no changes produced`);
  fs.writeFileSync(path, text);
}

patchFile('docs/CYA_HUB_PLAN_MAESTRO_CIERRE.md', ({replaceOnce, get, set}) => {
  replaceOnce('Versión: **4.3**', 'Versión: **4.4**', 'version');
  replaceOnce('Última actualización secuencial cerrada: **P24 / v58–v59**', 'Última actualización secuencial cerrada: **P25 / v60–v62**', 'last closed');
  replaceOnce('Siguiente actualización funcional: **P25 — Misiones — pendiente de aprobación**', 'Siguiente actualización funcional: **P26 — Agenda + Google Calendar — pendiente de aprobación**', 'next package');
  replaceOnce('- **P0B ✅** — el documento permanece protegido por un check automático; la transición canónica vigente se actualiza deliberadamente a P24 cerrado → P25 siguiente.', '- **P0B ✅** — el documento permanece protegido por un check automático; la transición canónica vigente se actualiza deliberadamente a P25 cerrado → P26 siguiente.', 'p0b bullet');
  replaceOnce('- la transición canónica actual es **P24 cerrado → P25 siguiente / pendiente de aprobación**;', '- la transición canónica actual es **P25 cerrado → P26 siguiente / pendiente de aprobación**;', 'continuity transition');
  replaceOnce('- **P24 — Inicio contextual, v58 + v59; PR #41 + correctivo OIDC PR #42; QA final 36/36.**', '- **P24 — Inicio contextual, v58 + v59; PR #41 + correctivo OIDC PR #42; QA final 36/36.**\n- **P25 — Misiones + worker, v60 + v61 + v62; PR #44; QA final 38/38.**', 'closed list');

  const start = get().indexOf('## 🟣 SIGUIENTE PROPUESTA — PENDIENTE DE APROBACIÓN');
  const end = get().indexOf('## ⏳ FALTA DESPUÉS', start);
  if (start < 0 || end < 0) throw new Error('plan next proposal boundaries not found');
  const nextBlock = `## 🟣 SIGUIENTE PROPUESTA — PENDIENTE DE APROBACIÓN\n\n### P26 — Agenda + Google Calendar\n\nP26 todavía NO se ha iniciado. Debe cerrar la conexión y sincronización real con Google Calendar, external IDs, errores, conflictos e idempotencia sin destruir participantes, saldos, estado pedagógico ni historial. La propuesta completa se presenta a Carlos antes de modificar código, Supabase o calendarios reales.\n\n`;
  set(get().slice(0, start) + nextBlock + get().slice(end));

  replaceOnce('Una rama que vuelva a P24 como pendiente/actual o rompa la transición P24 cerrado → P25 siguiente debe quedar roja.', 'Una rama que vuelva a P25 como pendiente/actual o rompa la transición P25 cerrado → P26 siguiente debe quedar roja.', 'G4 transition');

  const p25Start = get().indexOf('# 8. P25 — Misiones + worker 🟣 SIGUIENTE / PENDIENTE DE APROBACIÓN');
  const p26Start = get().indexOf('# 9. P26 — Agenda + Google Calendar ⏳', p25Start);
  if (p25Start < 0 || p26Start < 0) throw new Error('P25/P26 section boundaries not found');
  const p25Closed = `# 8. P25 — Misiones + worker ✅ CERRADO\n\nAbsorbe F32–F33 y cierra CYA-AUD-003.\n\n- estado terminal \`expired\` + \`expired_at\`;\n- \`mark_not_done\` → \`not_done\`; \`expire\` → \`expired\`; \`repeat\` → histórico \`expired\` + una única siguiente ocurrencia \`upcoming\`;\n- posponer funciona como snooze y no reescribe \`due_at\`;\n- \`expired\` es histórico terminal y no puede reactivarse mediante \`act_on_mission\`;\n- zona horaria operativa configurable, actualmente \`Europe/Madrid\`;\n- motor server-side idempotente y Supabase Cron cada 15 minutos;\n- backfill real: 3 \`expire\` + 1 \`repeat\` dejaron de permanecer \`available\`; \`not_done\` permaneció inalterado;\n- Administración > Misiones muestra comportamiento de vencimiento con etiquetas humanas y configuración del motor;\n- v60/v61/v62 aplicadas; PR #44 integrado; Browser QA post-merge 38/38.\n\nContrato: \`docs/P25_MISIONES.md\`. No volver a abrir P25 salvo correctivo demostrado.\n\n---\n\n`;
  let updated = get().slice(0, p25Start) + p25Closed + get().slice(p26Start);
  updated = updated.replace('# 9. P26 — Agenda + Google Calendar ⏳', '# 9. P26 — Agenda + Google Calendar 🟣 SIGUIENTE / PENDIENTE DE APROBACIÓN');
  updated = updated.replace('Vistas: Día / Semana / Mes / Lista.', '**P26 no se ha iniciado. Requiere aprobación expresa de Carlos antes de modificar código, Supabase o Google Calendar.**\n\nVistas: Día / Semana / Mes / Lista.');
  set(updated);

  replaceOnce('| F32–F33 Misiones/worker | → P25 |', '| F32–F33 Misiones/worker | ✅ P25 |', 'F32-F33 map');
  replaceOnce('| misiones `expire` siguen `available` | → P25 |', '| misiones `expire` siguen `available` | ✅ P25 / CYA-AUD-003 cerrado |', 'mission issue map');
  replaceOnce('**P24 → P25 → P26 → P27 → P28 → P29 → P30 → P31 → P32.**', '**P26 → P27 → P28 → P29 → P30 → P31 → P32.**', 'immediate order');
  replaceOnce('Los correctivos de auditoría **P0A–P0E están cerrados**. El siguiente paquete funcional es **P24 — Inicio contextual**.', 'Los correctivos de auditoría **P0A–P0E están cerrados**. P24 y P25 también están cerrados. El siguiente paquete funcional es **P26 — Agenda + Google Calendar**, pendiente de aprobación.', 'next package footer');
});

patchFile('docs/CYA_HUB_AUDITORIA_VIVA_LANZAMIENTO.md', ({replaceOnce, replaceRegexOnce}) => {
  replaceOnce('Base funcional actual auditada: `main@50fda0cdbc554f33ae5b5ce0a0d6c6977e66f06f` + Supabase `CyA hub 2` (`ldvyeyhzrepaaouzavgs`)', 'Base funcional actual auditada: `main@e32bd7885f6e09df23098d61a267c48157974396` + Supabase `CyA hub 2` (`ldvyeyhzrepaaouzavgs`)', 'audit main');
  replaceOnce('Estado: **AUDITORÍA VIVA — P24 cerrado; P25 — Misiones es la siguiente propuesta pendiente de aprobación; todavía existen gates antes del release**', 'Estado: **AUDITORÍA VIVA — P25 cerrado; P26 — Agenda + Google Calendar es la siguiente propuesta pendiente de aprobación; todavía existen gates antes del release**', 'audit status');
  replaceOnce('- la transición canónica vigente es **P24 cerrado → P25 siguiente / pendiente de aprobación**;', '- la transición canónica vigente es **P25 cerrado → P26 siguiente / pendiente de aprobación**;', 'audit transition');
  replaceOnce('### Resultado actual post-P24 en `main`', '### Resultado actual post-P25 en `main`', 'QA heading');
  replaceOnce('Workflow `CYA QA E2E`, run **31652169267**, ejecutado sobre `main@50fda0cdbc554f33ae5b5ce0a0d6c6977e66f06f`:', 'Workflow `CYA QA E2E`, run **31658833258**, ejecutado sobre `main@e32bd7885f6e09df23098d61a267c48157974396`:', 'QA run');
  replaceOnce('- Playwright total: **36/36 passed**;', '- Playwright total: **38/38 passed**;', 'QA count');
  replaceOnce('- artifacts: **OK**, artifact `9163051155`.', '- artifacts: **OK**, artifact `9165485286`.', 'QA artifact');

  replaceRegexOnce(/^\| \*\*CYA-AUD-001\*\*.*$/m,
    '| **CYA-AUD-001** | Proceso / documentación | Alta | **RESUELTO — P0B / transición P25** | `P25_MISIONES.md` declara P25 cerrado y P26 siguiente; el Plan Maestro v4.4 queda canonizado a `P25 / v60–v62` cerrado y `P26 — Agenda + Google Calendar` pendiente de aprobación. `tests/documentation-consistency.test.mjs` protege la transición y CYA QA E2E ejecuta ese gate antes del navegador. | Mantener el gate y actualizarlo deliberadamente en cada cierre secuencial. |',
    'CYA-AUD-001');
  replaceRegexOnce(/^\| \*\*CYA-AUD-003\*\*.*$/m,
    '| **CYA-AUD-003** | Misiones | Media | **RESUELTO — P25** | v60/v61/v62 aplicadas. Las 3 instancias `expire` vencidas y la instancia `repeat` dejaron de permanecer `available`; `not_done` permaneció en 3; `repeat` creó una única sucesora `upcoming`; cron `cya-mission-engine` ejecutó autónomamente con estado `succeeded`. PR #44 y Browser QA post-merge 38/38. | Mantener `tests/p25-missions.test.mjs`, QA de Administración/Misiones y cron como regresión; reauditar globalmente en P32. |',
    'CYA-AUD-003');
  replaceRegexOnce(/^\| \*\*CYA-AUD-006\*\*.*$/m,
    '| **CYA-AUD-006** | QA release-wide | — | **EJECUTADO — 38/38** | Run post-merge P25 `31658833258`: documentación + Playwright 38/38, iPhone + desktop, P24 y P25, ciclo Profesor→Alumno→Admin y Administración/Misiones; artifact `9165485286`. | Mantener como gate real tras cada paquete relevante y en P32. |',
    'CYA-AUD-006');
  replaceRegexOnce(/^\| Misiones \| \*\*PARCIAL — BUG\*\*.*$/m,
    '| Misiones | **EXISTE / P25 CERRADO** | v60/v61/v62 + PR #44; estado `expired`, repeat sucesor, cron server-side y Admin verificados | Mantener cron/idempotencia como regresión. P26 no modifica semántica P25. |',
    'mission matrix');
});

console.log('P25 closure docs patched');
