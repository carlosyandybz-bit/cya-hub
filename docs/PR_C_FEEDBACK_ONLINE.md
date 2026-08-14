# PR-C · Feedback Online

Estado: **desplegado en producción y pendiente únicamente del merge final del PR #71**.

Fecha de cierre técnico: 2026-08-14.

## Arquitectura final

Feedback Online es un dominio propio. No crea clases ficticias y no consume minutos de los bonos de clase. Cada compra añade un crédito discreto de Feedback a un ledger auditable vinculado a la persona canónica de CYA Hub.

Los vídeos se almacenan en Google Drive. La subida del alumno solo funciona sobre un borrador propio, el servidor asocia el archivo a la solicitud y genera un comprobante HMAC ligado a solicitud, persona y archivo. La reproducción sigue usando tickets temporales y exige autorización de enseñanza o un contexto Feedback válido.

La revisión reutiliza la Enseñanza y las Evaluaciones canónicas con `source_class_id = NULL` y `class_id = NULL`, respectivamente. Por tanto, las correcciones, explicaciones, ejercicios y evolución resultantes aparecen en el mismo modelo pedagógico sin inventar una clase administrativa.

## Producción

Migraciones aplicadas:

- `v80_feedback_online_core`
- `v80b_feedback_upload_owner_scope`
- `v80c_feedback_staff_context`
- `v81_feedback_backup_reset_integration`

Estado verificado tras despliegue:

- 6 tablas Feedback, las 6 con RLS.
- 0 permisos directos `INSERT/UPDATE/DELETE` para `authenticated`.
- 0 helpers privados Feedback ejecutables por `PUBLIC` o `authenticated`.
- producto inicial inactivo, sin precio y sin SLA inventados.
- reglas P27 `feedback.online.pending` y `feedback.online.completed` presentes.
- dominio de backup Feedback: 6 tablas.
- dominio `settings`: 25 tablas.
- copia completa CYA: **92 tablas**.
- 0 compras, movimientos, solicitudes, eventos, vínculos o entregas Feedback creados accidentalmente durante el rollout.

## Smoke transaccional

Las pruebas de comportamiento se ejecutaron con `BEGIN/ROLLBACK`, sin conservar datos de prueba.

Se verificó:

- compra confirmada → 1 movimiento de compra;
- envío repetido de la misma solicitud → 1 único consumo;
- cancelación repetida antes de revisión → 1 único reembolso;
- saldo vuelve correctamente tras el reembolso;
- segunda solicitud → revisión docente → cierre `completed`;
- vínculo con Enseñanza creado correctamente;
- asignación pedagógica creada con `source_class_id = NULL`;
- la persona canónica no se duplica y el perfil alumno permanece único;
- el historial de eventos de la solicitud se genera correctamente;
- todos los datos del smoke desaparecen tras `ROLLBACK`.

El motor P27 fue validado por contrato y por la implementación canónica `private.enqueue_notification`; el intento de inspección dinámica adicional de sus entregas fue bloqueado por el control de seguridad de la herramienta antes de ejecutar SQL, por lo que no se forzó esa vía.

## QA del código

Sobre el commit funcional `865265be49652c20a45581512918ed1703076fe5` pasaron:

- 54/54 contratos PR-C;
- 128/128 regresiones P19-P31;
- lint;
- build;
- whitespace;
- gates especializados;
- Browser QA / Playwright.

El merge final debe realizarse únicamente si el SHA documental final vuelve a mantener P32, gates especializados y Browser QA en verde.
