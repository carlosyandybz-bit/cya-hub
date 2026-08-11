# CYA Hub — auditoría de paridad verificada

**Fecha:** 11 de agosto de 2026  
**Baseline GitHub:** `2af2ce30121f86b1e25b1764e8e1fa3301cf2281`  
**Supabase:** `CyA hub 2` (`ldvyeyhzrepaaouzavgs`)  
**Alcance:** antiguos P-011 a P-022, mapeados al Plan Maestro B01/B02/B03/B06/B08/B10.

## Criterio

- **VERIFICADO CÓDIGO/BD:** existe evidencia directa en `main` y/o producción Supabase. No equivale a smoke test Hostinger.
- **PARCIAL:** existe una base real, pero falta una capa necesaria para cumplir el contrato completo.
- **PENDIENTE PRODUCCIÓN:** el código está presente pero B00.1 impide demostrar el runtime público exacto.

## Resultado ejecutivo

| Ref. histórica | Bloque maestro | Resultado | Hallazgo principal |
|---|---|---|---|
| P-011 Inicio contextual | B08.1 | VERIFICADO CÓDIGO/BD | saludo, frase, prioridad ±30 min, misión/acción, accesos, resumen, admin y cuenta existen |
| P-012 Misiones | B08.2 | PARCIAL | motor BD completo; Administración expone solo una fracción de los parámetros |
| P-013 Multirol / Ver como | B01.2 / B06 | VERIFICADO CÓDIGO/BD | existe un usuario con admin+teacher+student y selector de portal por capacidades reales |
| P-014 Agenda/Calendario | B08.3 | PARCIAL | Día/Semana/Mes/Lista y filtros existen; Google Calendar real tiene 0 conexiones y no hay flujo OAuth/sync completo |
| P-015 Formularios | B03.1 | PARCIAL | 18 formularios/68 campos activos; falta renderer genérico que gobierne los formularios operativos |
| P-016 Import/Export | B03.2 | VERIFICADO CÓDIGO/BD | XLSX/CSV/JSON, preview, duplicados y backup/restore completo presentes |
| P-017 Notificaciones | B08.4 | PARCIAL | centro interno funcional; 13 reglas activas usan actualmente solo canal `internal` |
| P-018 Portal alumno | B06 | PARCIAL | portal rico y RLS endurecida; no se localiza UI de alumno para crear solicitudes de preparación |
| P-019 Alumnado | B02 | PARCIAL | módulo y ficha maestra ricos; conversión/deduplicación preventiva aún no está endurecida |
| P-020 Navegación | B01.1 | VERIFICADO CÓDIGO | contrato de 5 accesos implementado; falta smoke iPhone/Hostinger |
| P-021 Multimedia externa | B10 | PARCIAL | enseñanza/clases/marketing usan Drive; avatar usa Supabase Storage público como excepción |
| P-022 Fuente canónica | B01.3 / B02 | PARCIAL | `people` es entidad común y no hay duplicados actuales, pero altas nuevas pueden duplicar email/teléfono |

# B01 — navegación, identidad y permisos

## B01.1 Navegación

Verificado en `app/cya-app.tsx`:

- Inicio;
- Alumnado;
- DAR CLASE;
- Enseñanza;
- Marketing.

El selector de experiencia se mantiene fuera de la navegación principal y depende de capacidades reales.

**Estado:** VERIFICADO CÓDIGO; cierre final sujeto a B00.1 y gate iPhone.

## B01.2 Multirol

Producción contiene un usuario con los tres roles activos `admin`, `teacher` y `student`. El frontend expone Profesor/Alumno/Administrador únicamente cuando `identity.can_*` lo permite. El cambio de experiencia no modifica roles de base de datos.

**Estado:** VERIFICADO CÓDIGO/BD; cierre final sujeto a prueba E2E de permisos.

## B01.3 Fuente única de verdad

Puntos correctos:

- `people.auth_user_id` es UNIQUE;
- CRM y alumnado comparten `people`;
- producción registra 0 grupos duplicados por email normalizado y 0 por teléfono normalizado.

Defecto preventivo:

- `people.email` tiene índice de búsqueda, pero no UNIQUE;
- `create_student` siempre inserta persona nueva;
- `save_crm_contact` también inserta persona nueva cuando `p_person_id` es null;
- ninguna de ambas resuelve primero coincidencias canónicas por email/teléfono.

Por tanto hoy no existe corrupción visible, pero sí una ruta real para crearla.

**Estado:** PARCIAL.  
**Acción siguiente prioritaria:** endurecimiento de identidad antes de ampliar formularios/conversiones.

# B02 — Alumnado y personas

La ficha `StudentMasterDetail` integra:

- resumen;
- Formación;
- Evaluación;
- Clases;
- Bonos;
- Datos;
- CRM;
- incidencias financieras;
- perfiles de baile;
- acciones de programación/bono.

Los provisionales y contactos se modelan sobre la misma entidad `people`, pero B02 no puede cerrarse hasta resolver B01.3/P-022 y ejecutar el gate de conversión potencial → provisional → alumno → registrado sin duplicación.

