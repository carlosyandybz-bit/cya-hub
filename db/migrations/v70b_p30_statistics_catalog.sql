-- P30B — Catálogo declarativo de métricas y selección del panel actual.

create or replace function public.statistics_metric_catalog()
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select case when private.is_staff() then jsonb_build_array(
    jsonb_build_object('key','classes_count','block','classes','label','Clases','format','number','filters',jsonb_build_array('teacher','student','class_location','location_scope','style','class_status')),
    jsonb_build_object('key','class_minutes','block','classes','label','Minutos impartidos','format','minutes','filters',jsonb_build_array('teacher','student','class_location','location_scope','style','class_status')),
    jsonb_build_object('key','attendance_rate','block','classes','label','Asistencia','format','percentage','filters',jsonb_build_array('teacher','student','class_location','location_scope','style')),
    jsonb_build_object('key','students_active','block','students','label','Alumnos activos','format','number','filters',jsonb_build_array('country')),
    jsonb_build_object('key','new_students','block','students','label','Nuevos alumnos','format','number','filters',jsonb_build_array('country')),
    jsonb_build_object('key','credit_sales','block','business','label','Bonos cobrados','format','currency','filters',jsonb_build_array('student','payment_status')),
    jsonb_build_object('key','credit_grants','block','business','label','Bonos vendidos','format','number','filters',jsonb_build_array('student','payment_status')),
    jsonb_build_object('key','assignments_completed','block','teaching','label','Contenidos completados','format','number','filters',jsonb_build_array('student','style','content_type')),
    jsonb_build_object('key','evaluations_count','block','teaching','label','Evaluaciones','format','number','filters',jsonb_build_array('teacher','student','style')),
    jsonb_build_object('key','evaluation_average','block','teaching','label','Media de evaluación','format','number','filters',jsonb_build_array('teacher','student','style')),
    jsonb_build_object('key','marketing_spend','block','marketing','label','Inversión en campañas','format','currency','filters',jsonb_build_array('campaign')),
    jsonb_build_object('key','marketing_revenue','block','marketing','label','Ingresos atribuidos','format','currency','filters',jsonb_build_array('campaign')),
    jsonb_build_object('key','marketing_bookings','block','marketing','label','Reservas de campañas','format','number','filters',jsonb_build_array('campaign')),
    jsonb_build_object('key','missions_open','block','operations','label','Misiones abiertas','format','number','filters',jsonb_build_array('mission_type','priority')),
    jsonb_build_object('key','missions_completed','block','operations','label','Misiones completadas','format','number','filters',jsonb_build_array('teacher','mission_type','priority')),
    jsonb_build_object('key','notifications_sent','block','operations','label','Notificaciones enviadas','format','number','filters',jsonb_build_array('channel','event_key')),
    jsonb_build_object('key','notifications_failed','block','operations','label','Notificaciones fallidas','format','number','filters',jsonb_build_array('channel','event_key'))
  ) else jsonb_build_array() end;
$$;
revoke all on function public.statistics_metric_catalog() from public,anon;
grant execute on function public.statistics_metric_catalog() to authenticated;

create or replace function public.statistics_dashboard_for_current_user()
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_dashboard public.statistics_dashboards;
begin
  if not private.is_staff() then
    raise exception 'Las estadísticas globales están disponibles para profesores.' using errcode='42501';
  end if;
  select * into v_dashboard
  from public.statistics_dashboards d
  where d.active and (
    (d.scope='personal' and d.target_user_id=v_user) or
    (d.scope='teacher' and d.target_user_id=v_user) or
    d.scope='global'
  )
  order by case d.scope when 'personal' then 1 when 'teacher' then 2 else 3 end,
           d.is_default desc,d.updated_at desc,d.id desc
  limit 1;
  if v_dashboard.id is null then
    return jsonb_build_object('dashboard',null,'cards','[]'::jsonb);
  end if;
  return jsonb_build_object(
    'dashboard',to_jsonb(v_dashboard),
    'cards',coalesce((select jsonb_agg(to_jsonb(c) order by c.position,c.id) from public.statistics_dashboard_cards c where c.dashboard_id=v_dashboard.id and c.active),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.statistics_dashboard_for_current_user() from public,anon;
grant execute on function public.statistics_dashboard_for_current_user() to authenticated;
