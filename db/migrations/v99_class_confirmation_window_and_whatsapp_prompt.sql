begin;

-- V99 · Confirmación de clase desde las 08:00 del día anterior.
-- Mantiene WhatsApp como acción manual desde CYA (mensaje precompuesto), sin depender de Meta/Embedded Signup.

create or replace function private.class_confirmation_opens_at(p_scheduled_start_at timestamptz)
returns timestamptz
language sql
stable
set search_path=''
as $function$
  select (
    (((p_scheduled_start_at at time zone 'Europe/Madrid')::date - 1) + time '08:00')
    at time zone 'Europe/Madrid'
  );
$function$;
revoke all on function private.class_confirmation_opens_at(timestamptz) from public,anon,authenticated;

create or replace function public.confirm_scheduled_class(p_class_id bigint)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_person_id bigint;
  v_class public.classes%rowtype;
  v_confirmed_at timestamptz;
  v_all_confirmed boolean;
  v_opens_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Necesitas iniciar sesión para confirmar la clase.' using errcode='42501';
  end if;

  v_person_id := private.current_person_id();
  if v_person_id is null then
    raise exception 'No hemos podido vincular tu cuenta con una ficha de alumno.' using errcode='22023';
  end if;

  select c.* into v_class
  from public.classes c
  join public.class_participants cp on cp.class_id=c.id
  where c.id=p_class_id and cp.person_id=v_person_id
  for update of c;

  if not found then
    raise exception 'Esta clase no pertenece a tu ficha.' using errcode='42501';
  end if;
  if v_class.status <> 'scheduled' then
    raise exception 'Solo se pueden confirmar clases programadas.' using errcode='22023';
  end if;
  if v_class.scheduled_start_at <= now() then
    raise exception 'La clase ya ha comenzado o ha pasado.' using errcode='22023';
  end if;

  v_opens_at:=private.class_confirmation_opens_at(v_class.scheduled_start_at);
  if now() < v_opens_at then
    raise exception 'Podrás confirmar esta clase a partir de las 08:00 del día anterior.' using errcode='22023';
  end if;

  update public.class_participants
  set confirmation_status='confirmed',
      confirmed_at=coalesce(confirmed_at,now())
  where class_id=p_class_id and person_id=v_person_id
  returning confirmed_at into v_confirmed_at;

  select not exists (
    select 1
    from public.class_participants cp
    where cp.class_id=p_class_id
      and cp.confirmation_status <> 'confirmed'
  ) into v_all_confirmed;

  if v_all_confirmed then
    update public.internal_notifications
    set read_at=coalesce(read_at,now())
    where event_key='teacher.class.unconfirmed'
      and source_type='class_confirmation'
      and split_part(source_id,':',1)=p_class_id::text
      and read_at is null;

    update public.notification_deliveries
    set status='skipped',
        last_error='La clase quedó confirmada antes de mostrar el aviso.'
    where event_key='teacher.class.unconfirmed'
      and source_type='class_confirmation'
      and split_part(source_id,':',1)=p_class_id::text
      and status='queued';
  end if;

  return jsonb_build_object(
    'ok',true,
    'class_id',p_class_id,
    'person_id',v_person_id,
    'confirmation_status','confirmed',
    'confirmed_at',v_confirmed_at,
    'confirmation_opens_at',v_opens_at,
    'all_participants_confirmed',v_all_confirmed
  );
end;
$function$;
revoke all on function public.confirm_scheduled_class(bigint) from public,anon;
grant execute on function public.confirm_scheduled_class(bigint) to authenticated;

create or replace function public.student_portal_snapshot_for(p_person_id bigint default null)
returns jsonb
language plpgsql
stable
set search_path=''
as $function$
declare
  v_person bigint:=coalesce(p_person_id,(select private.current_person_id()));
  v_result jsonb;
  v_classes jsonb;
begin
  if v_person is null then
    raise exception 'No hemos podido vincular esta cuenta con una ficha de alumno.' using errcode='22023';
  end if;

  v_result:=private.student_portal_snapshot_for(v_person);
  v_result:=jsonb_set(v_result,'{assignments}',private.student_visible_assignments_json(v_person),true);
  v_result:=jsonb_set(v_result,'{evaluations}',private.student_visible_evaluations_json(v_person),true);

  select coalesce(
    jsonb_agg(
      e.item || jsonb_build_object(
        'confirmation_status',coalesce(cp.confirmation_status,'pending'),
        'confirmed_at',cp.confirmed_at,
        'confirmation_opens_at',private.class_confirmation_opens_at(nullif(e.item->>'scheduled_start_at','')::timestamptz)
      )
      order by e.ordinality
    ),
    '[]'::jsonb
  )
  into v_classes
  from jsonb_array_elements(coalesce(v_result->'classes','[]'::jsonb)) with ordinality as e(item,ordinality)
  left join public.class_participants cp
    on cp.class_id=nullif(e.item->>'id','')::bigint
   and cp.person_id=v_person;

  v_result:=jsonb_set(v_result,'{classes}',v_classes,true);
  return v_result;
end;
$function$;

