create table if not exists public.student_class_preferences (
  person_id bigint primary key references public.people(id) on delete cascade,
  default_location_term_id bigint null references public.catalog_terms(id) on delete set null,
  default_location_text text null,
  default_style_term_id bigint null references public.catalog_terms(id) on delete set null,
  default_role_term_id bigint null references public.catalog_terms(id) on delete set null,
  default_duration_minutes integer null check (default_duration_minutes is null or default_duration_minutes between 15 and 480),
  default_class_type text null check (default_class_type is null or default_class_type in ('individual','pair')),
  default_partner_person_id bigint null references public.people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null,
  check (default_partner_person_id is null or default_partner_person_id <> person_id)
);

alter table public.student_class_preferences enable row level security;
drop policy if exists student_class_preferences_staff_all on public.student_class_preferences;
create policy student_class_preferences_staff_all on public.student_class_preferences for all to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
drop policy if exists student_class_preferences_student_read on public.student_class_preferences;
create policy student_class_preferences_student_read on public.student_class_preferences for select to authenticated using (person_id=(select private.current_person_id()));

create or replace function public.get_student_class_preferences(p_person_id bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_row public.student_class_preferences;
begin
  if not (select private.is_staff()) and p_person_id is distinct from (select private.current_person_id()) then raise exception 'No tienes permiso.' using errcode='42501'; end if;
  select * into v_row from public.student_class_preferences where person_id=p_person_id;
  return jsonb_build_object('person_id',p_person_id,'default_location_term_id',v_row.default_location_term_id,'default_location_text',v_row.default_location_text,'default_style_term_id',v_row.default_style_term_id,'default_role_term_id',v_row.default_role_term_id,'default_duration_minutes',v_row.default_duration_minutes,'default_class_type',v_row.default_class_type,'default_partner_person_id',v_row.default_partner_person_id);
end $$;
revoke all on function public.get_student_class_preferences(bigint) from public,anon;
grant execute on function public.get_student_class_preferences(bigint) to authenticated;

create or replace function public.save_student_class_preferences(p_person_id bigint,p_location_term_id bigint default null,p_location_text text default null,p_style_term_id bigint default null,p_role_term_id bigint default null,p_duration_minutes integer default null,p_class_type text default null,p_set_location boolean default false,p_set_style boolean default false,p_set_role boolean default false,p_set_duration boolean default false,p_set_class_type boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not (select private.is_staff()) then raise exception 'Solo el equipo puede establecer preferencias de clase.' using errcode='42501'; end if;
  if not exists(select 1 from public.people where id=p_person_id and active) then raise exception 'El alumno no existe.' using errcode='P0002'; end if;
  if p_set_style and p_style_term_id is not null and not exists(select 1 from public.catalog_terms where id=p_style_term_id and taxonomy='dance_style' and active) then raise exception 'El estilo no es válido.' using errcode='22023'; end if;
  if p_set_role and p_role_term_id is not null and not exists(select 1 from public.catalog_terms where id=p_role_term_id and taxonomy='dance_role' and active) then raise exception 'El rol no es válido.' using errcode='22023'; end if;
  if p_set_duration and p_duration_minutes is not null and (p_duration_minutes<15 or p_duration_minutes>480) then raise exception 'La duración predeterminada no es válida.' using errcode='22023'; end if;
  if p_set_class_type and p_class_type is not null and p_class_type not in ('individual','pair') then raise exception 'El tipo de clase no es válido.' using errcode='22023'; end if;
  insert into public.student_class_preferences(person_id,updated_by) values(p_person_id,auth.uid()) on conflict(person_id) do nothing;
  update public.student_class_preferences set default_location_term_id=case when p_set_location then p_location_term_id else default_location_term_id end,default_location_text=case when p_set_location then nullif(btrim(coalesce(p_location_text,'')),'') else default_location_text end,default_style_term_id=case when p_set_style then p_style_term_id else default_style_term_id end,default_role_term_id=case when p_set_role then p_role_term_id else default_role_term_id end,default_duration_minutes=case when p_set_duration then p_duration_minutes else default_duration_minutes end,default_class_type=case when p_set_class_type then p_class_type else default_class_type end,updated_at=now(),updated_by=auth.uid() where person_id=p_person_id;
  return public.get_student_class_preferences(p_person_id);
end $$;
revoke all on function public.save_student_class_preferences(bigint,bigint,text,bigint,bigint,integer,text,boolean,boolean,boolean,boolean,boolean) from public,anon;
grant execute on function public.save_student_class_preferences(bigint,bigint,text,bigint,bigint,integer,text,boolean,boolean,boolean,boolean,boolean) to authenticated;

create or replace function public.set_student_default_partner(p_person_id bigint,p_partner_person_id bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_old bigint; v_partner_old bigint;
begin
  if not (select private.is_staff()) then raise exception 'Solo el equipo puede establecer la pareja predeterminada.' using errcode='42501'; end if;
  if p_partner_person_id is not null and p_partner_person_id=p_person_id then raise exception 'La pareja debe ser otra persona.' using errcode='22023'; end if;
  if not exists(select 1 from public.people where id=p_person_id and active) then raise exception 'El alumno no existe.' using errcode='P0002'; end if;
  if p_partner_person_id is not null and not exists(select 1 from public.people where id=p_partner_person_id and active) then raise exception 'La pareja no existe.' using errcode='P0002'; end if;
  insert into public.student_class_preferences(person_id,updated_by) values(p_person_id,auth.uid()) on conflict(person_id) do nothing;
  select default_partner_person_id into v_old from public.student_class_preferences where person_id=p_person_id for update;
  if v_old is not null then update public.student_class_preferences set default_partner_person_id=null,updated_at=now(),updated_by=auth.uid() where person_id=v_old and default_partner_person_id=p_person_id; end if;
  if p_partner_person_id is null then update public.student_class_preferences set default_partner_person_id=null,updated_at=now(),updated_by=auth.uid() where person_id=p_person_id; return public.get_student_class_preferences(p_person_id); end if;
  insert into public.student_class_preferences(person_id,updated_by) values(p_partner_person_id,auth.uid()) on conflict(person_id) do nothing;
  select default_partner_person_id into v_partner_old from public.student_class_preferences where person_id=p_partner_person_id for update;
  if v_partner_old is not null and v_partner_old<>p_person_id then update public.student_class_preferences set default_partner_person_id=null,updated_at=now(),updated_by=auth.uid() where person_id=v_partner_old and default_partner_person_id=p_partner_person_id; end if;
  update public.student_class_preferences set default_partner_person_id=p_partner_person_id,default_class_type='pair',updated_at=now(),updated_by=auth.uid() where person_id=p_person_id;
  update public.student_class_preferences set default_partner_person_id=p_person_id,default_class_type='pair',updated_at=now(),updated_by=auth.uid() where person_id=p_partner_person_id;
  return public.get_student_class_preferences(p_person_id);
end $$;
revoke all on function public.set_student_default_partner(bigint,bigint) from public,anon;
grant execute on function public.set_student_default_partner(bigint,bigint) to authenticated;
