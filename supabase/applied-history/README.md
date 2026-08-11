# CYA Hub — applied migration history

> **ARCHIVO HISTÓRICO — NO APLICAR / NO EJECUTAR.**

Este directorio conserva copias de sentencias que **ya fueron aplicadas** en Supabase producción y quedaron registradas en `supabase_migrations.schema_migrations`, pero no tenían un archivo SQL independiente equivalente en GitHub.

## Reglas

- Estos archivos **no son migraciones nuevas**.
- No deben ejecutarse con `psql`, Supabase CLI, MCP ni ningún otro mecanismo.
- No deben copiarse a una cadena de migración futura como si estuvieran pendientes.
- La fuente de verdad del estado aplicado sigue siendo `supabase_migrations.schema_migrations` de `CyA hub 2`.
- El contenido de cada `.sql` procede de `statements[1]` y se conserva **sin cabeceras añadidas** para permitir verificación byte por byte.
- Algunas migraciones históricas contienen identificadores o constantes específicas de la operación original. El repositorio es privado; no convertir estos archivos en documentación pública.

## Verificación 18/18

El 11/08/2026 se calcularon dos huellas directamente sobre `schema_migrations.statements[1]` de producción:

1. MD5 del texto original, como manifiesto auxiliar.
2. **SHA-1 de objeto Git `blob`**, calculado con el mismo framing que Git (`blob <bytes>\\0<contenido>`).

Después se comparó ese SHA con el `sha` de cada archivo creado en GitHub. **Los 18/18 coinciden exactamente.** Esto demuestra que los archivos archivados son copias byte por byte del SQL registrado en producción; no son reconstrucciones ni aproximaciones.

| Versión | Nombre | MD5 producción | Git blob SHA verificado |
|---|---|---|---|
| `20260809144627` | `v14_identity_home_missions` | `83896c177f1357ddff5e28c2b7132c77` | `e62e40bb14d1da9a03fcfe34bde2da83d104894e` |
| `20260809144722` | `v14_calendar_forms_admin` | `4ac954682777fb95d2af8c7897ab1877` | `32ba0927080f25b5def48104f161a915751959ca` |
| `20260809144921` | `v14_multi_role_person_context_fix` | `80ab3501f49f50e1de199b819915b30f` | `99563bc64a4a5387c68c52974667b76e809ded35` |
| `20260809145128` | `v14_rls_performance_fix` | `201fd2c721b0e73e2c268b4177f267a7` | `c1b8bd74372f19c35e9528c7e02e43de66820aac` |
| `20260809203222` | `v20_drive_secret_security` | `8b910dcae7f1c9aaed7cd1d30cd7008d` | `fa4cc1aa4c93f97a08e0272fd6ea15e644cd6099` |
| `20260809203541` | `v20_remove_unused_drive_secret_store` | `91acfe1b76705937d5c84fe63899bad5` | `cf0f5ba3723c485b5e1197a8b751f32388f7c38e` |
| `20260809204223` | `v20_teaching_media_access_tightening` | `b4960f25705f4d3aca637a3cabf747c1` | `07fc5a92098cf225f66e512b3ab4c3846b68abc2` |
| `20260810002757` | `v21_class_billing_and_negative_balance_incidents` | `f8a1892e84dacb6fab90d25423e28479` | `6805ccfb25385756e537df66a6d28f3ad881a90b` |
| `20260810003018` | `v21_class_integrity_legacy_reconciliation` | `8f05c6030b6421cf40ff5645115f1b9f` | `eb505be0fba9c789774d27bb3ed613dfa37cd0de` |
| `20260810004157` | `v21_backfill_uncovered_class_incidents` | `7d64b8b7dc5029b3968a0c770b305764` | `4e5b3f95bc044958d88d3fc38e752676202cfca3` |
| `20260810010811` | `v21_restore_sequence_fix` | `e42b6e6d316637542563d0acabb5dfac` | `6dee4b22c3afc0a1f7bb56663f643149cfa68a26` |
| `20260810011854` | `v21_operational_import_crm` | `0dfc0a09244454a190a36b443d3dc576` | `2a60c8234f965c74859e06d506bbb132bef20610` |
| `20260810012029` | `v21_operational_import_notes_dedupe` | `d62c2c2152246dc3326433f63c06f87b` | `b48669cc3f6bd108cf827338bd0aa0d0c9446c24` |
| `20260810012500` | `v21_data_transfer_rpc_hardening` | `73875e99897b5c34181a4a4cf5586add` | `aed0492bc9b960eddc7b2a7095d172284421baeb` |
| `20260810012734` | `v21_flat_teaching_import_safety` | `3e842450cafefd5b35982e1f2e23cc5b` | `9fb16d9a924c07f87e26e33f17abc4479ec96147` |
| `20260810012754` | `v21_safe_import_rpc_chain` | `289b8f037cd1238c6062521f7aa0964e` | `7be97059f0676ef061434c0e6ea620478051eb95` |
| `20260810081528` | `v24c_profile_avatar_storage` | `b7d4e948fea47b7c9a8b56db3df1f07f` | `f68864ca3a20796935b42d4f8fa0f767d5d9c5c7` |
| `20260810145949` | `v29_fix_class_financial_dml_grants` | `f0a530c75ce82dc7855936c61ca3f8fc` | `7d54b5a98bace1c0250f176c81b13811716acde4` |

## Convención de nombre

`<version>-<migration_name>.sql`

El objetivo de este directorio es trazabilidad y reconstrucción forense, **no despliegue**.