create or replace function private.run_class_confirmation_notification_engine(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_row record;
  v_queued integer:=0;
  v_source_id text;
  v_body text;
begin
  if current_user <> 'postgres' and not coalesce((select private.is_staff()),false) then
    raise exception 'No tienes permiso para ejecutar avisos de confirmación.' using errcode='42501';
  end if;
  p_now:=coalesce(p_now,now());

  update public.internal_notifications n
  set read_at=coalesce(n.read_at,p_now)
  where n.event_key='teacher.class.unconfirmed'
    and n.source_type='class_confirmation'
    and n.read_at is null
    and exists (
      select 1
      from public.classes c
      where c.id=nullif(split_part(n.source_id,':',1),'')::bigint
        and (
          c.status <> 'scheduled'
          or not exists (
            select 1 from public.class_participants cp
            where cp.class_id=c.id and cp.confirmation_status <> 'confirmed'
          )
        )
    );

  for v_row in
    select
      c.id as class_id,
      c.teacher_user_id,
      c.scheduled_start_at,
      count(*) filter (where cp.confirmation_status <> 'confirmed')::integer as pending_count,
      string_agg(
        coalesce(
          nullif(btrim(p.display_name),''),
          nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),
          'Alumno'
        ),
        ', ' order by coalesce(nullif(btrim(p.display_name),''),nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),'Alumno')
      ) filter (where cp.confirmation_status <> 'confirmed') as pending_names
    from public.classes c
    join public.class_participants cp on cp.class_id=c.id
    join public.people p on p.id=cp.person_id
    where c.status='scheduled'
      and c.teacher_user_id is not null
      and (c.scheduled_start_at at time zone 'Europe/Madrid')::date
          = (p_now at time zone 'Europe/Madrid')::date + 1
      and p_now >= private.class_confirmation_opens_at(c.scheduled_start_at)
      and exists (
        select 1 from public.app_member_roles ar
        where ar.user_id=c.teacher_user_id
          and ar.active
          and ar.role in ('teacher','teacher_admin','admin')
      )
    group by c.id,c.teacher_user_id,c.scheduled_start_at
    having bool_or(cp.confirmation_status <> 'confirmed')
  loop
    v_source_id:=v_row.class_id::text || ':' || to_char(v_row.scheduled_start_at at time zone 'Europe/Madrid','YYYYMMDDHH24MI');
    v_body:='La clase de mañana a las ' || to_char(v_row.scheduled_start_at at time zone 'Europe/Madrid','HH24:MI') ||
      ' sigue pendiente de confirmación' ||
      case when coalesce(v_row.pending_names,'') <> '' then ' de ' || v_row.pending_names else '' end || '.';

    v_queued:=v_queued + private.enqueue_notification(
      'teacher.class.unconfirmed',
      v_row.teacher_user_id,
      case when v_row.pending_count=1 then 'Clase de mañana sin confirmar' else 'Clase de mañana con confirmaciones pendientes' end,
      v_body,
      'agenda',
      'class_confirmation',
      v_source_id,
      jsonb_build_object(
        'audience','staff',
        'class_id',v_row.class_id,
        'scheduled_start_at',v_row.scheduled_start_at,
        'pending_count',v_row.pending_count,
        'pending_names',coalesce(v_row.pending_names,''),
        'confirmation_opens_at',private.class_confirmation_opens_at(v_row.scheduled_start_at)
      )
    );
  end loop;

  return v_queued;
end;
$function$;
revoke all on function private.run_class_confirmation_notification_engine(timestamptz) from public,anon,authenticated;

create or replace function public.class_confirmation_agenda()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_result jsonb;
begin
  if not coalesce((select private.is_staff()),false) then
    raise exception 'No tienes permiso para consultar confirmaciones de clase.' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(class_row order by (class_row->>'scheduled_start_at')::timestamptz),'[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'class_id',c.id,
      'scheduled_start_at',c.scheduled_start_at,
      'duration_minutes',c.duration_minutes,
      'class_type',c.class_type,
      'location_text',c.location_text,
      'confirmation_opens_at',private.class_confirmation_opens_at(c.scheduled_start_at),
      'pending_participants',coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'person_id',p.id,
            'display_name',coalesce(nullif(btrim(p.display_name),''),nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),'Alumno'),
            'phone',p.phone,
            'country_code',p.country_code,
            'confirmation_status',cp.confirmation_status
          ) order by coalesce(nullif(btrim(p.display_name),''),nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),'Alumno')
        )
        from public.class_participants cp
        join public.people p on p.id=cp.person_id
        where cp.class_id=c.id
          and cp.confirmation_status <> 'confirmed'
      ),'[]'::jsonb)
    ) as class_row
    from public.classes c
    where c.status='scheduled'
      and c.scheduled_start_at > now()
      and private.class_confirmation_opens_at(c.scheduled_start_at) <= now()
      and exists (
        select 1
        from public.class_participants cp
        where cp.class_id=c.id
          and cp.confirmation_status <> 'confirmed'
      )
  ) q;

  return v_result;
end;
$function$;
revoke all on function public.class_confirmation_agenda() from public,anon;
grant execute on function public.class_confirmation_agenda() to authenticated;

commit;
