-- CYA Hub · v44e · estado persistente de copia previa al reinicio
-- Corrige el caso en el que el frontend perdía `backupReady` tras un refresh/remount.
-- No ejecuta ningún borrado ni modifica datos de negocio.

create or replace function public.admin_reset_backup_status()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_created_at timestamptz;
  v_checksum text;
  v_expires_at timestamptz;
begin
  if not (select private.is_admin()) then
    raise exception 'Solo un administrador puede consultar el estado de la copia de seguridad.' using errcode='42501';
  end if;

  select a.created_at, a.detail->>'checksum'
  into v_created_at, v_checksum
  from public.audit_events a
  where a.event_type='data_export_created'
    and a.entity_type='data_backup'
    and a.entity_id='complete'
    and a.actor_user_id=(select auth.uid())
    and a.created_at>=now()-interval '30 minutes'
  order by a.created_at desc
  limit 1;

  if v_created_at is null then
    return jsonb_build_object(
      'ready',false,
      'created_at',null,
      'expires_at',null,
      'seconds_remaining',0,
      'checksum',null
    );
  end if;

  v_expires_at := v_created_at + interval '30 minutes';

  return jsonb_build_object(
    'ready',v_expires_at>now(),
    'created_at',v_created_at,
    'expires_at',v_expires_at,
    'seconds_remaining',greatest(0,floor(extract(epoch from (v_expires_at-now())))::integer),
    'checksum',v_checksum
  );
end;
$$;

revoke all on function public.admin_reset_backup_status() from public,anon;
grant execute on function public.admin_reset_backup_status() to authenticated;
