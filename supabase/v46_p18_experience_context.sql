-- v46 — P18 identity/roles/navigation: server-authorized experience context.

create or replace function public.set_experience_context(p_context text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_context text := lower(btrim(coalesce(p_context,'')));
begin
  if v_user is null then
    raise exception 'Necesitas iniciar sesión.' using errcode='42501';
  end if;
  if v_context not in ('teacher','student','admin') then
    raise exception 'Vista no válida.' using errcode='22023';
  end if;

  if v_context='teacher' and not (select private.is_staff()) then
    raise exception 'Tu cuenta no tiene permiso de profesor.' using errcode='42501';
  end if;
  if v_context='student' and not (select private.has_app_role('student')) then
    raise exception 'Tu cuenta no tiene permiso de alumno.' using errcode='42501';
  end if;
  if v_context='admin' and not (select private.is_admin()) then
    raise exception 'Tu cuenta no tiene permiso de administrador.' using errcode='42501';
  end if;

  insert into public.user_preferences(user_id,preferred_context)
  values(v_user,v_context)
  on conflict(user_id) do update
    set preferred_context=excluded.preferred_context,
        updated_at=now();

  return public.identity_context();
end;
$$;

revoke all on function public.set_experience_context(text) from public, anon;
grant execute on function public.set_experience_context(text) to authenticated;
