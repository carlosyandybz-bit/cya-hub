-- CYA Hub · v51 · P23 Enseñanza + relaciones + árboles
-- Contrato aditivo sobre el modelo real: teaching_content_relations es el grafo
-- canónico y sequence_item + position modela los pasos de una secuencia.

begin;

-- “Necesita pareja” pertenece exclusivamente a Ejercicios.
alter table public.teaching_contents
  add column if not exists requires_partner boolean not null default false;

alter table public.teaching_contents
  drop constraint if exists teaching_contents_requires_partner_only_exercise;
alter table public.teaching_contents
  add constraint teaching_contents_requires_partner_only_exercise
  check (not requires_partner or content_type='exercise');

-- position solo tiene semántica para sequence_item.
alter table public.teaching_content_relations
  drop constraint if exists teaching_content_relations_position_only_sequence;
alter table public.teaching_content_relations
  add constraint teaching_content_relations_position_only_sequence
  check (relation_type='sequence_item' or position is null);

-- Un paso ocupa una única posición dentro de su secuencia.
create unique index if not exists teaching_content_relations_sequence_position_uidx
  on public.teaching_content_relations(source_content_id,position)
  where relation_type='sequence_item';

create or replace function private.guard_teaching_content_relation()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_source_type text;
  v_target_type text;
  v_source_roles bigint[];
  v_target_roles bigint[];
  v_source_styles bigint[];
  v_target_styles bigint[];
  v_source_levels bigint[];
  v_target_levels bigint[];
begin
  select content_type into v_source_type
  from public.teaching_contents
  where id=new.source_content_id and active;

  select content_type into v_target_type
  from public.teaching_contents
  where id=new.target_content_id and active;

  if v_source_type is null or v_target_type is null then
    raise exception 'Los dos contenidos de la relación deben estar activos.' using errcode='22023';
  end if;

  if new.relation_type in ('counterpart','related') and new.source_content_id > new.target_content_id then
    raise exception 'Las relaciones simétricas deben guardarse en su orden canónico.' using errcode='22023';
  end if;

  if new.relation_type='counterpart' then
    if v_source_type<>'explanation' or v_target_type<>'explanation' then
      raise exception 'Una homóloga debe relacionar dos explicaciones.' using errcode='22023';
    end if;

    select coalesce(array_agg(role_term_id order by role_term_id),'{}'::bigint[])
      into v_source_roles from public.teaching_content_roles where content_id=new.source_content_id;
    select coalesce(array_agg(role_term_id order by role_term_id),'{}'::bigint[])
      into v_target_roles from public.teaching_content_roles where content_id=new.target_content_id;
    select coalesce(array_agg(style_term_id order by style_term_id),'{}'::bigint[])
      into v_source_styles from public.teaching_content_styles where content_id=new.source_content_id;
    select coalesce(array_agg(style_term_id order by style_term_id),'{}'::bigint[])
      into v_target_styles from public.teaching_content_styles where content_id=new.target_content_id;
    select coalesce(array_agg(level_term_id order by level_term_id),'{}'::bigint[])
      into v_source_levels from public.teaching_content_levels where content_id=new.source_content_id;
    select coalesce(array_agg(level_term_id order by level_term_id),'{}'::bigint[])
      into v_target_levels from public.teaching_content_levels where content_id=new.target_content_id;

    if cardinality(v_source_roles)<>1 or cardinality(v_target_roles)<>1
       or v_source_roles[1]=v_target_roles[1] then
      raise exception 'Una homóloga debe unir una explicación Leader con una Follower.' using errcode='22023';
    end if;
    if cardinality(v_source_styles)=0 or v_source_styles is distinct from v_target_styles then
      raise exception 'Las explicaciones homólogas deben compartir exactamente los mismos estilos.' using errcode='22023';
    end if;
    if cardinality(v_source_levels)=0 or v_source_levels is distinct from v_target_levels then
      raise exception 'Las explicaciones homólogas deben compartir exactamente los mismos niveles.' using errcode='22023';
    end if;
    if exists(
      select 1
      from public.teaching_content_relations r
      where r.relation_type='counterpart'
        and r.id<>coalesce(new.id,-1)
        and (
          r.source_content_id in (new.source_content_id,new.target_content_id)
          or r.target_content_id in (new.source_content_id,new.target_content_id)
        )
    ) then
      raise exception 'Cada explicación solo puede tener una homóloga directa.' using errcode='22023';
    end if;
  elsif new.relation_type='exercise_explanation' then
    if v_source_type<>'exercise' or v_target_type<>'explanation' then
      raise exception 'Esta relación requiere un ejercicio y una explicación.' using errcode='22023';
    end if;
  elsif new.relation_type='exercise_correction' then
    if v_source_type<>'exercise' or v_target_type<>'correction' then
      raise exception 'Esta relación requiere un ejercicio y una corrección.' using errcode='22023';
    end if;
  elsif new.relation_type='sequence_item' then
    if v_source_type<>'sequence' then
      raise exception 'Solo una secuencia puede contener pasos.' using errcode='22023';
    end if;
    if v_target_type='sequence' then
      raise exception 'Una secuencia no puede contener otra secuencia como paso.' using errcode='22023';
    end if;
  end if;

  if new.relation_type in ('prerequisite','sequence_item') and exists(
    with recursive walk(content_id) as (
      select r.target_content_id
      from public.teaching_content_relations r
      where r.source_content_id=new.target_content_id
        and r.relation_type=new.relation_type
        and r.id<>coalesce(new.id,-1)
      union
      select r.target_content_id
      from public.teaching_content_relations r
      join walk w on w.content_id=r.source_content_id
      where r.relation_type=new.relation_type
        and r.id<>coalesce(new.id,-1)
    )
    select 1 from walk where content_id=new.source_content_id
  ) then
    raise exception 'La relación crearía un ciclo en el mapa de enseñanza.' using errcode='22023';
  end if;

  return new;
