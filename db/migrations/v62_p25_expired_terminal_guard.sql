begin;

-- P25 · expired es histórico terminal: puede consultarse/comentarse,
-- pero no volver a convertirse en trabajo accionable por el RPC normal.

create or replace function public.act_on_mission(
  p_mission_id bigint,
  p_action text,
  p_comment text default null,
  p_postpone_until timestamptz default null
) returns public.missions
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_mission public.missions;
  v_next text;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para gestionar misiones.' using errcode='42501';
  end if;

  select * into v_mission
  from public.missions
  where id=p_mission_id
  for update;
  if not found then
    raise exception 'La misión no existe.' using errcode='P0002';
  end if;

  if v_mission.state='expired' and p_action not in ('open','comment') then
    raise exception 'Esta misión ha caducado y se conserva únicamente como histórico.' using errcode='22023';
  end if;

  if p_action='open' then
    return v_mission;
  elsif p_action='comment' then
    if nullif(btrim(coalesce(p_comment,'')),'') is null then
      raise exception 'Escribe un comentario.' using errcode='22023';
    end if;
    insert into public.mission_comments(mission_id,body,author_user_id)
    values(v_mission.id,btrim(p_comment),(select auth.uid()));
    return v_mission;
  elsif p_action='start' then
    v_next:='in_progress';
  elsif p_action='complete' then
    if v_mission.evidence_requirement='required'
       and not exists(
         select 1 from public.mission_evidence e where e.mission_id=v_mission.id
       ) then
      raise exception 'Esta misión requiere una evidencia antes de completarla.' using errcode='22023';
    end if;
    v_next:='completed';
  elsif p_action='postpone' then
    if p_postpone_until is null or p_postpone_until<=now() then
      raise exception 'Elige una fecha futura para posponer.' using errcode='22023';
    end if;
    v_next:='postponed';
  elsif p_action='not_applicable' then
    v_next:='not_applicable';
  elsif p_action='cancel' then
    if not (select private.is_admin()) then
      raise exception 'Solo administración puede cancelar una misión.' using errcode='42501';
    end if;
    v_next:='cancelled';
  else
    raise exception 'Acción de misión no válida.' using errcode='22023';
  end if;

  if nullif(btrim(coalesce(p_comment,'')),'') is not null then
    insert into public.mission_comments(mission_id,body,author_user_id)
    values(v_mission.id,btrim(p_comment),(select auth.uid()));
  end if;

  update public.missions
  set state=v_next,
      postponed_until=case when v_next='postponed' then p_postpone_until else null end,
      completed_at=case when v_next='completed' then now() else completed_at end,
      completed_by=case when v_next='completed' then (select auth.uid()) else completed_by end
  where id=v_mission.id
  returning * into v_mission;

  return v_mission;
end;
$function$;

revoke all on function public.act_on_mission(bigint,text,text,timestamptz)
  from public,anon;
grant execute on function public.act_on_mission(bigint,text,text,timestamptz)
  to authenticated;

commit;
