create or replace function public.feedback_update_context(
  p_request_id bigint,
  p_style_term_id bigint,
  p_role_term_id bigint,
  p_level_term_id bigint
) returns public.feedback_requests
language plpgsql security definer set search_path=''
as $$
declare v_request public.feedback_requests;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para cambiar el contexto del Feedback.' using errcode='42501';
  end if;
  if not exists(select 1 from public.catalog_terms where id=p_style_term_id and taxonomy='dance_style' and active) then
    raise exception 'Selecciona un estilo válido.' using errcode='22023';
  end if;
  if not exists(select 1 from public.catalog_terms where id=p_role_term_id and taxonomy='dance_role' and active) then
    raise exception 'Selecciona un rol válido.' using errcode='22023';
  end if;
  if not exists(select 1 from public.catalog_terms where id=p_level_term_id and taxonomy='dance_level' and active) then
    raise exception 'Selecciona un nivel válido.' using errcode='22023';
  end if;
  update public.feedback_requests
  set style_term_id=p_style_term_id,
      role_term_id=p_role_term_id,
      level_term_id=p_level_term_id,
      updated_by=(select auth.uid())
  where id=p_request_id and status in ('submitted','in_review')
  returning * into v_request;
  if v_request.id is null then raise exception 'El Feedback no está abierto para revisión.' using errcode='22023'; end if;
  return v_request;
end;
$$;

revoke all on function public.feedback_update_context(bigint,bigint,bigint,bigint) from public, anon;
grant execute on function public.feedback_update_context(bigint,bigint,bigint,bigint) to authenticated;
