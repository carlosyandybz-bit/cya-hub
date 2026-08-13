-- P30C1 — Resolución segura de periodos estadísticos.
create or replace function private.statistics_period_bounds(p_kind text,p_days integer,p_from timestamptz,p_to timestamptz)
returns table(from_at timestamptz,to_at timestamptz)
language plpgsql
stable
set search_path=''
as $$
declare v_now timestamptz:=coalesce(p_to,now());
begin
  if p_kind='today' then return query select date_trunc('day',v_now),v_now;
  elsif p_kind='this_week' then return query select date_trunc('week',v_now),v_now;
  elsif p_kind='this_month' then return query select date_trunc('month',v_now),v_now;
  elsif p_kind='this_year' then return query select date_trunc('year',v_now),v_now;
  elsif p_kind='rolling_days' then
    if coalesce(p_days,0) not between 1 and 3650 then raise exception 'Periodo de días no válido.' using errcode='22023'; end if;
    return query select v_now-make_interval(days=>p_days),v_now;
  elsif p_kind='custom' then
    if p_from is null or p_to is null or p_from>=p_to or p_to-p_from>interval '10 years' then raise exception 'Intervalo personalizado no válido.' using errcode='22023'; end if;
    return query select p_from,p_to;
  else raise exception 'Tipo de periodo no válido.' using errcode='22023'; end if;
end;
$$;
revoke all on function private.statistics_period_bounds(text,integer,timestamptz,timestamptz) from public,anon,authenticated;
