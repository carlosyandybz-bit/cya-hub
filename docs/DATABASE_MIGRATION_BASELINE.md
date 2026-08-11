# CYA Hub — baseline de migraciones Supabase

**Verificado contra producción:** 11 de agosto de 2026  
**Proyecto Supabase:** `CyA hub 2` (`ldvyeyhzrepaaouzavgs`)  
**Registro consultado:** `supabase_migrations.schema_migrations`  
**Migraciones registradas:** **52**  
**Primera registrada:** `20260808214303 / teaching_module`  
**Última registrada:** `20260811124729 / v42_rls_student_class_correlation`

## Regla de interpretación

Este documento distingue tres conceptos que antes estaban mezclados:

1. **Migración registrada en producción:** aparece en `supabase_migrations.schema_migrations`.
2. **SQL conservado en GitHub:** existe un archivo que documenta total o parcialmente el cambio.
3. **SQL preparado/no aplicado:** puede existir en `supabase/` pero no forma parte de producción.

Por tanto, **la presencia de un `.sql` en GitHub no demuestra que se haya aplicado**, y la ausencia de un archivo independiente tampoco significa que la migración no se aplicara.

La fuente de verdad del estado aplicado es el registro de producción. Los archivos del repositorio son material de reconstrucción y revisión.

## Cronología registrada en producción

| # | Versión | Nombre | Fuente independiente en repo |
|---:|---|---|---|
| 1 | `20260808214303` | `teaching_module` | ✅ SQL/archivo equivalente en repo |
| 2 | `20260808214547` | `teaching_measurement_adjustment_fix` | ✅ SQL/archivo equivalente en repo |
| 3 | `20260808235011` | `communications_outbox` | ✅ SQL/archivo equivalente en repo |
| 4 | `20260808235918` | `communications_creator_indexes` | ✅ SQL/archivo equivalente en repo |
| 5 | `20260809024928` | `v7_security_portal_media` | ✅ SQL/archivo equivalente en repo |
| 6 | `20260809025310` | `v7_portal_projection_hardening` | ✅ SQL/archivo equivalente en repo |
| 7 | `20260809025649` | `v7_communications_trigger_fix` | ✅ SQL/archivo equivalente en repo |
| 8 | `20260809122316` | `v12_portal_media` | ✅ SQL/archivo equivalente en repo |
| 9 | `20260809144627` | `v14_identity_home_missions` | ⚠️ sin SQL independiente en repo |
| 10 | `20260809144722` | `v14_calendar_forms_admin` | ⚠️ sin SQL independiente en repo |
| 11 | `20260809144921` | `v14_multi_role_person_context_fix` | ⚠️ sin SQL independiente en repo |
| 12 | `20260809145128` | `v14_rls_performance_fix` | ⚠️ sin SQL independiente en repo |
| 13 | `20260809203000` | `v20_teaching_media_system` | ✅ SQL/archivo equivalente en repo |
| 14 | `20260809203222` | `v20_drive_secret_security` | ⚠️ sin SQL independiente en repo |
| 15 | `20260809203541` | `v20_remove_unused_drive_secret_store` | ⚠️ sin SQL independiente en repo |
| 16 | `20260809204223` | `v20_teaching_media_access_tightening` | ⚠️ sin SQL independiente en repo |
| 17 | `20260809231229` | `fix_teaching_media_cover_preview_swap` | ✅ SQL/archivo equivalente en repo |
| 18 | `20260810002757` | `v21_class_billing_and_negative_balance_incidents` | ⚠️ sin SQL independiente en repo |
| 19 | `20260810003018` | `v21_class_integrity_legacy_reconciliation` | ⚠️ sin SQL independiente en repo |
| 20 | `20260810004157` | `v21_backfill_uncovered_class_incidents` | ⚠️ sin SQL independiente en repo |
| 21 | `20260810010734` | `v21_data_transfer_backup_restore` | ✅ SQL/archivo equivalente en repo |
| 22 | `20260810010811` | `v21_restore_sequence_fix` | ⚠️ sin SQL independiente en repo |
| 23 | `20260810011854` | `v21_operational_import_crm` | ⚠️ sin SQL independiente en repo |
| 24 | `20260810012029` | `v21_operational_import_notes_dedupe` | ⚠️ sin SQL independiente en repo |
| 25 | `20260810012500` | `v21_data_transfer_rpc_hardening` | ⚠️ sin SQL independiente en repo |
| 26 | `20260810012734` | `v21_flat_teaching_import_safety` | ⚠️ sin SQL independiente en repo |
| 27 | `20260810012754` | `v21_safe_import_rpc_chain` | ⚠️ sin SQL independiente en repo |
| 28 | `20260810081528` | `v24c_profile_avatar_storage` | ⚠️ sin SQL independiente en repo |
| 29 | `20260810124120` | `v26_no_real_time_class_duration` | ✅ SQL/archivo equivalente en repo |
| 30 | `20260810130018` | `v26_manual_duration_override` | ✅ SQL/archivo equivalente en repo |
| 31 | `20260810131722` | `v27_compatible_credit_selection` | ✅ SQL/archivo equivalente en repo |
| 32 | `20260810134106` | `v28_class_close_extras` | ✅ SQL/archivo equivalente en repo |
| 33 | `20260810145031` | `v29_partial_payments_class_videos` | ✅ SQL/archivo equivalente en repo |
| 34 | `20260810145949` | `v29_fix_class_financial_dml_grants` | ⚠️ sin SQL independiente en repo |
| 35 | `20260810154850` | `v30_point8_final_close` | ✅ SQL/archivo equivalente en repo |
| 36 | `20260810154955` | `v30b_regularization_billed_minutes` | ✅ SQL/archivo equivalente en repo |
| 37 | `20260810185627` | `v31_class_workflow_realtime` | ✅ SQL/archivo equivalente en repo |
| 38 | `20260810194438` | `v32_live_class_context_search` | ✅ SQL/archivo equivalente en repo |
| 39 | `20260810210530` | `v33_live_class_polish_permissions` | ✅ SQL/archivo equivalente en repo |
| 40 | `20260810215339` | `v34_evaluation_sessions` | ✅ SQL/archivo equivalente en repo |
| 41 | `20260811090809` | `v35_evaluation_milestones_progress` | ✅ SQL/archivo equivalente en repo |
| 42 | `20260811091025` | `v35b_evaluation_model_hardening` | ✅ SQL/archivo equivalente en repo |
| 43 | `20260811094134` | `v35d_preserve_historical_evaluation_baseline` | ✅ SQL/archivo equivalente en repo |
| 44 | `20260811100228` | `v36_student_evaluation_release_visibility` | ✅ SQL/archivo equivalente en repo |
| 45 | `20260811100329` | `v36b_student_portal_security_invoker` | ✅ SQL/archivo equivalente en repo |
| 46 | `20260811100651` | `v37_role_authority_single_source` | ✅ SQL/archivo equivalente en repo |
| 47 | `20260811101033` | `v38_student_training_visibility` | ✅ SQL/archivo equivalente en repo |
| 48 | `20260811101401` | `v39_bachazouk_initial_evaluation_gate` | ✅ SQL/archivo equivalente en repo |
| 49 | `20260811102143` | `v40_teacher_owned_evaluation_review` | ✅ SQL/archivo equivalente en repo |
| 50 | `20260811103545` | `v41a_guided_initial_evaluation` | ✅ SQL/archivo equivalente en repo |
| 51 | `20260811104332` | `v41b_bachata_bachazouk_dual_review` | ✅ SQL/archivo equivalente en repo |
| 52 | `20260811124729` | `v42_rls_student_class_correlation` | ✅ SQL/archivo equivalente en repo |

