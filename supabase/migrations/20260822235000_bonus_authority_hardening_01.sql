-- BONUS-AUTHORITY-HARDENING-01 — Billing core authority primitives.
-- STAGING authoring candidate only. DO NOT APPLY from this branch without independent QA.
-- Recovery: forward-fix. The applied BONUS-USABILITY-01 migration remains immutable.

do $$
begin
  if to_regprocedure('private.credit_grant_is_usable_unchecked(bigint,timestamp with time zone)') is null
     or to_regprocedure('private.credit_grant_balance_minutes_unchecked(bigint)') is null
     or to_regprocedure('public.billing_person_facts(bigint,timestamp with time zone)') is null then
    raise exception 'BONUS-AUTHORITY-HARDENING-01 requires applied BONUS-USABILITY-01 canonical helpers.';
  end if;
end
$$;

alter table public.credit_movements
  add column if not exists source_operation_key text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.credit_movements'::regclass
      and conname = 'credit_movements_source_operation_key_nonblank'
  ) then
    alter table public.credit_movements
      add constraint credit_movements_source_operation_key_nonblank
      check (source_operation_key is null or btrim(source_operation_key) <> '');
  end if;
end
$$;

create unique index if not exists credit_movements_source_operation_key_uidx
  on public.credit_movements(source_operation_key)
  where source_operation_key is not null;

comment on column public.credit_movements.source_operation_key is
  'Server-side idempotency key for canonical Billing mutations. Historical rows remain NULL.';

-- Transitional fail-closed protection: legacy direct Staff writers still need INSERT
-- until cross-domain convergence, but they must not be able to mint/squat canonical
-- idempotency keys. Existing legacy inserts omit the new column and remain NULL.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'credit_movements'
      and policyname = 'movements_staff_insert'
      and cmd = 'INSERT'
  ) then
    raise exception 'BONUS-AUTHORITY-HARDENING-01 requires movements_staff_insert transitional policy.';
  end if;
end
$$;

alter policy movements_staff_insert
  on public.credit_movements
  with check ((select private.is_staff()) and source_operation_key is null);