end;
$$;

-- Edita la única propiedad específica de Ejercicios sin duplicar el gran RPC
-- de contenido/media existente.
create or replace function public.set_teaching_exercise_partner_requirement(
  p_content_id bigint,
  p_requires_partner boolean
)
returns public.teaching_contents
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_content public.teaching_contents;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para editar enseñanza.' using errcode='42501';
  end if;

  select * into v_content
  from public.teaching_contents
  where id=p_content_id and active
  for update;

  if not found then
    raise exception 'El contenido no existe o está archivado.' using errcode='P0002';
  end if;
  if v_content.content_type<>'exercise' then
    raise exception 'Necesita pareja solo existe para Ejercicios.' using errcode='22023';
  end if;

  update public.teaching_contents
  set requires_partner=coalesce(p_requires_partner,false)
  where id=p_content_id
  returning * into v_content;

  return v_content;
end;
$$;

revoke all on function public.set_teaching_exercise_partner_requirement(bigint,boolean) from public,anon;
grant execute on function public.set_teaching_exercise_partner_requirement(bigint,boolean) to authenticated;

-- Reordenación atómica: no crea ni elimina pasos, solo cambia el orden del
-- conjunto exacto ya relacionado con la secuencia.
create or replace function public.reorder_teaching_sequence(
  p_sequence_content_id bigint,
  p_item_content_ids bigint[]
)
returns setof public.teaching_content_relations
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_items bigint[]:=coalesce(p_item_content_ids,'{}'::bigint[]);
  v_count integer;
  v_distinct_count integer;
  v_current_count integer;
  v_temp_base integer;
  v_item bigint;
  v_i integer;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para ordenar secuencias.' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.teaching_contents
    where id=p_sequence_content_id and active and content_type='sequence'
  ) then
    raise exception 'La secuencia no existe o no está activa.' using errcode='22023';
  end if;

  v_count:=cardinality(v_items);
  select count(distinct x) into v_distinct_count from unnest(v_items) x;
  if v_distinct_count<>v_count then
    raise exception 'Una secuencia no puede repetir el mismo paso.' using errcode='22023';
  end if;

  perform 1
  from public.teaching_content_relations
  where source_content_id=p_sequence_content_id and relation_type='sequence_item'
  for update;

  select count(*) into v_current_count
  from public.teaching_content_relations
  where source_content_id=p_sequence_content_id and relation_type='sequence_item';

  if v_current_count<>v_count
     or exists(
       select 1
       from public.teaching_content_relations r
       where r.source_content_id=p_sequence_content_id
         and r.relation_type='sequence_item'
         and not (r.target_content_id=any(v_items))
     ) then
    raise exception 'El orden debe incluir exactamente todos los pasos actuales de la secuencia.' using errcode='22023';
  end if;

  select greatest(coalesce(max(position),0)+1000,1000000)
    into v_temp_base
  from public.teaching_content_relations
  where source_content_id=p_sequence_content_id and relation_type='sequence_item';

  if v_count>0 then
    for v_i in 1..v_count loop
      v_item:=v_items[v_i];
      update public.teaching_content_relations
      set position=v_temp_base+v_i
      where source_content_id=p_sequence_content_id
        and target_content_id=v_item
        and relation_type='sequence_item';
    end loop;
    for v_i in 1..v_count loop
      v_item:=v_items[v_i];
      update public.teaching_content_relations
      set position=v_i*10
      where source_content_id=p_sequence_content_id
        and target_content_id=v_item
        and relation_type='sequence_item';
    end loop;
  end if;

  return query
  select r.*
  from public.teaching_content_relations r
  where r.source_content_id=p_sequence_content_id and r.relation_type='sequence_item'
  order by r.position,r.id;
