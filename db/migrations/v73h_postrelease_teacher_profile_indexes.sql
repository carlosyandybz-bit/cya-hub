-- Cierra los avisos de rendimiento introducidos por el perfil profesional.

create index if not exists teacher_profile_styles_style_term_id_idx
  on public.teacher_profile_styles(style_term_id);

create index if not exists teacher_profiles_created_by_idx
  on public.teacher_profiles(created_by)
  where created_by is not null;

create index if not exists teacher_profiles_updated_by_idx
  on public.teacher_profiles(updated_by)
  where updated_by is not null;
