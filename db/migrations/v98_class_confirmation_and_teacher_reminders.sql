begin;

-- V98 · Confirmación de clases desde el portal alumno + aviso al profesor el día anterior.
-- La confirmación es por participante para soportar clases individuales y en pareja.

alter table public.class_participants
  add column if not exists confirmation_status text not null default 'pending',
  add column if not exists confirmed_at timestamptz;

do $do$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.class_participants'::regclass
      and conname = 'class_participants_confirmation_status_check'
  ) then
    alter table public.class_participants
      add constraint class_participants_confirmation_status_check
      check (confirmation_status in ('pending','confirmed'));
  end if;
end;
$do$;

create index if not exists class_participants_confirmation_idx
  on public.class_participants(class_id, confirmation_status);

comment on column public.class_participants.confirmation_status is
  'Confirmación del alumno para una clase programada: pending | confirmed.';
comment on column public.class_participants.confirmed_at is
  'Momento en que el alumno confirmó la clase desde CYA Hub.';

-- Si cambian datos materiales de una clase ya programada, se requiere una nueva confirmación.
create or replace function private.reset_class_confirmations_on_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status = 'scheduled' and (
    old.scheduled_start_at is distinct from new.scheduled_start_at
    or old.duration_minutes is distinct from new.duration_minutes
    or old.location_text is distinct from new.location_text
    or old.class_type is distinct from new.class_type
    or old.status is distinct from new.status
  ) then
    update public.class_participants
    set confirmation_status = 'pending', confirmed_at = null
    where class_id = new.id;

    -- Un aviso anterior deja de representar los datos actuales de la clase.
    update public.internal_notifications
    set read_at = coalesce(read_at, now())
    where event_key = 'teacher.class.unconfirmed'
      and source_type = 'class_confirmation'
      and split_part(source_id, ':', 1) = new.id::text
      and read_at is null;
  end if;
  return new;
end;
$function$;

revoke all on function private.reset_class_confirmations_on_change() from public,anon,authenticated;

drop trigger if exists v98_reset_class_confirmations_on_change on public.classes;
create trigger v98_reset_class_confirmations_on_change
after update of scheduled_start_at,duration_minutes,location_text,class_type,status on public.classes
for each row execute function private.reset_class_confirmations_on_change();

-- Regla exclusivamente interna: no depende de WhatsApp ni correo.
insert into public.notification_rules(
  event_key,label,enabled,channels,recipients,anticipation_minutes,template,settings
) values (
  'teacher.class.unconfirmed',
  'Clase sin confirmar',
  true,
  array['internal']::text[],
  '["staff"]'::jsonb,
  1440,
  'Una clase de mañana sigue pendiente de confirmación.',
  '{"groupable":true,"confirmation_required":true}'::jsonb
)
on conflict(event_key) do update set
  label=excluded.label,
  enabled=excluded.enabled,
  channels=excluded.channels,
  recipients=excluded.recipients,
  anticipation_minutes=excluded.anticipation_minutes,
  template=excluded.template,
  settings=public.notification_rules.settings || excluded.settings,
  updated_at=now();

-- El alumno confirma únicamente su propia participación en una clase futura programada.
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
    'all_participants_confirmed',v_all_confirmed
  );
end;
$function$;

revoke all on function public.confirm_scheduled_class(bigint) from public,anon;
grant execute on function public.confirm_scheduled_class(bigint) to authenticated;

-- Añade el estado de confirmación a cada clase del snapshot sin duplicar la lógica pedagógica existente.
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
        'confirmed_at',cp.confirmed_at
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

-- Aviso al profesor asignado: si mañana hay una clase con al menos un participante pendiente.
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

  -- Limpia avisos que ya no son válidos porque la clase se confirmó o canceló.
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
        'pending_names',coalesce(v_row.pending_names,'')
      )
    );
  end loop;

  return v_queued;
end;
$function$;

revoke all on function private.run_class_confirmation_notification_engine(timestamptz) from public,anon,authenticated;

-- Extiende el motor existente sin crear otro scheduler: el cron P27 ya lo ejecuta cada 5 minutos.
create or replace function private.run_notification_engine(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_mission public.missions%rowtype;
  v_user_id uuid;
  v_reconciled integer:=0;
  v_queued integer:=0;
  v_student_queued integer:=0;
  v_class_confirmation_queued integer:=0;
  v_process jsonb;
begin
  if current_user <> 'postgres' and not coalesce((select private.is_staff()),false) then
    raise exception 'No tienes permiso para ejecutar el motor de notificaciones.' using errcode='42501';
  end if;
  if p_now is null then p_now:=now(); end if;

  update public.internal_notifications n
  set read_at=coalesce(n.read_at,p_now)
  from public.missions m
  where n.event_key='mission.attention'
    and n.audience='staff'
    and n.source_type='mission'
    and n.source_id=m.id::text
    and n.read_at is null
    and (
      private.notification_mission_terminal(m.state)
      or m.state in ('upcoming','postponed','blocked')
    );
  get diagnostics v_reconciled = row_count;

  for v_mission in
    select m.*
    from public.missions m
    join public.mission_rules r on r.rule_key=m.rule_key
    where r.enabled
      and 'activated'=any(r.notification_events)
      and m.state in ('available','in_progress')
  loop
    for v_user_id in
      select distinct ar.user_id
      from public.app_member_roles ar
      where ar.active and ar.role in ('admin','teacher_admin','teacher')
    loop
      v_queued:=v_queued+private.enqueue_notification(
        'mission.attention',v_user_id,v_mission.title,v_mission.description,
        v_mission.action_target,'mission',v_mission.id::text,
        jsonb_build_object('mission_rule',v_mission.rule_key,'reconciled',true,'audience','staff')
      );
    end loop;
  end loop;

  v_student_queued:=private.run_student_notification_engine(p_now);
  v_class_confirmation_queued:=private.run_class_confirmation_notification_engine(p_now);
  v_process:=private.process_notification_deliveries(500);

  return jsonb_build_object(
    'reconciled',v_reconciled,
    'queued_or_existing',v_queued,
    'student_queued_or_existing',v_student_queued,
    'class_confirmation_queued_or_existing',v_class_confirmation_queued,
    'delivery',v_process
  );
end;
$function$;

revoke all on function private.run_notification_engine(timestamptz) from public,anon,authenticated;

commit;