## 18 migraciones aplicadas sin archivo SQL independiente

Producción conserva sus sentencias en la columna `statements` de `supabase_migrations.schema_migrations`, por lo que son **recuperables**. Sin embargo, a fecha de este baseline no existe para ellas un archivo independiente equivalente en `supabase/`.

| Versión | Migración |
|---|---|
| `20260809144627` | `v14_identity_home_missions` |
| `20260809144722` | `v14_calendar_forms_admin` |
| `20260809144921` | `v14_multi_role_person_context_fix` |
| `20260809145128` | `v14_rls_performance_fix` |
| `20260809203222` | `v20_drive_secret_security` |
| `20260809203541` | `v20_remove_unused_drive_secret_store` |
| `20260809204223` | `v20_teaching_media_access_tightening` |
| `20260810002757` | `v21_class_billing_and_negative_balance_incidents` |
| `20260810003018` | `v21_class_integrity_legacy_reconciliation` |
| `20260810004157` | `v21_backfill_uncovered_class_incidents` |
| `20260810010811` | `v21_restore_sequence_fix` |
| `20260810011854` | `v21_operational_import_crm` |
| `20260810012029` | `v21_operational_import_notes_dedupe` |
| `20260810012500` | `v21_data_transfer_rpc_hardening` |
| `20260810012734` | `v21_flat_teaching_import_safety` |
| `20260810012754` | `v21_safe_import_rpc_chain` |
| `20260810081528` | `v24c_profile_avatar_storage` |
| `20260810145949` | `v29_fix_class_financial_dml_grants` |

Esto se registra como deuda **P-025**: recuperar esas sentencias y conservarlas como fuentes históricas, sin volver a ejecutarlas.

## Archivos bootstrap anteriores al registro

Los siguientes SQL existen en `supabase/` pero no aparecen como entradas de `schema_migrations` porque corresponden a la etapa de bootstrap/pre-registro:

- `foundation.sql`
- `classes-and-credits.sql`
- `live-class.sql`
- `marketing-crm.sql`

No deben confundirse con migraciones timestamped registradas por Supabase.

## Agregado histórico v21

`supabase/v21-data-transfer-followups.sql` es un **agregado de follow-ups** de transferencia/importación. Su contenido representa trabajo que en producción quedó registrado mediante varias migraciones v21 independientes. No debe interpretarse como una única migración aplicada con ese nombre.

## SQL presentes pero no aplicados

### `v35c-enforce-post-class-evaluation.sql`

El propio archivo condiciona su aplicación a que el frontend v35 estuviera desplegado. **No aparece en `schema_migrations`** y, por tanto, no se considera aplicado.

### `v41c-final-evaluation-cutover-PREPARED-NOT-APPLIED.sql`

El archivo está marcado explícitamente como **PREPARADA, NO APLICAR** y **no aparece en `schema_migrations`**. No forma parte del estado actual de producción.

## P16 / v42

La última migración registrada es:

`20260811124729 / v42_rls_student_class_correlation`

Fue validada en producción con el contrato P16 y corresponde a la PR #2 fusionada en `main`.

## Uso operativo

Antes de cualquier migración nueva:

1. consultar el registro de producción;
2. no inferir estado por nombre de archivo;
3. crear una migración incremental nueva;
4. probarla;
5. aplicarla una sola vez;
6. verificar el registro;
7. actualizar este baseline, la secuencia maestra y el archivo de pendientes.

## Estado de reconstrucción

- **Cronología aplicada:** documentada y verificada hasta v42.
- **Bootstrap histórico:** identificado por separado.
- **SQL preparados/no aplicados:** identificados.
- **Fuentes independientes faltantes:** 18, recuperables desde el registro de producción.
