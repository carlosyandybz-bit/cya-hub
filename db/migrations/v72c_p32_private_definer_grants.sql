-- P32 — Cerrar ejecución directa innecesaria de helpers SECURITY DEFINER privados.

revoke all on function private.guard_last_admin_role()
  from public, anon, authenticated;

revoke all on function private.person_lifecycle_status_unchecked(bigint)
  from public, anon, authenticated;

revoke all on function private.match_person_identity(text,text,bigint)
  from public, anon, authenticated;
grant execute on function private.match_person_identity(text,text,bigint)
  to authenticated;
