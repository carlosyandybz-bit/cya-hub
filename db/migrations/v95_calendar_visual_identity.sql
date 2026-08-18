begin;

create table if not exists public.calendar_visual_settings (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  external_calendar_id text not null,
  calendar_name text not null default 'Google Calendar',
  icon_storage_path text,
  color_override text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (user_id, external_calendar_id),
  constraint calendar_visual_settings_color_chk check (color_override is null or color_override ~ '^#[0-9A-Fa-f]{6}$')
);

alter table public.calendar_visual_settings enable row level security;

drop policy if exists calendar_visual_settings_select on public.calendar_visual_settings;
drop policy if exists calendar_visual_settings_insert on public.calendar_visual_settings;
drop policy if exists calendar_visual_settings_update on public.calendar_visual_settings;
drop policy if exists calendar_visual_settings_delete on public.calendar_visual_settings;

create policy calendar_visual_settings_select on public.calendar_visual_settings
for select to authenticated using (user_id = (select auth.uid()) and (select private.is_staff()));

create policy calendar_visual_settings_insert on public.calendar_visual_settings
for insert to authenticated with check (user_id = (select auth.uid()) and (select private.is_admin()));

create policy calendar_visual_settings_update on public.calendar_visual_settings
for update to authenticated using (user_id = (select auth.uid()) and (select private.is_admin()))
with check (user_id = (select auth.uid()) and (select private.is_admin()));

create policy calendar_visual_settings_delete on public.calendar_visual_settings
for delete to authenticated using (user_id = (select auth.uid()) and (select private.is_admin()));

grant select, insert, update, delete on public.calendar_visual_settings to authenticated;

create or replace function public.calendar_snapshot(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para consultar la agenda de equipo.' using errcode='42501'; end if;
  if p_from is null or p_to is null or p_to-p_from>interval '370 days' then raise exception 'Rango de agenda no válido.' using errcode='22023'; end if;
  return jsonb_build_object(
    'classes',coalesce((
      select jsonb_agg(class_item order by starts_at)
      from (
        select c.scheduled_start_at starts_at,jsonb_build_object(
          'id',c.id,'type','class','title',array_to_string(array_agg(p.display_name order by p.display_name),' y '),
          'starts_at',c.scheduled_start_at,'ends_at',c.scheduled_start_at+make_interval(mins=>c.duration_minutes),'status',c.status
        ) class_item
        from public.classes c
        join public.class_participants cp on cp.class_id=c.id
        join public.people p on p.id=cp.person_id
        where c.status<>'cancelled' and c.scheduled_start_at<p_to
          and c.scheduled_start_at+make_interval(mins=>c.duration_minutes)>p_from
        group by c.id,c.scheduled_start_at,c.duration_minutes,c.status
      ) class_rows
    ),'[]'::jsonb),
    'missions',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'type','mission','title',m.title,'starts_at',m.calendar_starts_at,
      'ends_at',m.calendar_ends_at,'status',m.state) order by m.calendar_starts_at)
      from public.missions m where m.calendar_starts_at is not null and m.calendar_ends_at>p_from and m.calendar_starts_at<p_to
      and m.state not in ('cancelled','completed','completed_automatically','not_applicable','expired')),'[]'::jsonb),
    'marketing_events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'type','event','title',e.title,'starts_at',e.starts_at,
      'ends_at',coalesce(e.ends_at,e.starts_at+interval '1 hour'),'status',e.status) order by e.starts_at)
      from public.marketing_events e where e.status<>'cancelled' and e.starts_at<p_to and coalesce(e.ends_at,e.starts_at+interval '1 hour')>p_from),'[]'::jsonb),
    'external_events',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'type','external','title',e.title,'starts_at',e.starts_at,'ends_at',e.ends_at,
      'status',e.sync_status,'external_event_id',e.external_event_id,'external_calendar_id',e.external_calendar_id,
      'metadata',e.metadata || jsonb_build_object('external_calendar_id',e.external_calendar_id)
    ) order by e.starts_at)
      from public.calendar_events e
      join public.calendar_connections cc on cc.id=e.connection_id
      where e.source_type='external'
        and cc.user_id=(select auth.uid())
        and cc.status in ('connected','paused','error')
        and e.starts_at<p_to and e.ends_at>p_from and e.sync_status<>'ignored'),'[]'::jsonb)
  );
end;
$function$;

commit;
