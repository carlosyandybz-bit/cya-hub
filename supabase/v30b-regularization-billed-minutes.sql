-- CYA Hub v30b
-- A regularization covers previously uncovered minutes; reflect those minutes in participant billed totals.

create or replace function private.apply_regularization_billed_minutes()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.item_type<>'regularization' or coalesce(new.minutes,0)<=0 then
    return new;
  end if;

  update public.class_participants cp
    set billed_minutes=least(coalesce(cp.billed_minutes,0)+new.minutes,c.duration_minutes),
        updated_at=now()
    from public.classes c
    where c.id=new.class_id
      and cp.class_id=new.class_id
      and (new.person_id is null or cp.person_id=new.person_id);

  return new;
end;
$$;

revoke all on function private.apply_regularization_billed_minutes() from public;

drop trigger if exists class_financial_items_regularization_billed_minutes on public.class_financial_items;
create trigger class_financial_items_regularization_billed_minutes
after insert on public.class_financial_items
for each row
when (new.item_type='regularization')
execute function private.apply_regularization_billed_minutes();
