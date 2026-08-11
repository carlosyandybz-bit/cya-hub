from pathlib import Path

p=Path('docs/CYA_HUB_PLAN_MAESTRO_CIERRE.md')
s=p.read_text()
s=s.replace('Versión: **3.4**','Versión: **3.5**',1)
s=s.replace('Última actualización secuencial cerrada: **P17 / v43**','Última actualización secuencial cerrada: **P18 / v46**',1)
s=s.replace('Punto secuencial activo: **P18 — Identidad, roles, navegación y “Ver como”**','Siguiente actualización: **P19 — Alumnado + persona única + identidades**',1)
closed='- **P17 — Evaluaciones: reconciliación, frontend guiado, runtime Hostinger demostrado y migración v43 aplicada en producción.**\n'
if '- **P18 — Identidad, roles, navegación y “Ver como”, con cambio de vista autorizado en servidor mediante v46.**' not in s:
    s=s.replace(closed,closed+'- **P18 — Identidad, roles, navegación y “Ver como”, con cambio de vista autorizado en servidor mediante v46.**\n',1)
s=s.replace('## P18 — Identidad, roles, navegación y “Ver como” 🟣 ACTIVO','## P18 — Identidad, roles, navegación y “Ver como” ✅ CERRADO',1)
anchor='''### Debe cerrar

- una sola persona puede ser profesor + alumno + admin si está autorizada;
- `Ver como` Profesor / Alumno / Administrador sin escalada de privilegios;
- servidor verifica permisos reales;
- barra móvil definitiva:
  `Inicio | Alumnado | DAR CLASE | Enseñanza | Marketing`;
- DAR CLASE central, mayor y elevado;
- sin hamburguesa para funciones clave;
- escritorio con arquitectura equivalente;
- acceso claro a Administración, cuenta y preferencias;
- historial atrás coherente en todas las pantallas.
'''
evidence=anchor+'''
### Evidencia de cierre P18

- la identidad real vinculada en producción soporta simultáneamente roles `admin`, `teacher` y `student` sobre una única persona;
- `identity_context()` deriva `can_admin`, `can_teach` y `can_study` desde permisos reales de servidor;
- v46 `set_experience_context` valida en servidor Profesor / Alumno / Administrador antes de persistir la vista;
- v46 solo escribe `user_preferences.preferred_context`: no crea, modifica ni eleva `app_member_roles`;
- la UI usa `Ver como` y solo ofrece contextos autorizados;
- Portal Alumno y Administración mantienen guards explícitos de permiso;
- barra móvil definitiva de cinco accesos y DAR CLASE central/elevado preservados;
- escritorio comparte la misma arquitectura de navegación;
- historial real mediante `pushState`/`popstate` preservado;
- migración v46 aplicada en producción con ledger `20260811183128`;
- dry-run autenticado validó los tres contextos para una identidad multirol sin modificar roles;
- CI final sobre el mismo head: regresiones P18 5/5, lint de AccountMenu y build Next.js correctos;
- los workflows de resumen editable y comenzar clase también quedaron verdes sobre el head final de P18.
'''
if '### Evidencia de cierre P18' not in s:
    s=s.replace(anchor,evidence,1)
s=s.replace('## P19 — Alumnado + persona única + identidades ⏳','## P19 — Alumnado + persona única + identidades 🟣 SIGUIENTE',1)
s=s.replace('| F2 navegación atrás | ✅ base cerrada / P18 consolida |','| F2 navegación atrás | ✅ cerrado y consolidado en P18 |',1)
s=s.replace('| F4 avatar/perfil/preferencias/portal | ✅ base cerrada / P18 consolida multirol |','| F4 avatar/perfil/preferencias/portal | ✅ multirol consolidado en P18 |',1)
s=s.replace('**P18 → P19 → P20 → P21 → P22 → P23 → P24 → P25 → P26 → P27 → P28 → P29 → P30 → P31 → P32.**','**P19 → P20 → P21 → P22 → P23 → P24 → P25 → P26 → P27 → P28 → P29 → P30 → P31 → P32.**',1)
if '| `Ver como` solo confiaba en preferencia frontend |' not in s:
    marker='| comenzar clase podía quedarse en `Abriendo…` por refrescos ajenos | ✅ correctivo adelantado P21; transición operativa desacoplada de Marketing |\n'
    s=s.replace(marker,marker+'| `Ver como` solo confiaba en preferencia frontend | ✅ P18/v46; autorización de contexto en servidor sin escalada |\n',1)
p.write_text(s)
