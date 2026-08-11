from pathlib import Path

path=Path('docs/CYA_HUB_PLAN_MAESTRO_CIERRE.md')
text=path.read_text()

text=text.replace('Versión: **3.3**','Versión: **3.4**',1)
text=text.replace(
    'Adelanto controlado cerrado: **F42 / P32 — borrado y reinicio seguro v44–v44d**  \nSiguiente actualización: **P18 — Identidad, roles, navegación y “Ver como”**',
    'Adelantos/correctivos cerrados durante P18: **F42/P32 v44–v44e + P21 v45/resumen editable + transición de inicio de clase**  \nPunto secuencial activo: **P18 — Identidad, roles, navegación y “Ver como”**',
    1,
)

closed_anchor='- **Adelanto F42/P32 — Administración → Datos → Borrado y reinicio seguro, backend v44–v44d aplicado y frontend fusionado.**\n'
closed_add='''- **Adelanto F42/P32 — Administración → Datos → Borrado y reinicio seguro, backend v44–v44e aplicado y frontend fusionado.**
- **Correctivo adelantado P21 — resumen pedagógico editable antes del cierre, RLS recursiva corregida mediante v45 y búsqueda/creación postadministrativa habilitada.**
- **Correctivo adelantado P21 — iniciar una clase preparada ya no depende de recargas de Marketing y no puede quedar bloqueado indefinidamente en “Abriendo…”.**
'''
if closed_anchor in text:
    text=text.replace(closed_anchor,closed_add,1)
elif 'Correctivo adelantado P21 — resumen pedagógico editable' not in text:
    raise SystemExit('closed-state anchor not found')

p18_anchor='## P18 — Identidad, roles, navegación y “Ver como” 🟣 SIGUIENTE'
text=text.replace(p18_anchor,'## P18 — Identidad, roles, navegación y “Ver como” 🟣 ACTIVO',1)

p21_anchor='''### Concurrencia de clases

Una clase abierta **no bloquea iniciar otra**.
'''
p21_insert='''### Correctivos adelantados ya implementados durante P18

Estos cambios pertenecen funcionalmente a P21, pero fueron adelantados por incidencias bloqueantes y **deben revalidarse cuando P21 sea el paquete secuencial activo**:

- el resumen pedagógico final incluye `Revisar contenido trabajado` antes de cerrar;
- desde el resumen se puede añadir contenido olvidado y crear contenido rápido;
- una Corrección puede volver de `corregida` a `pendiente` y ajustar frecuencia/importancia;
- Explicaciones/Secuencias y Ejercicios pueden corregir su estado antes del cierre;
- en pareja, la edición sigue siendo individual por alumno;
- v45 eliminó la recursión RLS entre `student_content_assignments` y `teaching_contents` sin desactivar RLS;
- `search_class_teaching_content` y la creación rápida funcionan también tras el cierre administrativo mientras el cierre pedagógico siga abierto;
- comenzar una clase preparada refresca primero el estado operativo y ya no depende de Marketing;
- el botón de inicio usa `try/catch/finally`, por lo que un error no lo deja permanentemente en `Abriendo…`;
- `start_class` fue probado autenticadamente con `ROLLBACK` sobre una clase preparada válida.

### Concurrencia de clases

Una clase abierta **no bloquea iniciar otra**.
'''
if p21_anchor in text:
    text=text.replace(p21_anchor,p21_insert,1)
elif '### Correctivos adelantados ya implementados durante P18' not in text:
    raise SystemExit('P21 corrective anchor not found')

rows_anchor='| backup completo histórico omitía 5 tablas actuales | ✅ v44c; cobertura real = 0 ausencias |\n'
rows_add='''| backup completo histórico omitía 5 tablas actuales | ✅ v44c; cobertura real = 0 ausencias |
| copia descargada no habilitaba el reinicio tras rerender/recarga | ✅ v44e; validez consultada en servidor durante 30 min |
| resumen final no permitía corregir/añadir contenido olvidado | ✅ correctivo adelantado P21; editor de resumen fusionado |
| recursión RLS en `student_content_assignments` / `teaching_contents` | ✅ v45, sin desactivar RLS |
| búsqueda/creación de enseñanza no funcionaba tras cierre administrativo | ✅ v45 mientras `pedagogy_closed_at` siga vacío |
| comenzar clase podía quedarse en `Abriendo…` por refrescos ajenos | ✅ correctivo adelantado P21; transición operativa desacoplada de Marketing |
'''
if rows_anchor in text:
    text=text.replace(rows_anchor,rows_add,1)
elif 'recursión RLS en `student_content_assignments`' not in text:
    raise SystemExit('corrective table anchor not found')

text=text.replace(
    'El adelanto F42/P32 **no modifica este orden**. Cuando llegue P32 se valida la implementación existente en lugar de recrearla.',
    'Los adelantos F42/P32 y P21 realizados durante P18 **no modifican este orden**. Cuando llegue cada P original se revalida la implementación existente en lugar de recrearla.',
    1,
)

path.write_text(text)
