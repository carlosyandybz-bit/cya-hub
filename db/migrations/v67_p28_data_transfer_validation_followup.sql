-- P28 follow-up — valida contra las restricciones reales de producción y
-- hace que la superficie v2 use el ejecutor P28 seguro.

create or replace function private.normalize_marketing_import_payload(p_payload jsonb)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select coalesce(jsonb_agg(
    jsonb_set(
      jsonb_set(
        item,
        '{duration_minutes}',
        case
          when nullif(btrim(item->>'duration_minutes'),'') is null then 'null'::jsonb
          else to_jsonb(btrim(item->>'duration_minutes'))
        end,
        true
      ),
      '{currency}',
      to_jsonb(coalesce(nullif(upper(btrim(item->>'currency')),''),'EUR')),
      true
    )
  ), '[]'::jsonb)
  from jsonb_array_elements(p_payload) item;
$$;
revoke all on function private.normalize_marketing_import_payload(jsonb) from public, anon, authenticated;

create or replace function private.validate_p28_import_payload(p_domain text, p_payload jsonb)
returns void
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_item jsonb;
  v_text text;
  v_name text;
begin
  if jsonb_typeof(p_payload) <> 'array' then
    raise exception 'El archivo debe contener una lista de registros.' using errcode='22023';
  end if;
  if jsonb_array_length(p_payload)=0 then
    raise exception 'El archivo no contiene registros.' using errcode='22023';
  end if;
  if jsonb_array_length(p_payload)>5000 then
    raise exception 'El archivo supera el máximo de 5.000 registros.' using errcode='22023';
  end if;

  if p_domain='people' then
    for v_item in select value from jsonb_array_elements(p_payload) loop
      v_name:=coalesce(nullif(btrim(v_item->>'display_name'),''),nullif(btrim(concat_ws(' ',v_item->>'first_name',v_item->>'last_name')),''),'persona');
      v_text:=nullif(btrim(v_item->>'crm_stage'),'');
      if v_text is not null and v_text not in ('new','contacted','interested','booked','student','lost') then
        raise exception 'Estado CRM no válido para «%»: %',v_name,v_text using errcode='22023';
      end if;
    end loop;

  elsif p_domain='daily_quotes' then
    for v_item in select value from jsonb_array_elements(p_payload) loop
      if nullif(btrim(v_item->>'active'),'') is not null and private.import_bool(v_item->>'active') is null then
        raise exception 'El campo activo de las frases debe ser sí/no.' using errcode='22023';
      end if;
      v_text:=nullif(btrim(v_item->>'month_day'),'');
      if v_text is not null then
        if v_text!~'^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then
          raise exception 'El día anual debe usar MM-DD.' using errcode='22023';
        end if;
        begin
          if to_char(to_date('2000-'||v_text,'YYYY-MM-DD'),'MM-DD')<>v_text then
            raise exception 'día inválido';
          end if;
        exception when others then
          raise exception 'El día anual no corresponde a una fecha real: %',v_text using errcode='22023';
        end;
      end if;
    end loop;

  elsif p_domain='mission_rules' then
    for v_item in select value from jsonb_array_elements(p_payload) loop
      if nullif(btrim(v_item->>'enabled'),'') is not null and private.import_bool(v_item->>'enabled') is null then raise exception 'enabled debe ser sí/no.' using errcode='22023'; end if;
      if nullif(btrim(v_item->>'auto_complete'),'') is not null and private.import_bool(v_item->>'auto_complete') is null then raise exception 'auto_complete debe ser sí/no.' using errcode='22023'; end if;
      if nullif(btrim(v_item->>'calendar_block'),'') is not null and private.import_bool(v_item->>'calendar_block') is null then raise exception 'calendar_block debe ser sí/no.' using errcode='22023'; end if;

      v_text:=nullif(btrim(v_item->>'priority'),'');
      if v_text is not null and v_text not in ('normal','priority','urgent') then raise exception 'Prioridad de misión no válida: %',v_text using errcode='22023'; end if;
      v_text:=nullif(btrim(v_item->>'duplicate_strategy'),'');
      if v_text is not null and v_text not in ('ignore','update_existing','increase_priority','add_items','independent') then raise exception 'Estrategia de duplicados de misión no válida: %',v_text using errcode='22023'; end if;
      v_text:=nullif(btrim(v_item->>'failure_behavior'),'');
      if v_text is not null and v_text not in ('expire','mark_not_done','repeat','convert_primary','increase_priority','keep_pending') then raise exception 'Comportamiento de fallo no válido: %',v_text using errcode='22023'; end if;
      v_text:=nullif(btrim(v_item->>'evidence_requirement'),'');
      if v_text is not null and v_text not in ('none','optional','required') then raise exception 'Requisito de evidencia no válido: %',v_text using errcode='22023'; end if;

      v_text:=nullif(btrim(v_item->>'priority_score'),'');
      if v_text is not null and (v_text!~'^\d+$' or v_text::integer not between 0 and 100) then raise exception 'priority_score debe estar entre 0 y 100.' using errcode='22023'; end if;
      v_text:=nullif(btrim(v_item->>'estimated_duration_minutes'),'');
      if v_text is not null and (v_text!~'^\d+$' or v_text::integer not between 1 and 1440) then raise exception 'estimated_duration_minutes debe estar entre 1 y 1440.' using errcode='22023'; end if;
      v_text:=nullif(btrim(v_item->>'lead_minutes'),'');
      if v_text is not null and (v_text!~'^\d+$' or v_text::integer not between 0 and 525600) then raise exception 'lead_minutes debe estar entre 0 y 525600.' using errcode='22023'; end if;
      v_text:=nullif(btrim(v_item->>'max_daily'),'');
      if v_text is not null and (v_text!~'^\d+$' or v_text::integer not between 1 and 5) then raise exception 'max_daily debe estar entre 1 y 5.' using errcode='22023'; end if;
      v_text:=nullif(btrim(v_item->>'weight'),'');
      if v_text is not null and (v_text!~'^\d+(\.\d+)?$' or v_text::numeric<=0) then raise exception 'weight debe ser un número mayor que 0.' using errcode='22023'; end if;

      if v_item ? 'valid_days' and v_item->'valid_days'<>'null'::jsonb then
        if jsonb_typeof(v_item->'valid_days')<>'array' then raise exception 'valid_days debe ser una lista.' using errcode='22023'; end if;
        if exists(select 1 from jsonb_array_elements_text(v_item->'valid_days') d where d!~'^\d+$' or d::integer not between 1 and 7) then raise exception 'valid_days solo admite días 1–7.' using errcode='22023'; end if;
      end if;
      if v_item ? 'notification_channels' and v_item->'notification_channels'<>'null'::jsonb and jsonb_typeof(v_item->'notification_channels')<>'array' then raise exception 'notification_channels debe ser una lista.' using errcode='22023'; end if;
      if v_item ? 'notification_events' and v_item->'notification_events'<>'null'::jsonb and jsonb_typeof(v_item->'notification_events')<>'array' then raise exception 'notification_events debe ser una lista.' using errcode='22023'; end if;
      if v_item ? 'recipients' and v_item->'recipients'<>'null'::jsonb and jsonb_typeof(v_item->'recipients') not in ('array','object') then raise exception 'recipients debe ser una lista u objeto.' using errcode='22023'; end if;
      if v_item ? 'criteria' and v_item->'criteria'<>'null'::jsonb and jsonb_typeof(v_item->'criteria')<>'object' then raise exception 'criteria debe ser un objeto.' using errcode='22023'; end if;
      if v_item ? 'escalation' and v_item->'escalation'<>'null'::jsonb and jsonb_typeof(v_item->'escalation')<>'object' then raise exception 'escalation debe ser un objeto.' using errcode='22023'; end if;
    end loop;

  elsif p_domain='marketing_rates' then
    if exists(
      select 1 from jsonb_array_elements(p_payload) x
      group by lower(btrim(x->>'name')),x->>'rate_type'
      having count(*)>1
    ) then
      raise exception 'El archivo repite la misma tarifa.' using errcode='22023';
    end if;

    for v_item in select value from jsonb_array_elements(p_payload) loop
      if nullif(btrim(v_item->>'name'),'') is null then raise exception 'Cada tarifa necesita nombre.' using errcode='22023'; end if;
      v_text:=nullif(btrim(v_item->>'rate_type'),'');
      if v_text is null or v_text not in ('individual','pair','event','other') then raise exception 'Tipo de tarifa no válido: %',coalesce(v_text,'vacío') using errcode='22023'; end if;

      v_text:=nullif(btrim(v_item->>'duration_minutes'),'');
      if v_text is not null and (v_text!~'^\d+$' or v_text::integer not between 1 and 100000) then raise exception 'La duración debe estar entre 1 y 100000 minutos o quedar vacía.' using errcode='22023'; end if;
      v_text:=nullif(btrim(v_item->>'price_cents'),'');
      if v_text is null or v_text!~'^\d+$' or v_text::numeric>2147483647 then raise exception 'El importe debe ser un número entero no negativo.' using errcode='22023'; end if;
      v_text:=coalesce(nullif(upper(btrim(v_item->>'currency')),''),'EUR');
      if v_text!~'^[A-Z]{3}$' then raise exception 'La divisa debe usar un código de tres letras, por ejemplo EUR.' using errcode='22023'; end if;
      if nullif(btrim(v_item->>'active'),'') is not null and private.import_bool(v_item->>'active') is null then raise exception 'El campo activo de las tarifas debe ser sí/no.' using errcode='22023'; end if;
    end loop;
  end if;
