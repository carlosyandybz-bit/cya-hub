-- v78 — Trigger functions attached to tables with different row shapes must not resolve nonexistent NEW fields.
create or replace function private.bz_registration_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_table_name='people' then
    perform private.bz_reconcile_registration(new.id);
  else
    perform private.bz_reconcile_registration(new.person_id);
  end if;
  return new;
end;
$$;

create or replace function private.bz_credit_grant_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_table_name='credit_grants' then
    perform private.bz_reconcile_credit_grant(new.id);
  else
    perform private.bz_reconcile_credit_grant(new.grant_id);
  end if;
  return new;
end;
$$;

create or replace function private.bz_class_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_table_name='classes' then
    perform private.bz_reconcile_class(new.id);
  else
    perform private.bz_reconcile_class(new.class_id);
  end if;
  return new;
end;
$$;

revoke all on function private.bz_registration_trigger() from public,anon,authenticated;
revoke all on function private.bz_credit_grant_trigger() from public,anon,authenticated;
revoke all on function private.bz_class_trigger() from public,anon,authenticated;
