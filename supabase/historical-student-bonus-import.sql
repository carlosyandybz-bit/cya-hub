-- CYA Hub · historical student import normalization and bonus ledger
-- Production migration applied on 2026-08-16. Kept here as the repository source of truth.

alter table public.student_profiles add column if not exists city text;
alter table public.student_profiles add column if not exists has_partner boolean;
alter table public.student_profiles add column if not exists continues_dancing boolean;
alter table public.student_profiles add column if not exists bought_bonus boolean;
alter table public.student_profiles add column if not exists wedding boolean;
alter table public.student_profiles add column if not exists tourist boolean;
alter table public.student_profiles add column if not exists referred_by text;
alter table public.student_profiles add column if not exists dance_start_label text;
alter table public.student_profiles add column if not exists dance_end_label text;

update public.student_profiles
set city=coalesce(city,legacy_city),
    has_partner=coalesce(has_partner,legacy_has_partner),
    continues_dancing=coalesce(continues_dancing,legacy_continues_dancing),
    bought_bonus=coalesce(bought_bonus,legacy_bought_bonus),
    wedding=coalesce(wedding,legacy_wedding),
    tourist=coalesce(tourist,legacy_tourist),
    referred_by=coalesce(referred_by,legacy_referred_by),
    dance_start_label=coalesce(dance_start_label,legacy_start_label),
    dance_end_label=coalesce(dance_end_label,legacy_end_label)
where legacy_import_source is not null;

create or replace function public.set_credit_grant_consumed_minutes(
  p_grant_id bigint,
  p_consumed_minutes integer,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_grant public.credit_grants;
  v_balance integer;
  v_target_balance integer;
  v_delta integer;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para ajustar el consumo de bonos.' using errcode='42501';
  end if;

  select * into v_grant
  from public.credit_grants
  where id=p_grant_id
  for update;

  if not found then raise exception 'El bono no existe.' using errcode='P0002'; end if;
  if v_grant.status='cancelled' then raise exception 'No se puede ajustar un bono cancelado.' using errcode='22023'; end if;
  if v_grant.payment_status='refunded' then raise exception 'No se puede ajustar un bono reembolsado.' using errcode='22023'; end if;
  if p_consumed_minutes is null or p_consumed_minutes<0 or p_consumed_minutes>v_grant.total_minutes then
    raise exception 'Los minutos consumidos deben estar entre 0 y %.',v_grant.total_minutes using errcode='22023';
  end if;

  select coalesce(sum(delta_minutes),0)::integer
  into v_balance
  from public.credit_movements
  where grant_id=p_grant_id;

  v_target_balance:=v_grant.total_minutes-p_consumed_minutes;
  v_delta:=v_target_balance-v_balance;

  if v_delta<>0 then
    insert into public.credit_movements(grant_id,person_id,movement_type,delta_minutes,note,created_by)
    values(
      p_grant_id,
      null,
      'adjustment',
      v_delta,
      coalesce(nullif(btrim(p_note),''),'Ajuste manual de consumo del bono: '||p_consumed_minutes||' min consumidos.'),
      (select auth.uid())
    );
  end if;

  update public.credit_grants
  set status=case when v_target_balance=0 then 'exhausted' else 'active' end,
      updated_at=now()
  where id=p_grant_id;

  return jsonb_build_object(
    'grant_id',p_grant_id,
    'total_minutes',v_grant.total_minutes,
    'consumed_minutes',p_consumed_minutes,
    'remaining_minutes',v_target_balance,
    'adjustment_minutes',v_delta
  );
end;
$$;

revoke all on function public.set_credit_grant_consumed_minutes(bigint,integer,text) from public;
grant execute on function public.set_credit_grant_consumed_minutes(bigint,integer,text) to authenticated;

-- Historical imported grants are represented by the normal credit ledger:
-- 1) one positive `grant` movement for purchased minutes;
-- 2) an `adjustment` movement for minutes already consumed;
-- 3) status `exhausted` at zero balance and `active` when an admin restores remaining minutes.
-- The production backfill used 60 minutes per historical class because the source workbook
-- stores class counts, not an independent package-duration field. Explicit source pairs
-- (Yvonne+Marcel, Jose+Sara, Paula+Anto) were restored as shared pair grants to avoid
-- duplicating either minutes or revenue. Existing manually-created grants were preserved.
