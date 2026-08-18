-- CYA Hub v97b — legacy compatibility for explicitly self-reported dance level.
-- Existing UI may still write level_term_id; mirror it into the semantic self-reported field.

begin;

create or replace function private.sync_self_reported_dance_level()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if tg_op = 'INSERT' or new.self_reported_level_term_id is null or new.level_term_id is distinct from old.level_term_id then
    new.self_reported_level_term_id := new.level_term_id;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_self_reported_dance_level() from public, anon, authenticated;

drop trigger if exists trg_student_dance_profiles_self_reported_level on public.student_dance_profiles;
create trigger trg_student_dance_profiles_self_reported_level
before insert or update of level_term_id on public.student_dance_profiles
for each row execute function private.sync_self_reported_dance_level();

commit;
