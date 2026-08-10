-- CYA Hub v27
-- Enforce compatible grants and support atomic single-class payment.
create or replace function public.administratively_finish_class_v3(
  p_class_id bigint,
  p_person_ids bigint[],
  p_attendance text[],
  p_grant_ids bigint[],
  p_actual_duration_minutes integer default null,
  p_direct_payment_price_cents integer default null
)
returns public.classes
language plpgsql
set search_path=''
as $$
declare
  v_class public.classes;
  v_class_people bigint[];
  v_effective_grants bigint[]:=coalesce(p_grant_ids,'{}'::bigint[]);
  v_grant_id bigint;
  v_grant_modality text;
  v_grant_people bigint[];
  v_balance integer;
  v_new_grant public.credit_grants;
  v_duration integer;
  i integer;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para terminar clases.' using errcode='42501';
  end if;
  select * into v_class from public.classes where id=p_class_id;
  if not found then raise exception 'La clase no existe.' using errcode='P0002'; end if;
  select coalesce(array_agg(person_id order by person_id),'{}'::bigint[]) into v_class_people
    from public.class_participants where class_id=p_class_id;
  if cardinality(coalesce(p_person_ids,'{}'::bigint[]))<>cardinality(v_class_people)
     or cardinality(v_effective_grants)<>cardinality(v_class_people) then
    raise exception 'La selección de alumnos o bonos no coincide con la clase.' using errcode='22023';
  end if;

  if p_direct_payment_price_cents is not null then
    if p_direct_payment_price_cents<0 then raise exception 'El importe no puede ser negativo.' using errcode='22023'; end if;
    if exists(select 1 from unnest(v_effective_grants) g where g is not null) then
      raise exception 'No se puede combinar un bono con el pago de clase suelta.' using errcode='22023';
    end if;
    v_duration:=coalesce(p_actual_duration_minutes,v_class.duration_minutes);
    if v_duration is null or v_duration<=0 or v_duration>480 then
      raise exception 'La duración de la clase no es válida.' using errcode='22023';
    end if;
    select * into v_new_grant from public.create_credit_grant(
      v_class_people,v_class.class_type,v_duration,p_direct_payment_price_cents,'Clase suelta','paid'
    );
    v_effective_grants:=array_fill(v_new_grant.id,array[cardinality(v_class_people)]);
  end if;

  if v_class.class_type='pair' and exists(select 1 from unnest(v_effective_grants) g where g is not null) then
    if cardinality(array_remove(v_effective_grants,null))<>cardinality(v_class_people)
       or (select count(distinct g) from unnest(v_effective_grants) g where g is not null)<>1 then
      raise exception 'La clase en pareja debe usar un único bono de pareja para ambos alumnos.' using errcode='22023';
    end if;
  end if;

  for i in 1..cardinality(v_effective_grants) loop
    v_grant_id:=v_effective_grants[i];
    if v_grant_id is null then continue; end if;
    select modality into v_grant_modality
      from public.credit_grants
      where id=v_grant_id and status='active' and (expires_at is null or expires_at>now());
    if not found then raise exception 'El bono seleccionado no está activo o ha caducado.' using errcode='22023'; end if;
    if v_grant_modality<>v_class.class_type then
      raise exception 'El bono seleccionado no es compatible con la modalidad de la clase.' using errcode='22023';
    end if;
    select coalesce(array_agg(person_id order by person_id),'{}'::bigint[]) into v_grant_people
      from public.credit_grant_members where grant_id=v_grant_id;
    if v_class.class_type='pair' then
      if v_grant_people is distinct from v_class_people then
        raise exception 'El bono de pareja no corresponde a esta pareja.' using errcode='22023';
      end if;
    elsif v_grant_people is distinct from array[p_person_ids[i]]::bigint[] then
      raise exception 'El bono individual no corresponde a este alumno.' using errcode='22023';
    end if;
    select coalesce(sum(delta_minutes),0)::integer into v_balance from public.credit_movements where grant_id=v_grant_id;
    if v_balance<=0 then raise exception 'El bono seleccionado no tiene saldo disponible.' using errcode='22023'; end if;
  end loop;

  return public.administratively_finish_class_v2(
    p_class_id,p_person_ids,p_attendance,v_effective_grants,p_actual_duration_minutes
  );
end;
$$;
