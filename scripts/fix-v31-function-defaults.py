from pathlib import Path
p=Path('supabase/v31-class-workflow-realtime.sql')
s=p.read_text()
old="create or replace function public.create_class_correction(p_class_id bigint,p_person_id bigint,p_title text,p_measurement_mode text,p_frequency smallint,p_importance smallint)"
new="create or replace function public.create_class_correction(p_class_id bigint,p_person_id bigint,p_title text,p_measurement_mode text,p_frequency smallint default null,p_importance smallint default null)"
if old not in s:
    raise SystemExit('create_class_correction signature not found')
s=s.replace(old,new,1)
p.write_text(s)
print('v31 function defaults preserved')
