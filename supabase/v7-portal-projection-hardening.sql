
-- Keep the privileged projection in the non-exposed private schema. The public
-- RPC remains SECURITY INVOKER and can expose only this zero-argument wrapper.
create or replace function private.student_portal_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_person_id bigint;
  v_result jsonb;
begin
  if not exists(
    select 1 from public.app_members m
    where m.user_id=(select auth.uid()) and m.active and m.role='student'
  ) then
    raise exception 'Tu cuenta no tiene acceso activo al portal.' using errcode='42501';
  end if;

  select private.current_person_id() into v_person_id;
  if v_person_id is null then
    raise exception 'No hemos podido vincular esta cuenta con una única ficha de alumno.' using errcode='22023';
  end if;

  select jsonb_build_object(
    'profile',(
      select jsonb_build_object(
        'id',p.id,'display_name',p.display_name,'first_name',p.first_name,'last_name',p.last_name,
        'email',p.email,'phone',p.phone,'country_code',p.country_code,
        'student_since',sp.student_since,'goals',sp.goals
      )
      from public.people p join public.student_profiles sp on sp.person_id=p.id
      where p.id=v_person_id
    ),
    'classes',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'class_type',c.class_type,'status',c.status,'scheduled_start_at',c.scheduled_start_at,
        'duration_minutes',c.duration_minutes,'style',style.label,'attendance_status',cp.attendance_status,
        'role',role_term.label,'level',level_term.label
      ) order by c.scheduled_start_at desc)
      from public.class_participants cp
      join public.classes c on c.id=cp.class_id
      left join public.catalog_terms style on style.id=c.style_term_id
      left join public.catalog_terms role_term on role_term.id=cp.role_term_id
      left join public.catalog_terms level_term on level_term.id=cp.level_term_id
      where cp.person_id=v_person_id
    ),'[]'::jsonb),
    'credits',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',g.id,'label',g.label,'modality',g.modality,'total_minutes',g.total_minutes,
        'balance_minutes',coalesce((select sum(m.delta_minutes) from public.credit_movements m where m.grant_id=g.id),0),
        'status',g.status,'purchased_at',g.purchased_at,'expires_at',g.expires_at
      ) order by g.purchased_at desc)
      from public.credit_grant_members gm
      join public.credit_grants g on g.id=gm.grant_id
      where gm.person_id=v_person_id
    ),'[]'::jsonb),
    'assignments',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'content_id',a.content_id,'title',tc.title,'content_type',tc.content_type,
        'description',tc.description,'correction_guidance',tc.correction_guidance,
        'assignment_status',a.assignment_status,'current_frequency',a.current_frequency,
        'current_importance',a.current_importance,'updated_at',a.updated_at
      ) order by a.updated_at desc)
      from public.student_content_assignments a
      join public.teaching_contents tc on tc.id=a.content_id
      where a.person_id=v_person_id and tc.active and tc.completion_status='complete'
        and tc.publication_status='published' and tc.visibility='student'
    ),'[]'::jsonb),
    'evaluations',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,'class_id',e.class_id,'score',e.score,'aptitude',apt.label,'created_at',e.created_at
      ) order by e.created_at desc)
      from public.student_evaluations e
      join public.catalog_terms apt on apt.id=e.aptitude_term_id
      where e.person_id=v_person_id
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function private.student_portal_snapshot() from public,anon,authenticated;
grant execute on function private.student_portal_snapshot() to authenticated;

create or replace function public.student_portal_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select private.student_portal_snapshot();
$$;
revoke all on function public.student_portal_snapshot() from public,anon;
grant execute on function public.student_portal_snapshot() to authenticated;

