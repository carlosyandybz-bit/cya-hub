create or replace function public.save_student_declared_dance_style(
  p_person_id bigint default null,
  p_style_term_id bigint default null,
  p_role_mode text default null,
  p_self_reported_level_term_id bigint default null,
  p_is_primary boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_person_id bigint:=coalesce(p_person_id,(select private.current_person_id())); v_primary boolean:=coalesce(p_is_primary,false);
begin
  if v_person_id is null then raise exception 'No se ha encontrado la persona.' using errcode='P0002'; end if;
  if v_person_id is distinct from (select private.current_person_id()) and not (select private.is_staff()) then raise exception 'No tienes permiso.' using errcode='42501'; end if;
  if not exists(select 1 from public.people where id=v_person_id and active) then raise exception 'La persona no existe.' using errcode='P0002'; end if;
  if p_style_term_id is null or not exists(select 1 from public.catalog_terms where id=p_style_term_id and taxonomy='dance_style' and active) then raise exception 'Selecciona un estilo válido.' using errcode='22023'; end if;
  if p_role_mode not in ('leader','follower','both') then raise exception 'Selecciona Leader, Follower o Role Rotation.' using errcode='22023'; end if;
  if p_self_reported_level_term_id is not null and not exists(select 1 from public.catalog_terms where id=p_self_reported_level_term_id and taxonomy='dance_level' and active) then raise exception 'El nivel indicado no es válido.' using errcode='22023'; end if;
  if not exists(select 1 from public.student_declared_dance_styles where person_id=v_person_id and active) then v_primary:=true; end if;
  if v_primary then update public.student_declared_dance_styles set is_primary=false,updated_at=now() where person_id=v_person_id and active; end if;
  insert into public.student_declared_dance_styles(person_id,style_term_id,role_mode,self_reported_level_term_id,is_primary,active)
  values(v_person_id,p_style_term_id,p_role_mode,p_self_reported_level_term_id,v_primary,true)
  on conflict(person_id,style_term_id) do update set role_mode=excluded.role_mode,self_reported_level_term_id=excluded.self_reported_level_term_id,is_primary=excluded.is_primary,active=true,updated_at=now();
  return jsonb_build_object('person_id',v_person_id,'style_term_id',p_style_term_id,'role_mode',p_role_mode,'self_reported_level_term_id',p_self_reported_level_term_id,'is_primary',v_primary);
end $$;
revoke all on function public.save_student_declared_dance_style(bigint,bigint,text,bigint,boolean) from public,anon;
grant execute on function public.save_student_declared_dance_style(bigint,bigint,text,bigint,boolean) to authenticated;

create or replace function public.remove_student_declared_dance_style(p_person_id bigint default null,p_style_term_id bigint default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_person_id bigint:=coalesce(p_person_id,(select private.current_person_id())); v_was_primary boolean; v_next bigint;
begin
  if v_person_id is null then raise exception 'No se ha encontrado la persona.' using errcode='P0002'; end if;
  if v_person_id is distinct from (select private.current_person_id()) and not (select private.is_staff()) then raise exception 'No tienes permiso.' using errcode='42501'; end if;
  select is_primary into v_was_primary from public.student_declared_dance_styles where person_id=v_person_id and style_term_id=p_style_term_id and active for update;
  update public.student_declared_dance_styles set active=false,is_primary=false,updated_at=now() where person_id=v_person_id and style_term_id=p_style_term_id;
  if coalesce(v_was_primary,false) then
    select style_term_id into v_next from public.student_declared_dance_styles where person_id=v_person_id and active order by updated_at desc,style_term_id limit 1;
    if v_next is not null then update public.student_declared_dance_styles set is_primary=true,updated_at=now() where person_id=v_person_id and style_term_id=v_next; end if;
  end if;
end $$;
revoke all on function public.remove_student_declared_dance_style(bigint,bigint) from public,anon;
grant execute on function public.remove_student_declared_dance_style(bigint,bigint) to authenticated;
