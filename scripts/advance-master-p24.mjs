import fs from 'node:fs';

const path='docs/CYA_HUB_PLAN_MAESTRO_CIERRE.md';
let s=fs.readFileSync(path,'utf8');
function rep(a,b,label){if(!s.includes(a))throw new Error(`No se encontró ${label}`);s=s.replace(a,b)}

rep('Versión: **3.9**','Versión: **4.0**','versión');
rep('Última actualización secuencial cerrada: **P22 / v50 + v50b**','Última actualización secuencial cerrada: **P23 / v51**','último cierre');
rep('Siguiente actualización: **P23 — Enseñanza + relaciones + árboles**','Siguiente actualización: **P24 — Inicio contextual**','siguiente actualización');
rep('- **P22 — Portal del alumno, v50 + v50b.**','- P22 — Portal del alumno, v50 + v50b.\n- **P23 — Enseñanza + relaciones + árboles, v51.**','lista cerrados');
rep('### P23 — Enseñanza + relaciones + árboles\n\nP23 debe cerrar el modelo pedagógico de Correcciones, Explicaciones, Ejercicios y Secuencias, sus categorías/etiquetas/relaciones, multimedia externa y los ocho árboles táctiles por estilo/rol, sin mezclar asignaciones personales ni convertir vídeos de clase en nodos pedagógicos automáticamente.','### P24 — Inicio contextual\n\nP24 debe convertir Inicio en un lanzador inteligente del día: saludo, frase diaria persistente, siguiente acción, agenda, avisos y accesos rápidos. Una clase próxima debe dominar Inicio 30 minutos antes, sin absorber todavía el motor servidor de Misiones que pertenece a P25.','bloque AHORA');
rep('**P24 → P25 → P26 → P27 → P28 → P29 → P30 → P31 → P32.**','**P25 → P26 → P27 → P28 → P29 → P30 → P31 → P32.**','faltan después');
rep('# 6. P23 — Enseñanza + relaciones + árboles 🟣 AHORA','# 6. P23 — Enseñanza + relaciones + árboles ✅ CERRADO','cabecera P23');
rep('Gate P23:\n\n- CRUD de cuatro tipos sin campos impropios;\n- categorías/etiquetas coherentes;\n- relaciones bidireccionales/dirigidas según contrato;\n- homólogas Leader/Follower verificadas;\n- ejercicios en pareja solo en Ejercicios;\n- secuencias y pasos ordenables;\n- media Drive autorizada sin crear nodos automáticos;\n- ocho árboles derivados del mismo grafo canónico, no ocho bases paralelas;\n- RLS profesor/alumno correcta;\n- iPhone + desktop;\n- regresión P17–P22.','Cierre P23:\n\n- v51 ledger `20260812031009`;\n- backend PR #28 → `4e95cdb5ee909391b51c33abea6d1c5baa7d41ce`;\n- frontend PR #29 → `f94eb1a6c154515f68659f29facf15903af227c8`;\n- head final QA `a8f9e17193f47d83f2e4c7320200ab5703f7b6c3`;\n- workflow P23 `31559914700` y regresión P17–P23 completas en success;\n- G1 Hostinger run `31560051530` → `p23-teaching-graph-v51-ready`;\n- ocho árboles derivados de un único grafo canónico;\n- Ruta, pan/zoom/centrar/reset/atrás y filtros táctiles activos;\n- Necesita pareja solo para Ejercicios y autoridad servidor verificada;\n- homólogas Leader/Follower y Secuencias protegidas por v51;\n- multimedia permanece fuera de la generación automática del grafo;\n- sin blocker nuevo de Advisors atribuible a P23.\n\nContrato: `docs/P23_ENSENANZA_RELACIONES_ARBOLES.md`.','gate P23');
rep('# 7. P24 — Inicio contextual ⏳','# 7. P24 — Inicio contextual 🟣 AHORA','cabecera P24');
rep('| F16–F20 Enseñanza | → P23 |','| F16–F20 Enseñanza | ✅ P23 |','mapa F16-F20');
rep('**P23 → P24 → P25 → P26 → P27 → P28 → P29 → P30 → P31 → P32.**','**P24 → P25 → P26 → P27 → P28 → P29 → P30 → P31 → P32.**','orden inmediato');
rep('No volver a P22 salvo un correctivo demostrado.','No volver a P23 salvo un correctivo demostrado.','regla de retorno');
fs.writeFileSync(path,s);
console.log('Master avanzado a P24.');
