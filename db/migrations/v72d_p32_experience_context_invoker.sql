-- P32 — set_experience_context no necesita bypass RLS.
-- user_preferences ya concede INSERT/UPDATE a authenticated y limita la fila a auth.uid().

alter function public.set_experience_context(text) security invoker;

revoke all on function public.set_experience_context(text) from public, anon;
grant execute on function public.set_experience_context(text) to authenticated;

comment on function public.set_experience_context(text) is
  'P32: SECURITY INVOKER; cambia únicamente la preferencia de contexto del usuario actual bajo RLS.';