create or replace function public.consume_credit_grant_for_class(
  p_grant_id bigint,
  p_person_id bigint,
  p_class_id bigint,
  p_minutes integer,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grant public.credit_grants%rowtype;
  v_existing public.credit_movements%rowtype;
  v_inserted public.credit_movements%rowtype;
  v_balance_before integer;
  v_balance_after integer;
  v_operation_key text := nullif(btrim(p_operation_key), '');
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para consumir saldo de bonos.'
      using errcode = '42501';
  end if;

  if p_grant_id is null or p_person_id is null or p_class_id is null then
    raise exception 'Bono, persona y clase son obligatorios.'
      using errcode = '22023';
  end if;
  if p_minutes is null or p_minutes <= 0 then
    raise exception 'Los minutos a consumir deben ser mayores que cero.'
      using errcode = '22023';
  end if;
  if v_operation_key is null then
    raise exception 'La clave de idempotencia es obligatoria.'
      using errcode = '22023';
  end if;
  if length(v_operation_key) > 200 then
    raise exception 'La clave de idempotencia es demasiado larga.'
      using errcode = '22023';
  end if;

  select *
    into v_grant
    from public.credit_grants
   where id = p_grant_id
   for update;

  if not found then
    raise exception 'El bono no existe.'
      using errcode = 'P0002';
  end if;

  select *
    into v_existing
    from public.credit_movements
   where source_operation_key = v_operation_key;

  if found then
    if v_existing.grant_id = p_grant_id
       and v_existing.person_id is not distinct from p_person_id
       and v_existing.class_id is not distinct from p_class_id
       and v_existing.movement_type = 'class'
       and v_existing.delta_minutes = -p_minutes
       and coalesce(v_existing.provenance->>'operation', '') = 'consume_credit_grant_for_class' then
      return jsonb_build_object(
        'movement_id', v_existing.id,
        'grant_id', p_grant_id,
        'balance_minutes', private.credit_grant_balance_minutes_unchecked(p_grant_id),
        'grant_status', v_grant.status,
        'idempotent_replay', true
      );
    end if;

    raise exception 'La clave de idempotencia ya pertenece a otra operación.'
      using errcode = '23505';
  end if;

  if not exists (
    select 1
      from public.credit_grant_members gm
     where gm.grant_id = p_grant_id
       and gm.person_id = p_person_id
  ) then
    raise exception 'La persona no pertenece a este bono.'
      using errcode = '22023';
  end if;

  if not private.credit_grant_is_usable_unchecked(p_grant_id, now()) then
    raise exception 'El bono no es utilizable en este momento.'
      using errcode = '22023';
  end if;

  v_balance_before := private.credit_grant_balance_minutes_unchecked(p_grant_id);
  if p_minutes > v_balance_before then
    raise exception 'El bono no tiene saldo suficiente.'
      using errcode = '22023';
  end if;

  insert into public.credit_movements(
    grant_id,
    person_id,
    class_id,
    movement_type,
    delta_minutes,
    note,
    created_by,
    occurred_at,
    date_approximate,
    provenance,
    source_operation_key
  )
  values (
    p_grant_id,
    p_person_id,
    p_class_id,
    'class',
    -p_minutes,
    'Consumo canónico de bono por clase',
    (select auth.uid()),
    now(),
    false,
    jsonb_build_object(
      'authority', 'BONUS-AUTHORITY-HARDENING-01',
      'operation', 'consume_credit_grant_for_class',
      'operation_key', v_operation_key,
      'class_id', p_class_id,
      'person_id', p_person_id
    ),
    v_operation_key
  )
  on conflict do nothing
  returning * into v_inserted;

  if v_inserted.id is null then
    select *
      into v_existing
      from public.credit_movements
     where source_operation_key = v_operation_key;

    if found
       and v_existing.grant_id = p_grant_id
       and v_existing.person_id is not distinct from p_person_id
       and v_existing.class_id is not distinct from p_class_id
       and v_existing.movement_type = 'class'
       and v_existing.delta_minutes = -p_minutes
       and coalesce(v_existing.provenance->>'operation', '') = 'consume_credit_grant_for_class' then
      return jsonb_build_object(
        'movement_id', v_existing.id,
        'grant_id', p_grant_id,
        'balance_minutes', private.credit_grant_balance_minutes_unchecked(p_grant_id),
        'grant_status', (select status from public.credit_grants where id = p_grant_id),
        'idempotent_replay', true
      );
    end if;

    raise exception 'La clave de idempotencia ya pertenece a otra operación.'
      using errcode = '23505';
  end if;

  v_balance_after := v_balance_before - p_minutes;

  if v_balance_after = 0 and v_grant.status = 'active' then
    update public.credit_grants
       set status = 'exhausted',
           updated_at = now()
     where id = p_grant_id
       and status = 'active';
  end if;

  insert into public.audit_events(
    event_type,
    entity_type,
    entity_id,
    summary,
    detail,
    actor_user_id
  )
  values (
    'credit_consumed_canonical',
    'credit_grant',
    p_grant_id::text,
    'Consumo canónico de bono registrado',
    jsonb_build_object(
      'movement_id', v_inserted.id,
      'class_id', p_class_id,
      'person_id', p_person_id,
      'minutes', p_minutes,
      'balance_before', v_balance_before,
      'balance_after', v_balance_after,
      'operation_key', v_operation_key
    ),
    (select auth.uid())
  );

  return jsonb_build_object(
    'movement_id', v_inserted.id,
    'grant_id', p_grant_id,
    'balance_minutes', v_balance_after,
    'grant_status', case when v_balance_after = 0 then 'exhausted' else v_grant.status end,
    'idempotent_replay', false
  );
end;
$$;

create or replace function public.reverse_credit_consumption_for_class(
  p_original_movement_id bigint,
  p_operation_key text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.credit_movements%rowtype;
  v_grant public.credit_grants%rowtype;
  v_existing public.credit_movements%rowtype;
  v_inserted public.credit_movements%rowtype;
  v_operation_key text := nullif(btrim(p_operation_key), '');
  v_reason text := nullif(btrim(p_reason), '');
  v_effective_delta integer;
  v_reversal_minutes integer;
  v_balance_before integer;
  v_balance_after integer;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para revertir consumos de bonos.'
      using errcode = '42501';
  end if;

  if p_original_movement_id is null then
    raise exception 'El movimiento original es obligatorio.'
      using errcode = '22023';
  end if;
  if v_operation_key is null then
    raise exception 'La clave de idempotencia es obligatoria.'
      using errcode = '22023';
  end if;
  if length(v_operation_key) > 200 then
    raise exception 'La clave de idempotencia es demasiado larga.'
      using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception 'El motivo de la reversión es obligatorio.'
      using errcode = '22023';
  end if;

  -- Match the existing correction path lock order (movement -> grant) so a
  -- concurrent correction/reversal of the same source cannot deadlock by inversion.
  select *
    into v_original
    from public.credit_movements
   where id = p_original_movement_id
   for update;

  if not found then
    raise exception 'El movimiento original no existe.'
      using errcode = 'P0002';
  end if;

  select *
    into v_grant
    from public.credit_grants
   where id = v_original.grant_id
   for update;

  if not found then
    raise exception 'El bono del movimiento no existe.'
      using errcode = 'P0002';
  end if;

  if v_original.movement_type <> 'class'
     or v_original.delta_minutes >= 0
     or v_original.class_id is null then
    raise exception 'Solo puede revertirse un consumo de clase.'
      using errcode = '22023';
  end if;

  select *
    into v_existing
    from public.credit_movements
   where source_operation_key = v_operation_key;

  if found then
    if v_existing.grant_id = v_original.grant_id
       and v_existing.reverses_movement_id = v_original.id
       and v_existing.movement_type = 'adjustment'
       and v_existing.delta_minutes > 0
       and coalesce(v_existing.provenance->>'operation', '') = 'reverse_credit_consumption_for_class' then
      return jsonb_build_object(
        'movement_id', v_existing.id,
        'original_movement_id', v_original.id,
        'grant_id', v_original.grant_id,
        'balance_minutes', private.credit_grant_balance_minutes_unchecked(v_original.grant_id),
        'grant_status', v_grant.status,
        'idempotent_replay', true
      );
    end if;

    raise exception 'La clave de idempotencia ya pertenece a otra operación.'
      using errcode = '23505';
  end if;

  if v_grant.payment_status = 'refunded' or v_grant.status = 'cancelled' then
    raise exception 'Un bono terminal no puede reactivarse mediante una reversión.'
      using errcode = '22023';
  end if;

  select v_original.delta_minutes
       + coalesce(sum(m.delta_minutes), 0)::integer
    into v_effective_delta
    from public.credit_movements m
   where m.reverses_movement_id = v_original.id;

  if v_effective_delta >= 0 then
    raise exception 'El consumo ya está completamente revertido.'
      using errcode = '22023';
  end if;

  v_reversal_minutes := -v_effective_delta;
  v_balance_before := private.credit_grant_balance_minutes_unchecked(v_original.grant_id);

  insert into public.credit_movements(
    grant_id,
    person_id,
    class_id,
    movement_type,
    delta_minutes,
    note,
    created_by,
    occurred_at,
    date_approximate,
    reverses_movement_id,
    provenance,
    source_operation_key
  )
  values (
    v_original.grant_id,
    v_original.person_id,
    v_original.class_id,
    'adjustment',
    v_reversal_minutes,
    v_reason,
    (select auth.uid()),
    now(),
    false,
    v_original.id,
    coalesce(v_original.provenance, '{}'::jsonb) || jsonb_build_object(
      'authority', 'BONUS-AUTHORITY-HARDENING-01',
      'operation', 'reverse_credit_consumption_for_class',
      'operation_key', v_operation_key,
      'original_movement_id', v_original.id,
      'reason', v_reason
    ),
    v_operation_key
  )
  on conflict do nothing
  returning * into v_inserted;

  if v_inserted.id is null then
    select *
      into v_existing
      from public.credit_movements
     where source_operation_key = v_operation_key;

    if found
       and v_existing.grant_id = v_original.grant_id
       and v_existing.reverses_movement_id = v_original.id
       and v_existing.movement_type = 'adjustment'
       and v_existing.delta_minutes > 0
       and coalesce(v_existing.provenance->>'operation', '') = 'reverse_credit_consumption_for_class' then
      return jsonb_build_object(
        'movement_id', v_existing.id,
        'original_movement_id', v_original.id,
        'grant_id', v_original.grant_id,
        'balance_minutes', private.credit_grant_balance_minutes_unchecked(v_original.grant_id),
        'grant_status', (select status from public.credit_grants where id = v_original.grant_id),
        'idempotent_replay', true
      );
    end if;

    raise exception 'La clave de idempotencia ya pertenece a otra operación.'
      using errcode = '23505';
  end if;

  v_balance_after := v_balance_before + v_reversal_minutes;

  if v_grant.status = 'exhausted' and v_balance_after > 0 then
    update public.credit_grants
       set status = 'active',
           updated_at = now()
     where id = v_original.grant_id
       and status = 'exhausted'
       and payment_status <> 'refunded';
  end if;

  insert into public.audit_events(
    event_type,
    entity_type,
    entity_id,
    summary,
    detail,
    actor_user_id
  )
  values (
    'credit_consumption_reversed_canonical',
    'credit_grant',
    v_original.grant_id::text,
    'Consumo de clase revertido de forma append-only',
    jsonb_build_object(
      'movement_id', v_inserted.id,
      'original_movement_id', v_original.id,
      'class_id', v_original.class_id,
      'person_id', v_original.person_id,
      'minutes', v_reversal_minutes,
      'balance_before', v_balance_before,
      'balance_after', v_balance_after,
      'operation_key', v_operation_key,
      'reason', v_reason
    ),
    (select auth.uid())
  );

  return jsonb_build_object(
    'movement_id', v_inserted.id,
    'original_movement_id', v_original.id,
    'grant_id', v_original.grant_id,
    'balance_minutes', v_balance_after,
    'grant_status', case when v_grant.status = 'exhausted' and v_balance_after > 0 then 'active' else v_grant.status end,
    'idempotent_replay', false
  );
end;
$$;

create or replace function public.billing_person_bonus_summary(
  p_person_id bigint,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_current_person_id bigint;
  v_grants jsonb;
  v_usable_balance integer;
  v_total_balance integer;
begin
  if not (select private.is_staff()) then
    select private.current_person_id() into v_current_person_id;
    if v_current_person_id is distinct from p_person_id then
      raise exception 'No tienes permiso para consultar este resumen de Billing.'
        using errcode = '42501';
    end if;
  end if;

  if not exists (
    select 1
      from public.people p
     where p.id = p_person_id
       and p.active
  ) then
    raise exception 'La persona no existe o no está activa.'
      using errcode = 'P0002';
  end if;

  with person_grants as (
    select
      g.id,
      g.label,
      g.modality,
      g.total_minutes,
      g.price_cents,
      g.payment_status,
      g.status,
      g.purchased_at,
      g.starts_at,
      g.expires_at,
      private.credit_grant_effective_expires_at_unchecked(g.id, p_at) as effective_expires_at,
      private.credit_grant_is_paused_unchecked(g.id, p_at) as is_paused,
      private.credit_grant_balance_minutes_unchecked(g.id) as balance_minutes,
      private.credit_grant_is_usable_unchecked(g.id, p_at) as is_usable,
      (
        select coalesce(jsonb_agg(gm.person_id order by gm.person_id), '[]'::jsonb)
          from public.credit_grant_members gm
         where gm.grant_id = g.id
      ) as member_person_ids
    from public.credit_grants g
    where exists (
      select 1
        from public.credit_grant_members gm
       where gm.grant_id = g.id
         and gm.person_id = p_person_id
    )
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'grant_id', pg.id,
          'label', pg.label,
          'modality', pg.modality,
          'total_minutes', pg.total_minutes,
          'price_cents', pg.price_cents,
          'payment_status', pg.payment_status,
          'status', pg.status,
          'purchased_at', pg.purchased_at,
          'starts_at', pg.starts_at,
          'expires_at', pg.expires_at,
          'effective_expires_at', pg.effective_expires_at,
          'is_paused', pg.is_paused,
          'balance_minutes', pg.balance_minutes,
          'is_usable', pg.is_usable,
          'member_person_ids', pg.member_person_ids
        )
        order by pg.starts_at desc, pg.id desc
      ),
      '[]'::jsonb
    ),
    coalesce(sum(greatest(pg.balance_minutes, 0)), 0)::integer,
    coalesce(sum(case when pg.is_usable then greatest(pg.balance_minutes, 0) else 0 end), 0)::integer
  into v_grants, v_total_balance, v_usable_balance
  from person_grants pg;

  return jsonb_build_object(
    'person_id', p_person_id,
    'at', p_at,
    'total_positive_balance_minutes', v_total_balance,
    'usable_balance_minutes', v_usable_balance,
    'has_usable_presential_bonus', private.person_has_usable_presential_bonus_unchecked(p_person_id, p_at),
    'has_qualifying_presential_billing_intent', private.person_has_qualifying_presential_billing_intent_unchecked(p_person_id, p_at),
    'grants', v_grants
  );
end;
$$;

revoke all on function public.consume_credit_grant_for_class(bigint,bigint,bigint,integer,text) from public, anon;
grant execute on function public.consume_credit_grant_for_class(bigint,bigint,bigint,integer,text) to authenticated, service_role;

revoke all on function public.reverse_credit_consumption_for_class(bigint,text,text) from public, anon;
grant execute on function public.reverse_credit_consumption_for_class(bigint,text,text) to authenticated, service_role;

revoke all on function public.billing_person_bonus_summary(bigint,timestamptz) from public, anon;
grant execute on function public.billing_person_bonus_summary(bigint,timestamptz) to authenticated, service_role;

-- IMPORTANT — staged hardening boundary:
-- Direct authenticated DML on credit_grants / credit_movements / credit_grant_members
-- is intentionally NOT revoked in Phase 2A. Current cross-domain SECURITY INVOKER
-- consumers (Classes finish/reopen and related legacy paths) still depend on it.
-- The transitional movements_staff_insert policy now forces source_operation_key=NULL,
-- so legacy direct writers cannot mint or squat canonical idempotency keys.
-- Final integration must first migrate those consumers to the canonical Billing API,
-- then execute a separate reviewed forward-fix that REVOKEs table DML and removes
-- grants_staff_insert, grants_staff_update, movements_staff_insert and
-- grant_members_staff_insert. This candidate must not break legitimate consumers.
