
-- A polymorphic trigger record exposes different keys on people and
-- crm_profiles. Resolve the key through JSON so the unselected table-specific
-- field is never dereferenced by PL/pgSQL.
create or replace function private.invalidate_ready_communications()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_recipient_id bigint;
  v_person_id bigint;
  v_row jsonb:=to_jsonb(new);
begin
  v_person_id:=coalesce((v_row->>'id')::bigint,(v_row->>'person_id')::bigint);
  if v_person_id is null then
    raise exception 'No se ha podido identificar el contacto actualizado.' using errcode='22023';
  end if;

  for v_recipient_id in
    update public.communication_recipients
    set status='skipped',blocked_reason='Datos de contacto o permiso actualizados · prepara la lista de nuevo',updated_at=now()
    where person_id=v_person_id and status='ready'
    returning id
  loop
    insert into public.communication_events(recipient_id,event_type,detail,created_by)
    values(v_recipient_id,'skipped','Invalidado automáticamente al cambiar contacto o permiso',(select auth.uid()));
  end loop;
  return new;
end;
$$;
revoke execute on function private.invalidate_ready_communications() from public,anon,authenticated;

