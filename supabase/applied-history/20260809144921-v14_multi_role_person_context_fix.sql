begin;

-- La proyección endurecida anterior exigía que app_members.role fuera
-- literalmente "student". En el modelo multirrol el rol legado sigue siendo
-- admin y la capacidad de alumno vive en app_member_roles.
create or replace function private.current_person_id()
returns bigint language sql stable security definer set search_path='' as $$
  select p.id
  from public.people p
  where p.auth_user_id=(select auth.uid())
    and p.active
    and (select private.has_app_role('student'))
  limit 1;
$$;

revoke all on function private.current_person_id() from public,anon;
grant execute on function private.current_person_id() to authenticated;

commit;
