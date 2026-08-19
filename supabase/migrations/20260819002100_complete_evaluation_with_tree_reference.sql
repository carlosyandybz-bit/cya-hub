create or replace function public.complete_context_evaluation_with_tree_reference(
  p_session_id bigint,
  p_reference_content_id bigint default null,
  p_certify_reference boolean default true
)
returns table(
  evaluation_completed boolean,
  certified_ancestors integer,
  reference_certified boolean,
  tree_id bigint
)
language plpgsql
security definer
set search_path='public','private','auth'
as $function$
declare
  v_session public.evaluation_sessions%rowtype;
  v_certified integer:=0;
  v_reference_certified boolean:=false;
  v_tree_id bigint:=null;
begin
  if not private.is_staff() then raise exception 'No autorizado'; end if;

  select * into v_session from public.evaluation_sessions where id=p_session_id for update;
  if not found then raise exception 'Evaluación no encontrada'; end if;

  perform public.complete_context_evaluation(p_session_id);

  if p_reference_content_id is not null then
    select r.certified_ancestors,r.reference_certified,r.tree_id
      into v_certified,v_reference_certified,v_tree_id
    from public.accept_tree_evaluation_recommendation(
      v_session.person_id,
      v_session.style_term_id,
      v_session.role_term_id,
      p_reference_content_id,
      p_certify_reference,
      v_session.id,
      v_session.class_id
    ) r;
  end if;

  return query select true,v_certified,v_reference_certified,v_tree_id;
end $function$;

revoke all on function public.complete_context_evaluation_with_tree_reference(bigint,bigint,boolean) from public,anon;
grant execute on function public.complete_context_evaluation_with_tree_reference(bigint,bigint,boolean) to authenticated;
