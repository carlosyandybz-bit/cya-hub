from pathlib import Path

p=Path('docs/CYA_HUB_PLAN_MAESTRO_CIERRE.md')
s=p.read_text()

# Header / executive state
s=s.replace('Versión: **3.5**','Versión: **3.6**',1)
s=s.replace('Última actualización secuencial cerrada: **P18 / v46**','Última actualización secuencial cerrada: **P19 / v47**',1)
s=s.replace('Adelantos/correctivos cerrados durante P18: **F42/P32 v44–v44e + P21 v45/resumen editable + transición de inicio de clase**','Adelantos/correctivos preservados: **F42/P32 v44–v44e + P21 v45/resumen editable + transición fiable de inicio + alta rápida provisional P19↔P21**',1)
s=s.replace('Siguiente actualización: **P19 — Alumnado + persona única + identidades**','Siguiente actualización: **P20 — Formularios versionados + datos canónicos**',1)

p18_bullet='- **P18 — Identidad, roles, navegación y “Ver como”, con cambio de vista autorizado en servidor mediante v46.**\n'
p19_bullet='- **P19 — Alumnado + persona única + identidades, lifecycle derivado y protección de identidad mediante v47.**\n'
if p19_bullet not in s:
    if p18_bullet not in s: raise SystemExit('P18 closed bullet anchor missing')
    s=s.replace(p18_bullet,p18_bullet+p19_bullet,1)

# Stale executive next-point block
old_next='''## 🟣 Siguiente punto

### P18 — Identidad, roles, navegación y “Ver como”

P18 debe consolidar la arquitectura multirol y la navegación definitiva antes de continuar con Alumnado, Formularios y Dar clase.
'''
new_next='''## 🟣 Siguiente punto

### P20 — Formularios versionados + datos canónicos

P20 debe convertir formularios y datos repetidos en un sistema reusable y versionado, apoyado en la persona canónica cerrada en P19. Debe auditar primero qué formularios históricos siguen aportando valor, reutilizar datos ya conocidos y evitar que una misma respuesta se almacene o pregunte dos veces.
'''
if old_next in s:
    s=s.replace(old_next,new_next,1)
elif '### P20 — Formularios versionados + datos canónicos' not in s.split('# 2. Gates permanentes')[0]:
    raise SystemExit('executive next-point anchor missing')

# P19 closure and evidence
s=s.replace('## P19 — Alumnado + persona única + identidades 🟣 SIGUIENTE','## P19 — Alumnado + persona única + identidades ✅ CERRADO',1)
rule_anchor='''### Regla cruzada con P21

En `Dar clase → Seleccionar alumno` debe existir:

`+ Crear alumno provisional`

sin abandonar el flujo. Al crearlo queda seleccionado y puede recibir clase, bono, evaluación y enseñanza inmediatamente.
'''
evidence=rule_anchor+'''
### Evidencia de cierre P19

- `public.people` queda como persona canónica; CRM, alumnado, Auth y operaciones se relacionan con el mismo `person_id`;
- el ciclo Potencial / Provisional / Registrado es **derivado**, no una columna mutable duplicada:
  - potencial = persona activa sin `student_profiles` activo;
  - provisional = ficha alumno activa sin `auth_user_id`;
  - registrado = ficha alumno activa con `auth_user_id`;
- `crm_stage` permanece separado como estado comercial;
- v47 normaliza email/teléfono y reutiliza una coincidencia única en altas CRM/alumnado;
- coincidencias ambiguas se bloquean: CYA no fusiona automáticamente dos personas distintas;
- advisory locks transaccionales reducen carreras de dos altas simultáneas de la misma identidad;
- `create_student`, `save_crm_contact` y `enable_provisional_student` conservan/reutilizan la persona existente;
- `save_person_identity` permite editar desde Alumnado nombre, apellidos, email, teléfono, país, objetivos, notas internas y salud sin crear otra ficha;
- `private.link_confirmed_student` vincula Auth a la persona existente cuando la coincidencia por email es inequívoca y ya no usa nombres genéricos como fallback;
- Marketing/CRM muestra Potencial / Provisional / Registrado aparte del estado comercial;
- `Dar clase → Empezar otra clase` permite `Crear alumno provisional` sin abandonar el flujo y lo selecciona tras crear/reutilizar la persona;
- el refresco de inicio de clase incluye Operaciones + Alumnado, mantiene Enseñanza secundaria y **Marketing sigue fuera** de la transición;
- dry-run autenticado v47 dentro de `BEGIN/ROLLBACK`: Potencial → Provisional reutilizó el mismo `person_id`, la edición conservó identidad y una colisión fue bloqueada;
- v47 aplicada en producción con ledger `20260811192818`;
- smoke autenticado posterior volvió a probar Potencial → Provisional sobre el mismo ID y el rollback dejó exactamente las 3 personas previas;
- PR #17 fusionada a `main` mediante squash commit `cb3ba79df13f46cf233290a8df6e37153d18a8d9`;
- CI final del mismo head: P19 6/6 + lint + build, P18 + build, resumen editable + build e inicio de clase + build, todos correctos;
- contrato técnico detallado en `docs/P19_PERSONA_UNICA_IDENTIDADES.md`.
'''
if '### Evidencia de cierre P19' not in s:
    if rule_anchor not in s: raise SystemExit('P19 evidence anchor missing')
    s=s.replace(rule_anchor,evidence,1)

