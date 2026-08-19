alter table public.student_evaluations
  add column if not exists milestone_id bigint references public.evaluation_milestones(id) on delete set null;

create index if not exists idx_student_evaluations_history_context
  on public.student_evaluations(person_id, style_term_id, role_term_id, level_term_id, created_at desc);

create table if not exists public.evaluation_trend_settings (
  singleton boolean primary key default true check (singleton),
  mode text not null default 'evaluations' check (mode in ('evaluations','time')),
  reference_count integer not null default 3 check (reference_count between 1 and 50),
  period_value integer not null default 1 check (period_value between 1 and 3650),
  period_unit text not null default 'month' check (period_unit in ('day','week','month')),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.evaluation_trend_settings(singleton) values(true) on conflict(singleton) do nothing;

create table if not exists public.student_evaluation_trend_settings (
  person_id bigint primary key references public.people(id) on delete cascade,
  mode text not null check (mode in ('evaluations','time')),
  reference_count integer not null default 3 check (reference_count between 1 and 50),
  period_value integer not null default 1 check (period_value between 1 and 3650),
  period_unit text not null default 'month' check (period_unit in ('day','week','month')),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.evaluation_trend_settings enable row level security;
alter table public.student_evaluation_trend_settings enable row level security;

drop policy if exists evaluation_trend_settings_staff on public.evaluation_trend_settings;
create policy evaluation_trend_settings_staff on public.evaluation_trend_settings
  for all to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));

drop policy if exists student_evaluation_trend_settings_staff on public.student_evaluation_trend_settings;
create policy student_evaluation_trend_settings_staff on public.student_evaluation_trend_settings
  for all to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));

create or replace function private.snapshot_student_evaluation_milestone()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.milestone_id is null then
    select p.current_milestone_id into new.milestone_id
    from public.student_aptitude_progress p
    where p.person_id=new.person_id and p.style_term_id=new.style_term_id and p.role_term_id=new.role_term_id
      and p.level_term_id=new.level_term_id and p.aptitude_term_id=new.aptitude_term_id limit 1;
  end if;
  return new;
end;$$;

drop trigger if exists trg_student_evaluation_snapshot_milestone on public.student_evaluations;
create trigger trg_student_evaluation_snapshot_milestone
before insert or update of score,answer_scale_term_id,descriptor_id,answer_label,reviewed_at on public.student_evaluations
for each row execute function private.snapshot_student_evaluation_milestone();

update public.student_evaluations e set milestone_id=d.milestone_id
from public.evaluation_descriptors d where e.milestone_id is null and e.descriptor_id=d.id;

update public.student_evaluations e set milestone_id=x.milestone_id
from (
  select distinct on (d.session_id,p.aptitude_term_id) d.session_id,p.aptitude_term_id,d.milestone_id
  from public.evaluation_milestone_decisions d join public.student_aptitude_progress p on p.id=d.progress_id
  where d.decision='accepted' order by d.session_id,p.aptitude_term_id,d.created_at desc
) x
where e.milestone_id is null and e.session_id=x.session_id and e.aptitude_term_id=x.aptitude_term_id;

