-- P30F1 — El cálculo respeta los filtros declarados por el catálogo.
create or replace function private.statistics_people_business_metric(p_key text,p_from timestamptz,p_to timestamptz,p_filters jsonb)
returns numeric
language plpgsql
stable
set search_path=''
as $$
declare
  v_student bigint;
  v_country text;
  v_payment_status text;
  v_value numeric;
begin
  begin v_student:=nullif(p_filters->>'student','')::bigint; exception when others then raise exception 'Alumno no válido.' using errcode='22023'; end;
  v_country:=nullif(upper(btrim(p_filters->>'country')),'');
  v_payment_status:=coalesce(nullif(btrim(p_filters->>'payment_status'),''),'paid');
  if v_payment_status not in ('paid','pending','refunded') then raise exception 'Estado de pago no válido.' using errcode='22023'; end if;

  if p_key='students_active' then
    select count(*) into v_value
    from public.student_profiles sp join public.people p on p.id=sp.person_id
    where sp.active and (v_country is null or p.country_code=v_country);
  elsif p_key='new_students' then
    select count(*) into v_value
    from public.student_profiles sp join public.people p on p.id=sp.person_id
    where sp.student_since>=p_from::date and sp.student_since<p_to::date+1
      and (v_country is null or p.country_code=v_country);
  elsif p_key in ('credit_sales','credit_grants') then
    select case when p_key='credit_sales' then coalesce(sum(cg.price_cents),0)::numeric else count(*)::numeric end into v_value
    from public.credit_grants cg
    where cg.purchased_at>=p_from and cg.purchased_at<p_to
      and cg.payment_status=v_payment_status
      and (v_student is null or exists(select 1 from public.credit_grant_members gm where gm.grant_id=cg.id and gm.person_id=v_student));
  else
    raise exception 'Métrica de alumnado/negocio no soportada.' using errcode='22023';
  end if;
  return v_value;
end;
$$;
revoke all on function private.statistics_people_business_metric(text,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
