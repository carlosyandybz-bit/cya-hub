create or replace function private.restore_json_table(p_table_name text,p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed text[] := private.backup_tables_for_domain('complete');
  v_excluded text[] := '{}'::text[];
  v_columns text;
  v_select_columns text;
  v_pk_columns text;
  v_update_columns text;
  v_sql text;
  v_count integer := 0;
  v_seq text;
  v_has_rows boolean;
  v_has_id boolean := false;
begin
  if not (select private.is_admin()) then
    raise exception 'Solo un administrador puede restaurar datos.' using errcode='42501';
  end if;
  if not (p_table_name = any(v_allowed)) then
    raise exception 'Tabla no permitida para restauración: %',p_table_name using errcode='22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Los datos de % no son una lista.',p_table_name using errcode='22023';
  end if;
  if jsonb_array_length(p_rows)=0 then return 0; end if;

  if p_table_name='integration_settings' then
    v_excluded := array['secret_reference'];
  elsif p_table_name='calendar_connections' then
    v_excluded := array['credential_reference'];
  end if;

  select
    string_agg(format('%I',a.attname),', ' order by a.attnum),
    string_agg(format('x.%I',a.attname),', ' order by a.attnum),
    bool_or(a.attname='id')
  into v_columns,v_select_columns,v_has_id
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid=a.attrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname=p_table_name
    and a.attnum>0
    and not a.attisdropped
    and a.attgenerated=''
    and not (a.attname = any(v_excluded));

  select string_agg(format('%I',a.attname),', ' order by k.ord)
  into v_pk_columns
  from pg_catalog.pg_index i
  join pg_catalog.pg_class c on c.oid=i.indrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  join lateral unnest(i.indkey) with ordinality k(attnum,ord) on true
  join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attnum=k.attnum
  where n.nspname='public' and c.relname=p_table_name and i.indisprimary;

  if v_pk_columns is null then
    raise exception 'La tabla % no tiene clave primaria restaurable.',p_table_name using errcode='22023';
  end if;

  select string_agg(format('%1$I=excluded.%1$I',a.attname),', ' order by a.attnum)
  into v_update_columns
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid=a.attrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname=p_table_name
    and a.attnum>0
    and not a.attisdropped
    and a.attgenerated=''
    and not (a.attname = any(v_excluded))
    and a.attnum not in (
      select k.attnum
      from pg_catalog.pg_index i2
      join lateral unnest(i2.indkey) k(attnum) on true
      where i2.indrelid=c.oid and i2.indisprimary
    );

  v_sql := format(
    'insert into public.%1$I (%2$s) overriding system value
     select %3$s from jsonb_populate_recordset(null::public.%1$I,$1) x
     on conflict (%4$s) %5$s',
    p_table_name,
    v_columns,
    v_select_columns,
    v_pk_columns,
    case when coalesce(v_update_columns,'')=''
      then 'do nothing'
      else 'do update set ' || v_update_columns
    end
  );

  execute v_sql using p_rows;
  get diagnostics v_count = row_count;

  if v_has_id then
    select pg_catalog.pg_get_serial_sequence(format('public.%I',p_table_name),'id') into v_seq;
    if v_seq is not null then
      execute format('select exists(select 1 from public.%I)',p_table_name) into v_has_rows;
      if v_has_rows then
        execute format(
          'select pg_catalog.setval(%L::regclass,(select max(id) from public.%I),true)',
          v_seq,p_table_name
        );
      end if;
    end if;
  end if;

  return v_count;
end;
$$;

revoke all on function private.restore_json_table(text,jsonb) from public, anon, authenticated;