end;
$$;

revoke all on function public.reorder_teaching_sequence(bigint,bigint[]) from public,anon;
grant execute on function public.reorder_teaching_sequence(bigint,bigint[]) to authenticated;

-- La semántica de pareja también se aplica durante la clase; con default false
-- el comportamiento histórico queda intacto para todos los ejercicios actuales.
create or replace function public.record_class_content_event(
  p_class_id bigint,
  p_person_id bigint,
  p_content_id bigint,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb
)
returns public.class_content_events
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_event public.class_content_events;
  v_type text;
  v_requires_partner boolean:=false;
  v_status text;
  v_event_type text:=p_event_type;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para registrar actividad.' using errcode='42501';
  end if;
  if not exists(
    select 1
    from public.classes c
    join public.class_participants cp on cp.class_id=c.id
    where c.id=p_class_id and cp.person_id=p_person_id
      and c.status in ('active','finished') and c.pedagogy_closed_at is null
  ) then
    raise exception 'La clase no está abierta para este alumno.' using errcode='22023';
  end if;

  select content_type,requires_partner into v_type,v_requires_partner
  from public.teaching_contents
  where id=p_content_id and active;
  if v_type is null then
    raise exception 'El contenido no existe.' using errcode='P0002';
  end if;

  select assignment_status into v_status
  from public.student_content_assignments
  where person_id=p_person_id and content_id=p_content_id;

  if p_event_type='improved' and (v_type<>'correction' or v_status is null) then
    raise exception 'Mejorado solo se usa con correcciones asignadas.' using errcode='22023';
  end if;
  if p_event_type='reviewed' and (v_type not in ('explanation','sequence') or v_status<>'explained') then
    raise exception 'Solo se puede repasar contenido ya explicado.' using errcode='22023';
  end if;
  if p_event_type in ('exercise_pending','exercise_active','exercise_completed') and v_type<>'exercise' then
    raise exception 'Ese estado solo corresponde a ejercicios.' using errcode='22023';
  end if;
  if p_event_type in ('exercise_active','exercise_completed') and v_requires_partner
     and (select count(*) from public.class_participants where class_id=p_class_id)<2 then
    raise exception 'Este ejercicio necesita pareja.' using errcode='22023';
  end if;
  if p_event_type not in ('improved','reviewed','exercise_pending','exercise_active','exercise_completed') then
    raise exception 'Actividad no válida.' using errcode='22023';
  end if;

  insert into public.class_content_events(
    class_id,person_id,content_id,event_type,previous_status,new_status,payload,created_by
  ) values(
    p_class_id,p_person_id,p_content_id,v_event_type,v_status,
    case when p_event_type like 'exercise_%' then replace(p_event_type,'exercise_','') else v_status end,
    coalesce(p_payload,'{}'::jsonb)||jsonb_build_object('content_type',v_type,'requires_partner',v_requires_partner),
    (select auth.uid())
  ) returning * into v_event;

  return v_event;
end;
$$;

revoke all on function public.record_class_content_event(bigint,bigint,bigint,text,jsonb) from public,anon;
grant execute on function public.record_class_content_event(bigint,bigint,bigint,text,jsonb) to authenticated;

commit;
