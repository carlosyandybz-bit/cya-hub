from pathlib import Path

path = Path('supabase/v31-class-workflow-realtime.sql')
s = path.read_text()
old = """  select a.*,t.content_type into v_assignment,v_type from public.student_content_assignments a join public.teaching_contents t on t.id=a.content_id where a.id=p_assignment_id for update of a;\n  if not found then raise exception 'La asignación no existe.' using errcode='P0002'; end if;\n  if (v_type='correction' and p_assignment_status not in ('pending','corrected')) or (v_type in ('explanation','sequence') and p_assignment_status not in ('pending','explained')) or (v_type='exercise' and p_assignment_status not in ('pending','active','completed')) then raise exception 'Estado no válido para este tipo de contenido.' using errcode='22023'; end if;"""
new = """  select a into v_assignment from public.student_content_assignments a where a.id=p_assignment_id for update;\n  if not found then raise exception 'La asignación no existe.' using errcode='P0002'; end if;\n  select t.content_type into v_type from public.teaching_contents t where t.id=v_assignment.content_id;\n  if (v_type='correction' and p_assignment_status not in ('pending','corrected')) or (v_type in ('explanation','sequence') and p_assignment_status not in ('pending','explained')) or (v_type='exercise' and p_assignment_status not in ('pending','active','completed')) then raise exception 'Estado no válido para este tipo de contenido.' using errcode='22023'; end if;"""
if old not in s:
    raise SystemExit('v31 target SQL block not found')
s = s.replace(old,new)
path.write_text(s)
print('v31 SQL block fixed')