**Estado:** PARCIAL.

# B03 — Formularios e import/export

## B03.1 Formularios

Producción:

- 18 `form_definitions` activos;
- 18 versiones activas;
- 68 campos activos.

Administración puede inspeccionar/editar parte del catálogo, pero los formularios operativos principales continúan codificados en componentes React específicos. No existe todavía una capa reusable que renderice sistemáticamente `form_versions/form_fields` con opciones, condiciones, visibilidad, validación y `canonical_path`.

**Estado:** PARCIAL.

## B03.2 Importación/exportación

`AdminDataTransfer` implementa:

- XLSX, CSV y JSON;
- exportación por dominios;
- copia completa;
- previsualización;
- `fill_empty`, `update`, `skip`;
- restauración con confirmación explícita;
- backup/restore no destructivo;
- cobertura completa de personas, clases, bonos, enseñanza, evaluaciones, CRM, misiones, formularios y configuración mediante bundle CYA.

**Estado:** VERIFICADO CÓDIGO/BD; falta gate E2E de producción.

# B06 — Portal alumno

Verificado:

- clases;
- saldo/bonos;
- formación;
- multimedia autorizada;
- evaluación/evolución;
- mensajes pedagógicos filtrados;
- aislamiento de `internal_note` por P16;
- preparación leída por el profesor en el flujo de clase.

Brecha detectada:

- existe `class_preparation_requests` y su seguridad fue endurecida en P16;
- no se localiza en la experiencia del alumno una UI equivalente para crear/editar esas solicitudes antes de la clase.

**Estado:** PARCIAL.

# B08 — Inicio, Misiones, Agenda y Notificaciones

## B08.1 Inicio

Verificado en frontend y funciones Supabase:

- saludo configurable por franja horaria;
- nombre del perfil;
- frase diaria;
- próxima clase prioritaria dentro de ±30 minutos;
- siguiente misión cuando no domina una clase;
- accesos rápidos;
- resumen del día;
- acceso Administración;
- notificaciones;
- cuenta/perfil;
- selector de portal.

Producción contiene 15 frases activas.

**Estado:** VERIFICADO CÓDIGO/BD; falta smoke Hostinger.

## B08.2 Misiones

Producción tiene activas las ocho reglas iniciales consolidadas. El esquema soporta:

- tipo/estado/prioridad;
- frecuencia;
- días/hora;
- peso;
- anticipación;
- máximo diario;
- duplicados;
- comportamiento ante fallo;
- evidencia;
- auto-completado;
- bloqueo de calendario;
- canales;
- destinatarios;
- escalado/criterios;
- horas silenciosas a nivel motor.

Administración actual solo expone de forma directa una parte: activación, máximo diario, revisión, prioridad, duración, máximo por regla, auto-completar y calendario.

**Estado:** PARCIAL.  
**Brecha:** completar la superficie administrativa sin rediseñar el motor de BD que ya existe.

## B08.3 Agenda/Google Calendar

Frontend verificado:

- Día;
- Semana;
- Mes;
- Lista;
- filtros Clases/Misiones/Eventos/Externo.

Producción: `calendar_connections = 0`; no existe conexión Google Calendar activa. No se localiza un flujo completo de OAuth + sincronización bidireccional en la UI actual.

**Estado:** PARCIAL.

## B08.4 Notificaciones

Centro interno verificado:

- pendientes/historial;
- lectura individual/todas;
- navegación contextual;
- integración con prioridad de misión.

Producción: 13 reglas activas; canales configurados actualmente: solo `internal`.

**Estado:** PARCIAL.  
**Brecha:** email/WhatsApp como canales automáticos del motor, además de la comunicación comercial manual de Marketing.

# B10 — integraciones y almacenamiento

Enseñanza, clases y componentes seguros de multimedia utilizan `external_file_id` y `/api/google-drive/media-ticket` para servir recursos Drive con autorización.

Producción no contiene columnas `bytea` en esquemas operativos consultados.

Excepción: existe bucket Supabase Storage `avatars`, público, 5 MB máximo, y `account-pages.tsx` carga allí la foto de perfil.

**Estado:** PARCIAL respecto al contrato absoluto “toda foto/vídeo en Drive”.  
**Decisión técnica pendiente:** formalizar avatar como excepción permitida o migrarlo a Drive/serving seguro.

# Orden de corrección derivado

Mientras B00.1 Hostinger y B00.2 Auth sigan bloqueados por acceso/configuración, el siguiente cambio que puede prepararse de forma segura es:

1. **B01.3 / B02.2 — impedir duplicados de persona en altas/conversiones.**
2. B08.2 — completar Administración del motor de misiones.
3. B03.1 — renderer reusable de formularios.
4. B06 — UI de preparación del alumno.
5. B08.3 — conexión real Google Calendar.
6. B08.4 — canales automáticos externos.
7. B10 — resolver política definitiva de avatar.

No se recomienda reimplementar Inicio, navegación, multirol ni import/export: ya existe base verificable y debe someterse a smoke/E2E, no reconstruirse.