-- CYA Hub · v44b · guard servidor para reinicios masivos
-- Refuerza v44: operational/full exigen una copia completa reciente del mismo admin.

create or replace function public.apply_admin_data_reset(
  p_job_id bigint,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.admin_reset_jobs;
  v_result jsonb;
  v_after jsonb;
begin
  if not (select private.is_admin()) then
    raise exception 'Solo un administrador puede ejecutar un borrado.' using errcode='42501';
  end if;

  select * into v_job
  from public.admin_reset_jobs
  where id=p_job_id
  for update;

  if not found then
    raise exception 'La preparación de borrado ya no existe.' using errcode='P0002';
  end if;
  if v_job.created_by<>(select auth.uid()) then
    raise exception 'La confirmación pertenece a otra sesión administrativa.' using errcode='42501';
  end if;
  if v_job.status<>'validated' then
    raise exception 'Este borrado ya fue utilizado o cancelado.' using errcode='22023';
  end if;
  if v_job.expires_at<now() then
    update public.admin_reset_jobs set status='cancelled' where id=v_job.id;
    raise exception 'La confirmación ha caducado. Previsualiza el borrado de nuevo.' using errcode='22023';
  end if;
  if btrim(coalesce(p_confirmation,''))<>v_job.confirmation_phrase then
    raise exception 'La frase de confirmación no coincide.' using errcode='22023';
  end if;

  if v_job.scope in ('operational','full') and not exists(
    select 1
    from public.audit_events a
    where a.event_type='data_export_created'
      and a.entity_type='data_backup'
      and a.entity_id='complete'
      and a.actor_user_id=(select auth.uid())
      and a.created_at>=now()-interval '30 minutes'
  ) then
    raise exception 'Descarga primero una copia completa de CYA Hub. El reinicio masivo exige una copia creada por tu usuario en los últimos 30 minutos.' using errcode='22023';
  end if;

  update public.admin_reset_jobs set status='running' where id=v_job.id;

  v_result := private.execute_admin_data_reset(v_job.scope,v_job.target_id);

  begin
    v_after := private.admin_reset_preview_counts(v_job.scope,v_job.target_id);
  exception
    when sqlstate 'P0002' then v_after := '{}'::jsonb;
  end;

  update public.admin_reset_jobs
  set status='completed',
      completed_at=now(),
      result=jsonb_build_object(
        'scope',v_job.scope,
        'target_id',v_job.target_id,
        'before',v_job.preview,
        'after',v_after,
        'detail',v_result
      )
  where id=v_job.id;

  insert into public.audit_events(
    event_type,entity_type,entity_id,summary,detail,actor_user_id
  )
  values(
    'admin_data_reset',
    'admin_reset',
    v_job.id::text,
    case
      when v_job.scope='full' then 'Reinicio completo de datos ejecutado'
      else 'Borrado administrativo ejecutado: '||private.reset_scope_label(v_job.scope)
    end,
    jsonb_build_object(
      'scope',v_job.scope,
      'target_id',v_job.target_id,
      'target_label',v_job.target_label,
      'preview',v_job.preview,
      'result',v_result
    ),
    (select auth.uid())
  );

  return jsonb_build_object(
    'job_id',v_job.id,
    'status','completed',
    'scope',v_job.scope,
    'target_label',v_job.target_label,
    'result',v_result
  );
end;
$$;

revoke all on function public.apply_admin_data_reset(bigint,text)
  from public,anon;
grant execute on function public.apply_admin_data_reset(bigint,text)
  to authenticated;
