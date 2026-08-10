-- CYA Hub · v33 · remate de Dar clase y permiso de incidencia económica
-- administratively_finish_class_v2 corre como invocador y necesita ejecutar este helper privado.
revoke all on function private.upsert_negative_balance_incident(bigint,bigint,integer,bigint[],text) from public;
revoke all on function private.upsert_negative_balance_incident(bigint,bigint,integer,bigint[],text) from anon;
grant execute on function private.upsert_negative_balance_incident(bigint,bigint,integer,bigint[],text) to authenticated;
grant execute on function private.upsert_negative_balance_incident(bigint,bigint,integer,bigint[],text) to service_role;
