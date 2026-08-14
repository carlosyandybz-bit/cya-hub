-- Reactiva el formulario histórico de profesor sobre el motor P20 genérico.

update public.form_definitions
set status='active',
    settings=(coalesce(settings,'{}'::jsonb) - 'runtime_engine') || jsonb_build_object('runtime_engine','generic_v1'),
    description='Completa tu ficha profesional para que CYA tenga tus datos docentes organizados.',
    updated_at=now()
where form_key='teacher_profile';

update public.form_versions fv
set status='active',published_at=coalesce(published_at,now())
from public.form_definitions fd
where fd.id=fv.form_id and fd.form_key='teacher_profile' and fv.version_number=fd.active_version;

update public.form_fields ff
set canonical_path='teacher_profiles.professional_name',
    help_text='El nombre profesional que utilizas dentro del equipo.'
from public.form_versions fv
join public.form_definitions fd on fd.id=fv.form_id
where ff.form_version_id=fv.id
  and fd.form_key='teacher_profile'
  and fv.version_number=fd.active_version
  and ff.field_key='professional_name';

update public.form_fields ff
set options=jsonb_build_object('catalog_taxonomy','dance_style'),
    help_text='Selecciona los estilos que impartes.'
from public.form_versions fv
join public.form_definitions fd on fd.id=fv.form_id
where ff.form_version_id=fv.id
  and fd.form_key='teacher_profile'
  and fv.version_number=fd.active_version
  and ff.field_key='styles';