end;
$$;
revoke all on function private.validate_p28_import_payload(text,jsonb) from public, anon, authenticated;

create or replace function public.preview_data_import_v2(
  p_domain text,
  p_payload jsonb,
  p_strategy text,
  p_file_name text default null,
  p_format text default 'json'
)
returns public.data_transfer_jobs
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_job public.data_transfer_jobs;
  v_payload jsonb:=p_payload;
  v_total integer;
  v_duplicates integer:=0;
begin
  if not (select private.is_admin()) then raise exception 'Solo un administrador puede importar datos.' using errcode='42501'; end if;
  if p_format not in ('json','csv','xlsx') then raise exception 'Formato de archivo no válido.' using errcode='22023'; end if;
  if p_strategy not in ('fill_empty','update','skip') then raise exception 'Estrategia de duplicados no válida.' using errcode='22023'; end if;

  perform private.validate_p28_import_payload(p_domain,v_payload);

  if p_domain='marketing_rates' then
    v_payload:=private.normalize_marketing_import_payload(v_payload);
    v_total:=jsonb_array_length(v_payload);
    select count(*) into v_duplicates
    from jsonb_array_elements(v_payload) x
    where exists(
      select 1 from public.marketing_rates r
      where lower(r.name)=lower(btrim(x->>'name')) and r.rate_type=x->>'rate_type'
    );

    insert into public.data_transfer_jobs(direction,domain,file_name,format,duplicate_strategy,status,payload,preview,created_by)
    values(
      'import',p_domain,p_file_name,p_format,p_strategy,'validated',v_payload,
      jsonb_build_object(
        'total',v_total,'duplicates',v_duplicates,'new',v_total-v_duplicates,
        'strategy',p_strategy,'validation_version','p28-v67','atomic',true
      ),
      (select auth.uid())
    ) returning * into v_job;
    return v_job;
  end if;

  v_job:=public.preview_data_import(p_domain,v_payload,p_strategy,p_file_name);
  update public.data_transfer_jobs
  set format=p_format,
      preview=coalesce(preview,'{}'::jsonb)||jsonb_build_object('validation_version','p28-v67')
  where id=v_job.id
  returning * into v_job;
  return v_job;
end;
$$;
revoke all on function public.preview_data_import_v2(text,jsonb,text,text,text) from public, anon;
grant execute on function public.preview_data_import_v2(text,jsonb,text,text,text) to authenticated;

-- La UI v2 deja de usar el ejecutor histórico privado. V66 ya aplica identidad P19,
-- Enseñanza como borrador seguro y limpieza del payload tras completar/fallar.
create or replace function public.apply_safe_data_import(p_job_id bigint)
returns public.data_transfer_jobs
language plpgsql
security invoker
set search_path=''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Solo un administrador puede aplicar importaciones.' using errcode='42501';
  end if;
  return public.apply_data_import(p_job_id);
end;
$$;
revoke all on function public.apply_safe_data_import(bigint) from public, anon;
grant execute on function public.apply_safe_data_import(bigint) to authenticated;

comment on function private.validate_p28_import_payload(text,jsonb) is 'P28 v67: validates flat imports against current production constraints before a job can become applicable.';
comment on function public.preview_data_import_v2(text,jsonb,text,text,text) is 'P28 v67 canonical preview: validates first and supports nullable marketing duration.';
comment on function public.apply_safe_data_import(bigint) is 'P28 v67 canonical apply wrapper: routes v2 imports to the hardened P28 executor.';