create or replace function public.get_evaluation_trend_reference(
  p_person_id bigint,p_style_term_id bigint,p_role_term_id bigint,p_level_term_id bigint,p_current_session_id bigint default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_mode text; v_count integer; v_period_value integer; v_period_unit text;
  v_current public.evaluation_sessions; v_current_at timestamptz; v_reference public.evaluation_sessions; v_interval interval;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para consultar tendencias de evaluación.' using errcode='42501'; end if;
  select coalesce(s.mode,g.mode),coalesce(s.reference_count,g.reference_count),coalesce(s.period_value,g.period_value),coalesce(s.period_unit,g.period_unit)
  into v_mode,v_count,v_period_value,v_period_unit
  from public.evaluation_trend_settings g left join public.student_evaluation_trend_settings s on s.person_id=p_person_id where g.singleton=true;

  if p_current_session_id is not null then
    select * into v_current from public.evaluation_sessions where id=p_current_session_id and person_id=p_person_id
      and style_term_id=p_style_term_id and role_term_id=p_role_term_id and level_term_id=p_level_term_id;
  else
    select * into v_current from public.evaluation_sessions where person_id=p_person_id and style_term_id=p_style_term_id
      and role_term_id=p_role_term_id and level_term_id=p_level_term_id and status='completed'
      order by completed_at desc nulls last,started_at desc limit 1;
  end if;
  if not found then return jsonb_build_object('mode',v_mode,'referenceCount',v_count,'periodValue',v_period_value,'periodUnit',v_period_unit,'referenceSessionId',null,'referenceAt',null,'scores','{}'::jsonb); end if;
  v_current_at:=coalesce(v_current.completed_at,v_current.started_at,v_current.created_at);

  if v_mode='evaluations' then
    select * into v_reference from public.evaluation_sessions
    where person_id=p_person_id and style_term_id=p_style_term_id and role_term_id=p_role_term_id and level_term_id=p_level_term_id
      and status='completed' and coalesce(completed_at,started_at,created_at)<v_current_at
    order by coalesce(completed_at,started_at,created_at) desc offset greatest(v_count-1,0) limit 1;
  else
    v_interval:=case v_period_unit when 'day' then make_interval(days=>v_period_value) when 'week' then make_interval(days=>v_period_value*7) else make_interval(months=>v_period_value) end;
    select * into v_reference from public.evaluation_sessions
    where person_id=p_person_id and style_term_id=p_style_term_id and role_term_id=p_role_term_id and level_term_id=p_level_term_id
      and status='completed' and coalesce(completed_at,started_at,created_at)<=v_current_at-v_interval
    order by coalesce(completed_at,started_at,created_at) desc limit 1;
    if not found then
      select * into v_reference from public.evaluation_sessions
      where person_id=p_person_id and style_term_id=p_style_term_id and role_term_id=p_role_term_id and level_term_id=p_level_term_id
        and status='completed' and coalesce(completed_at,started_at,created_at)<v_current_at
      order by coalesce(completed_at,started_at,created_at) asc limit 1;
    end if;
  end if;
  return jsonb_build_object('mode',v_mode,'referenceCount',v_count,'periodValue',v_period_value,'periodUnit',v_period_unit,
    'referenceSessionId',v_reference.id,'referenceAt',coalesce(v_reference.completed_at,v_reference.started_at,v_reference.created_at),
    'scores',coalesce((select jsonb_object_agg(e.aptitude_term_id::text,e.score) from public.student_evaluations e where e.session_id=v_reference.id),'{}'::jsonb));
end;$$;
revoke all on function public.get_evaluation_trend_reference(bigint,bigint,bigint,bigint,bigint) from public,anon;
grant execute on function public.get_evaluation_trend_reference(bigint,bigint,bigint,bigint,bigint) to authenticated;

create or replace function public.save_evaluation_trend_settings(p_mode text,p_reference_count integer,p_period_value integer,p_period_unit text,p_person_id bigint default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para cambiar esta configuración.' using errcode='42501'; end if;
  if p_mode not in ('evaluations','time') or p_reference_count not between 1 and 50 or p_period_value not between 1 and 3650 or p_period_unit not in ('day','week','month') then raise exception 'Ventana de comparación no válida.' using errcode='22023'; end if;
  if p_person_id is null then
    update public.evaluation_trend_settings set mode=p_mode,reference_count=p_reference_count,period_value=p_period_value,period_unit=p_period_unit,updated_by=(select auth.uid()),updated_at=now() where singleton=true;
  else
    insert into public.student_evaluation_trend_settings(person_id,mode,reference_count,period_value,period_unit,updated_by,updated_at)
    values(p_person_id,p_mode,p_reference_count,p_period_value,p_period_unit,(select auth.uid()),now())
    on conflict(person_id) do update set mode=excluded.mode,reference_count=excluded.reference_count,period_value=excluded.period_value,period_unit=excluded.period_unit,updated_by=excluded.updated_by,updated_at=now();
  end if;
end;$$;
revoke all on function public.save_evaluation_trend_settings(text,integer,integer,text,bigint) from public,anon;
grant execute on function public.save_evaluation_trend_settings(text,integer,integer,text,bigint) to authenticated;

create or replace function public.clear_student_evaluation_trend_settings(p_person_id bigint)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para cambiar esta configuración.' using errcode='42501'; end if;
  delete from public.student_evaluation_trend_settings where person_id=p_person_id;
end;$$;
revoke all on function public.clear_student_evaluation_trend_settings(bigint) from public,anon;
grant execute on function public.clear_student_evaluation_trend_settings(bigint) to authenticated;
