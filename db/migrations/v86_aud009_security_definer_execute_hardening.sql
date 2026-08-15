-- CYA-AUD-009 — hardening de permisos EXECUTE para SECURITY DEFINER.
-- Objetivo: impedir que PUBLIC/anon puedan ejecutar RPC privilegiadas por
-- concesiones implícitas presentes o futuras, sin romper el contrato actual
-- de authenticated + guards internos private.is_admin/private.is_staff/auth.uid().

begin;

-- PostgreSQL concede EXECUTE sobre funciones nuevas a PUBLIC por defecto.
-- Cerramos ese default para las funciones creadas en public por el rol de
-- migraciones. Los grants necesarios deben ser explícitos en cada migración.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

-- Defensa en profundidad para el inventario actual de SECURITY DEFINER.
-- No se revoca authenticated: estas RPC forman parte del contrato de la app y
-- aplican autorización dentro de la función. anon y PUBLIC no deben poder
-- alcanzar ninguna de ellas.
do $aud009$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format('revoke execute on function %s from public', r.signature);
    execute format('revoke execute on function %s from anon', r.signature);
  end loop;
end
$aud009$;

commit;
