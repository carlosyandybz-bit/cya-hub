# CYA Hub — applied migration history

> **ARCHIVO HISTÓRICO — NO APLICAR / NO EJECUTAR.**

Este directorio conserva copias de sentencias que **ya fueron aplicadas** en Supabase producción y quedaron registradas en `supabase_migrations.schema_migrations`, pero no tenían un archivo SQL independiente equivalente en GitHub.

## Reglas

- Estos archivos **no son migraciones nuevas**.
- No deben ejecutarse con `psql`, Supabase CLI, MCP ni ningún otro mecanismo.
- No deben copiarse a una cadena de migración futura como si estuvieran pendientes.
- La fuente de verdad del estado aplicado sigue siendo `supabase_migrations.schema_migrations` de `CyA hub 2`.
- El contenido de cada `.sql` se recupera de `statements[1]` y se conserva sin añadir cabeceras para poder verificar su MD5 contra producción.
- Algunas migraciones históricas contienen identificadores o constantes específicas de la operación original. El repositorio es privado; no convertir estos archivos en documentación pública.

## Manifiesto verificado el 11/08/2026

| Versión | Nombre | Caracteres | MD5 producción |
|---|---|---:|---|
| `20260809144627` | `v14_identity_home_missions` | 43193 | `83896c177f1357ddff5e28c2b7132c77` |
| `20260809144722` | `v14_calendar_forms_admin` | 64011 | `4ac954682777fb95d2af8c7897ab1877` |
| `20260809144921` | `v14_multi_role_person_context_fix` | 660 | `80ab3501f49f50e1de199b819915b30f` |
| `20260809145128` | `v14_rls_performance_fix` | 7997 | `201fd2c721b0e73e2c268b4177f267a7` |
| `20260809203222` | `v20_drive_secret_security` | 3615 | `8b910dcae7f1c9aaed7cd1d30cd7008d` |
| `20260809203541` | `v20_remove_unused_drive_secret_store` | 216 | `91acfe1b76705937d5c84fe63899bad5` |
| `20260809204223` | `v20_teaching_media_access_tightening` | 1068 | `b4960f25705f4d3aca637a3cabf747c1` |
| `20260810002757` | `v21_class_billing_and_negative_balance_incidents` | 30072 | `f8a1892e84dacb6fab90d25423e28479` |
| `20260810003018` | `v21_class_integrity_legacy_reconciliation` | 3604 | `8f05c6030b6421cf40ff5645115f1b9f` |
| `20260810004157` | `v21_backfill_uncovered_class_incidents` | 1033 | `7d64b8b7dc5029b3968a0c770b305764` |
| `20260810010811` | `v21_restore_sequence_fix` | 3925 | `e42b6e6d316637542563d0acabb5dfac` |
| `20260810011854` | `v21_operational_import_crm` | 6696 | `0dfc0a09244454a190a36b443d3dc576` |
| `20260810012029` | `v21_operational_import_notes_dedupe` | 6622 | `d62c2c2152246dc3326433f63c06f87b` |
| `20260810012500` | `v21_data_transfer_rpc_hardening` | 2433 | `73875e99897b5c34181a4a4cf5586add` |
| `20260810012734` | `v21_flat_teaching_import_safety` | 1892 | `3e842450cafefd5b35982e1f2e23cc5b` |
| `20260810012754` | `v21_safe_import_rpc_chain` | 2503 | `289b8f037cd1238c6062521f7aa0964e` |
| `20260810081528` | `v24c_profile_avatar_storage` | 2453 | `b7d4e948fea47b7c9a8b56db3df1f07f` |
| `20260810145949` | `v29_fix_class_financial_dml_grants` | 1053 | `f0a530c75ce82dc7855936c61ca3f8fc` |

## Convención de nombre

`<version>-<migration_name>.sql`

El objetivo de este directorio es trazabilidad y reconstrucción forense, no despliegue.