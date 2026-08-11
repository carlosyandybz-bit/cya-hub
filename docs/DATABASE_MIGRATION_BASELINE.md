# CYA Hub — baseline de migraciones Supabase

**Verificado contra producción:** 11 de agosto de 2026  
**Proyecto Supabase:** `CyA hub 2` (`ldvyeyhzrepaaouzavgs`)  
**Registro consultado:** `supabase_migrations.schema_migrations`  
**Migraciones registradas:** **52**  
**Primera registrada:** `20260808214303 / teaching_module`  
**Última registrada:** `20260811124729 / v42_rls_student_class_correlation`

## Regla de interpretación

Este documento distingue cuatro conceptos:

1. **Migración registrada en producción:** aparece en `supabase_migrations.schema_migrations`.
2. **SQL activo/documental en GitHub:** existe un archivo que documenta total o parcialmente el cambio.
3. **SQL histórico recuperado:** ya fue aplicado y se conserva en `supabase/applied-history/`; **no debe volver a ejecutarse**.
4. **SQL preparado/no aplicado:** puede existir en `supabase/` pero no forma parte de producción.

**Presencia de archivo SQL ≠ evidencia de aplicación.** La fuente de verdad del estado aplicado es el registro de producción.

## Cronología registrada en producción

| # | Versión | Nombre | Fuente en repo |
|---:|---|---|---|
| 1 | `20260808214303` | `teaching_module` | ✅ fuente equivalente |
| 2 | `20260808214547` | `teaching_measurement_adjustment_fix` | ✅ fuente equivalente |
| 3 | `20260808235011` | `communications_outbox` | ✅ fuente equivalente |
| 4 | `20260808235918` | `communications_creator_indexes` | ✅ fuente equivalente |
| 5 | `20260809024928` | `v7_security_portal_media` | ✅ fuente equivalente |
| 6 | `20260809025310` | `v7_portal_projection_hardening` | ✅ fuente equivalente |
| 7 | `20260809025649` | `v7_communications_trigger_fix` | ✅ fuente equivalente |
| 8 | `20260809122316` | `v12_portal_media` | ✅ fuente equivalente |
| 9 | `20260809144627` | `v14_identity_home_missions` | 🗄️ recuperada byte-exacta |
| 10 | `20260809144722` | `v14_calendar_forms_admin` | 🗄️ recuperada byte-exacta |
| 11 | `20260809144921` | `v14_multi_role_person_context_fix` | 🗄️ recuperada byte-exacta |
| 12 | `20260809145128` | `v14_rls_performance_fix` | 🗄️ recuperada byte-exacta |
| 13 | `20260809203000` | `v20_teaching_media_system` | ✅ fuente equivalente |
| 14 | `20260809203222` | `v20_drive_secret_security` | 🗄️ recuperada byte-exacta |
| 15 | `20260809203541` | `v20_remove_unused_drive_secret_store` | 🗄️ recuperada byte-exacta |
| 16 | `20260809204223` | `v20_teaching_media_access_tightening` | 🗄️ recuperada byte-exacta |
| 17 | `20260809231229` | `fix_teaching_media_cover_preview_swap` | ✅ fuente equivalente |
| 18 | `20260810002757` | `v21_class_billing_and_negative_balance_incidents` | 🗄️ recuperada byte-exacta |
| 19 | `20260810003018` | `v21_class_integrity_legacy_reconciliation` | 🗄️ recuperada byte-exacta |
| 20 | `20260810004157` | `v21_backfill_uncovered_class_incidents` | 🗄️ recuperada byte-exacta |
| 21 | `20260810010734` | `v21_data_transfer_backup_restore` | ✅ fuente equivalente |
| 22 | `20260810010811` | `v21_restore_sequence_fix` | 🗄️ recuperada byte-exacta |
| 23 | `20260810011854` | `v21_operational_import_crm` | 🗄️ recuperada byte-exacta |
| 24 | `20260810012029` | `v21_operational_import_notes_dedupe` | 🗄️ recuperada byte-exacta |
| 25 | `20260810012500` | `v21_data_transfer_rpc_hardening` | 🗄️ recuperada byte-exacta |
| 26 | `20260810012734` | `v21_flat_teaching_import_safety` | 🗄️ recuperada byte-exacta |
| 27 | `20260810012754` | `v21_safe_import_rpc_chain` | 🗄️ recuperada byte-exacta |
| 28 | `20260810081528` | `v24c_profile_avatar_storage` | 🗄️ recuperada byte-exacta |
| 29 | `20260810124120` | `v26_no_real_time_class_duration` | ✅ fuente equivalente |
| 30 | `20260810130018` | `v26_manual_duration_override` | ✅ fuente equivalente |
| 31 | `20260810131722` | `v27_compatible_credit_selection` | ✅ fuente equivalente |
| 32 | `20260810134106` | `v28_class_close_extras` | ✅ fuente equivalente |
| 33 | `20260810145031` | `v29_partial_payments_class_videos` | ✅ fuente equivalente |
| 34 | `20260810145949` | `v29_fix_class_financial_dml_grants` | 🗄️ recuperada byte-exacta |
| 35 | `20260810154850` | `v30_point8_final_close` | ✅ fuente equivalente |
| 36 | `20260810154955` | `v30b_regularization_billed_minutes` | ✅ fuente equivalente |
| 37 | `20260810185627` | `v31_class_workflow_realtime` | ✅ fuente equivalente |
| 38 | `20260810194438` | `v32_live_class_context_search` | ✅ fuente equivalente |
| 39 | `20260810210530` | `v33_live_class_polish_permissions` | ✅ fuente equivalente |
| 40 | `20260810215339` | `v34_evaluation_sessions` | ✅ fuente equivalente |
| 41 | `20260811090809` | `v35_evaluation_milestones_progress` | ✅ fuente equivalente |
| 42 | `20260811091025` | `v35b_evaluation_model_hardening` | ✅ fuente equivalente |
| 43 | `20260811094134` | `v35d_preserve_historical_evaluation_baseline` | ✅ fuente equivalente |
| 44 | `20260811100228` | `v36_student_evaluation_release_visibility` | ✅ fuente equivalente |
| 45 | `20260811100329` | `v36b_student_portal_security_invoker` | ✅ fuente equivalente |
| 46 | `20260811100651` | `v37_role_authority_single_source` | ✅ fuente equivalente |
| 47 | `20260811101033` | `v38_student_training_visibility` | ✅ fuente equivalente |
| 48 | `20260811101401` | `v39_bachazouk_initial_evaluation_gate` | ✅ fuente equivalente |
| 49 | `20260811102143` | `v40_teacher_owned_evaluation_review` | ✅ fuente equivalente |
| 50 | `20260811103545` | `v41a_guided_initial_evaluation` | ✅ fuente equivalente |
| 51 | `20260811104332` | `v41b_bachata_bachazouk_dual_review` | ✅ fuente equivalente |
| 52 | `20260811124729` | `v42_rls_student_class_correlation` | ✅ fuente equivalente |

