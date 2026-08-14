# CYA HUB — BACKLOG POST-RELEASE

**Corte:** 14/08/2026  
**Base:** `main` tras P32 + hotfix post-release  
**P18–P32:** CERRADOS en código y Supabase producción.

Este documento gobierna el trabajo posterior al cierre P32. No volver a tratar P18–P32 como paquetes pendientes.

## Estado confirmado

- `main` y Supabase producción alineados.
- Browser QA final verde en profesor/alumno/admin e iPhone/escritorio.
- Backup completo final: 79 tablas.
- Reset completo conoce Estadísticas P30 y preserva configuración P31.
- Hotfix de frases diarias y solape móvil de Notificaciones integrado.
- Sin PRs funcionales abiertos al cierre.

## Gates externos

- **Hostinger:** `carlosyandy.com` continúa sirviendo la web pública existente. No mover el dominio principal hasta demostrar CYA Hub en una URL de app independiente.
- **Supabase Auth:** Leaked Password Protection continúa desactivado; requiere ajuste externo de Auth/plan compatible.

# PR-A — Cierres transversales

## Ficha profesional de profesor — COMPLETADO
`teacher_profiles` es el modelo canónico activo y `Mi perfil` expone el formulario versionado `teacher_profile` para cualquier identidad con rol de profesor. Nombre profesional, biografía, estilos y especialidades se editan sobre la misma persona P19.

## Alta de profesores — COMPLETADO
Administración dispone de `Añadir profesor`, reutiliza la persona canónica P19, crea o reutiliza Auth de forma segura, activa roles `teacher` + `student` y conserva rollback compensatorio ante una finalización incompleta.

## País completo — COMPLETADO
La BD conserva `country_code` ISO-2. Altas de alumnado, edición de identidad, CRM, formularios versionados y alta de profesores usan selector completo; las superficies de lectura presentan el nombre del país en español (`España`, `Francia`...) mediante la utilidad común de países.

## Preferencias — COMPLETADO
Las preferencias personales con efecto real son zona horaria, límites de saludo y contexto/portal preferido. Apariencia, misiones, notificaciones globales, integraciones, estadísticas y defaults operativos permanecen en Administración; los datos de alumno/profesor siguen en la persona canónica. No se añaden opciones sin efecto ni duplicados de configuración global.

## Copy de producto — COMPLETADO
Las superficies finales dejan de exponer términos de migraciones, motores, arquitectura, despliegue, PostgreSQL/Supabase o desarrollo cuando no aportan una acción al usuario. Administración conserva la información funcional necesaria con lenguaje de producto y los errores de integraciones no filtran detalles internos del backend.

## Agrupación de notificaciones — PENDIENTE
`internal_notifications` ya tiene `event_key` canónico. Agrupar visualmente las notificaciones del mismo tipo por `event_key`, con contador, expansión y lectura/destino preservados.

# PR-B — BZ Points y recompensas — FALTA

Crear ledger auditable de puntos y catálogo de recompensas administrable.

Acciones iniciales solicitadas:
- registrarse;
- inicio de sesión diario;
- comprar bono;
- realizar clase;
- realizar ejercicio indicado;
- confirmar una vez al día antes de clase que se repasó la clase anterior;
- elegir contenido de la siguiente clase.

Administración debe editar puntos por regla y recompensas/costes. Primer tipo de recompensa: cupones/descuentos. Misiones y BZ Points siguen siendo motores distintos: una misión puede generar un movimiento en el ledger.

# PR-C — Feedback Online — FALTA

- compra de 1 crédito de Feedback Online;
- subida de vídeo;
- persona tratada como alumno pedagógico sin duplicar identidad;
- cola de pendientes dentro de DAR CLASE;
- profesor trabaja sobre el vídeo y asigna contenido/evaluación cuando corresponda;
- pendientes en Notificaciones;
- estados, historial, tiempos de respuesta y estadísticas P30.

# PR-D — Academia Online — FALTA

Módulo principal propio, visible para cualquier profesor y alumno.

- Profesor: módulo independiente.
- Alumno: pantalla `Próximamente` desde la primera integración.
- Administración: gobernanza/configuración.
- Contenido, precios y estadísticas específicas se gestionan desde Academia Online.
- La navegación mantiene DAR CLASE central y Administración puede ordenar Inicio, Alumnado, Enseñanza, Marketing, Estadísticas y Academia Online.

# PR-E — Multimedia / vídeo — FALTA COMPRESIÓN

La subida actual envía el vídeo original a Drive (máx. 1 GB). Diseñar compresión/transcodificación previa compatible con iPhone y navegador, con fallback seguro y sin degradar la utilidad pedagógica. No asumir FFmpeg instalado en Hostinger.

# PR-F — Rediseño global

## Panel alumno — FUNCIONAL, REQUIERE REDISEÑO
Reorganizar por próxima acción, progreso, formación, saldo/bonos, misiones/BZ Points y evolución.

## Ficha alumno en profesor — FUNCIONAL, MUY DENSA
Actualmente concentra Resumen, Formación, Evaluación, Clases, Bonos, Datos y CRM. Reorganizar por contexto/frecuencia sin eliminar capacidad.

## Administración — FUNCIONAL CON DEUDA VISUAL
Auditar layouts, mensajes técnicos, jerarquía y acciones. Eliminar `progreso automático` de superficies vivas si todavía aparece.

## Ver como — REQUIERE REDISEÑO
Reorganizar visualmente Profesor/Alumno/Administrador, mostrando relación entre experiencias sin alterar permisos.

## Dirección visual
Estética moderna, urbana, elegante y lúdica; microinteracciones y animaciones útiles; evitar interfaz infantil. iPhone como referencia.

# Reglas transversales

1. Una persona canónica; no duplicar profesor/alumno/cliente.
2. Toda función nueva define RLS y matriz Profesor/Alumno/Admin.
3. Toda función nueva emite estadísticas compatibles con P30.
4. Multimedia pesada va a Drive, no PostgreSQL.
5. Notificaciones nuevas usan P27/`event_key` y son agrupables.
6. Import/export P28 y backup/reset P32 se amplían antes de producción.
7. Touch targets >=44 px y safe areas iPhone.
8. No mostrar copy técnico de desarrollo en la UI.
9. No mover `carlosyandy.com` hasta demostrar runtime CYA Hub separado.
10. Mantener ISO `country_code`; traducirlo solo en presentación/selector.
