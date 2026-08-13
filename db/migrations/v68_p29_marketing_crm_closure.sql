-- P29 — Marketing / CRM / tarifas / campañas / eventos
-- Cierra la brecha CRM «Bono» sin duplicar datos: el bono se deriva del ledger real.

create or replace function public.crm_bonus_summary()
returns table(
  person_id bigint,
  active_grant_count bigint,
  active_balance_minutes bigint,
  latest_grant_label text,
  latest_grant_price_cents integer,
  latest_grant_payment_status text,
  latest_grant_purchased_at timestamptz
)
language sql
stable
security invoker
set search_path=''
as $$
  with grant_balances as (
    select
      gm.person_id,
      g.id as grant_id,
      g.label,
      g.price_cents,
      g.payment_status,
      g.status,
      g.purchased_at,
      coalesce(sum(m.delta_minutes),0)::bigint as balance_minutes
    from public.credit_grant_members gm
    join public.credit_grants g on g.id=gm.grant_id
    left join public.credit_movements m on m.grant_id=g.id
    where (select private.is_staff())
    group by gm.person_id,g.id,g.label,g.price_cents,g.payment_status,g.status,g.purchased_at
  ), latest as (
    select distinct on (person_id)
      person_id,label,price_cents,payment_status,purchased_at
    from grant_balances
    order by person_id,purchased_at desc,grant_id desc
  )
  select
    b.person_id,
    count(*) filter (where b.status='active')::bigint as active_grant_count,
    coalesce(sum(greatest(b.balance_minutes,0)) filter (where b.status='active'),0)::bigint as active_balance_minutes,
    l.label as latest_grant_label,
    l.price_cents as latest_grant_price_cents,
    l.payment_status as latest_grant_payment_status,
    l.purchased_at as latest_grant_purchased_at
  from grant_balances b
  join latest l using(person_id)
  group by b.person_id,l.label,l.price_cents,l.payment_status,l.purchased_at
  order by b.person_id;
$$;

revoke all on function public.crm_bonus_summary() from public, anon;
grant execute on function public.crm_bonus_summary() to authenticated;

comment on function public.crm_bonus_summary() is 'P29 derived CRM bonus projection. Reads the canonical credit ledger; never duplicates bonus state in CRM.';

-- Cierre explícito de permisos de las RPC de Marketing que la UI usa.
-- Permanecen SECURITY INVOKER y con validaciones internas de staff.
revoke all on function public.save_crm_contact(bigint,text,text,text,text,text,text,text,date,text,boolean,bigint,integer,text,text) from public, anon;
grant execute on function public.save_crm_contact(bigint,text,text,text,text,text,text,text,date,text,boolean,bigint,integer,text,text) to authenticated;

revoke all on function public.prepare_campaign_recipients(bigint,bigint[]) from public, anon;
grant execute on function public.prepare_campaign_recipients(bigint,bigint[]) to authenticated;

revoke all on function public.validate_communication_dispatch(bigint) from public, anon;
grant execute on function public.validate_communication_dispatch(bigint) to authenticated;

revoke all on function public.mark_communication_sent(bigint) from public, anon;
grant execute on function public.mark_communication_sent(bigint) to authenticated;