s=s.replace('## P20 — Formularios versionados + datos canónicos ⏳','## P20 — Formularios versionados + datos canónicos 🟣 SIGUIENTE',1)

# P21 must explicitly revalidate P19 cross-flow.
s=s.replace('### Correctivos adelantados ya implementados durante P18','### Correctivos adelantados ya implementados durante P18/P19',1)
p21_intro='Estos cambios pertenecen funcionalmente a P21, pero fueron adelantados por incidencias bloqueantes y **deben revalidarse cuando P21 sea el paquete secuencial activo**:\n'
p21_extra='''Estos cambios pertenecen funcionalmente a P21, pero fueron adelantados por incidencias bloqueantes y **deben revalidarse cuando P21 sea el paquete secuencial activo**:

- P19 ya permite crear/reutilizar un provisional dentro de `Empezar otra clase`, refrescar Alumnado y seleccionarlo sin abandonar el flujo; P21 debe conservarlo y revalidarlo dentro del Dar clase definitivo;
'''
if p21_intro in s and 'P19 ya permite crear/reutilizar un provisional' not in s:
    s=s.replace(p21_intro,p21_extra,1)

# Final reset baseline wording.
s=s.replace('La infraestructura v44–v44d ya existe.','La infraestructura v44–v44e ya existe.',1)
s=s.replace('| F42 reset | ✅ base implementada v44–v44d; reauditoría final → P32 |','| F42 reset | ✅ base implementada v44–v44e; reauditoría final → P32 |',1)

# Functional map
s=s.replace('| F21–F25 Personas/Alumnado | → P19 + P20 + cruce P21 |','| F21–F25 Personas/Alumnado | ✅ persona/identidad base cerrada en P19; formularios → P20; alta rápida → revalidar P21 |',1)

# Correctives table rows
row='| `Ver como` solo confiaba en preferencia frontend | ✅ P18/v46; autorización de contexto en servidor sin escalada |\n'
add='''| `Ver como` solo confiaba en preferencia frontend | ✅ P18/v46; autorización de contexto en servidor sin escalada |
| CRM/Alumnado podían crear fichas duplicadas por la misma identidad | ✅ P19/v47; reutilización conservadora por email/teléfono y bloqueo de ambigüedad |
| Potencial / Provisional / Registrado podían convertirse en otro estado duplicado | ✅ P19; lifecycle derivado desde persona + ficha alumno + Auth |
| ficha de Alumnado no permitía editar datos canónicos | ✅ P19; editor de identidad sobre la misma persona |
| crear provisional obligaba a salir de Dar clase | ✅ P19↔P21; alta rápida in-flow implementada, revalidar en P21 |
'''
if row in s and 'CRM/Alumnado podían crear fichas duplicadas' not in s:
    s=s.replace(row,add,1)

# Remaining order
s=s.replace('**P19 → P20 → P21 → P22 → P23 → P24 → P25 → P26 → P27 → P28 → P29 → P30 → P31 → P32.**','**P20 → P21 → P22 → P23 → P24 → P25 → P26 → P27 → P28 → P29 → P30 → P31 → P32.**',1)
s=s.replace('Los adelantos F42/P32 y P21 realizados durante P18 **no modifican este orden**.','Los adelantos F42/P32 y P21 realizados durante P18/P19 **no modifican este orden**.',1)

# Permanent canonical-person rule.
master_rule='14. **El reinicio de datos nunca elimina Auth, roles de acceso, migraciones ni la configuración técnica necesaria para volver a entrar en CYA Hub.**\n'
if '15. **Una identidad humana se representa por una única persona canónica' not in s:
    if master_rule not in s: raise SystemExit('master rule anchor missing')
    s=s.replace(master_rule,master_rule+'15. **Una identidad humana se representa por una única persona canónica; habilitar CRM, alumno, Auth o nuevas capacidades no crea una ficha paralela.**\n16. **Potencial / Provisional / Registrado se deriva de datos reales; no se duplica como otro estado mutable que pueda desincronizarse.**\n',1)

p.write_text(s)