## Recuperación P-025: 18/18 fuentes históricas

Las 18 migraciones que en el baseline v1.0 no tenían archivo independiente fueron recuperadas **exclusivamente** desde `supabase_migrations.schema_migrations.statements[1]` y archivadas en:

`supabase/applied-history/`

### Garantía de integridad

Para cada una se calculó en Supabase el SHA-1 del objeto Git `blob` usando exactamente los bytes del SQL registrado. Se comparó con el `sha` que GitHub asignó al archivo archivado. **Resultado: 18/18 coincidencias.**

Esto acredita que las fuentes archivadas son copias byte por byte; no se reconstruyeron manualmente ni se reejecutaron. El manifiesto de SHA y MD5 está en `supabase/applied-history/README.md`.

**Regla crítica:** `supabase/applied-history/` es archivo forense, no una carpeta de migraciones activas.

## Archivos bootstrap anteriores al registro

Los siguientes SQL existen en `supabase/` pero no aparecen como entradas de `schema_migrations` porque corresponden a bootstrap/pre-registro:

- `foundation.sql`
- `classes-and-credits.sql`
- `live-class.sql`
- `marketing-crm.sql`

No deben confundirse con migraciones timestamped registradas por Supabase.

## Agregado histórico v21

`supabase/v21-data-transfer-followups.sql` es un agregado de follow-ups de transferencia/importación. En producción ese trabajo quedó registrado mediante varias migraciones v21 independientes.

## SQL presentes pero no aplicados

### `v35c-enforce-post-class-evaluation.sql`

Existe en GitHub, condicionaba su aplicación al frontend v35 y **no aparece en `schema_migrations`**. No se considera aplicado.

### `v41c-final-evaluation-cutover-PREPARED-NOT-APPLIED.sql`

Está marcado explícitamente como **PREPARADA, NO APLICAR** y no aparece en `schema_migrations`. No forma parte de producción.

## P16 / v42

La última migración registrada sigue siendo `20260811124729 / v42_rls_student_class_correlation`, validada en producción con el contrato P16 y vinculada a la PR #2.

## Uso operativo

Antes de cualquier migración nueva:

1. consultar el registro real de producción;
2. no inferir estado por nombre/presencia de archivo;
3. no ejecutar nada desde `supabase/applied-history/`;
4. crear una migración incremental nueva;
5. probarla;
6. aplicarla una sola vez;
7. verificar el registro y advisors;
8. actualizar este baseline, la secuencia maestra y el archivo de pendientes.

## Estado de reconstrucción

- **Cronología aplicada:** documentada y verificada hasta v42.
- **Bootstrap histórico:** identificado por separado.
- **SQL preparados/no aplicados:** identificados.
- **Fuentes históricas antes ausentes:** **18/18 recuperadas y verificadas byte por byte**.
- **P-025:** CERRADO.
