-- P30F3 — Catálogo ampliado con métricas reales disponibles en CyA hub 2.
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
    jsonb_build_object('key','credit_sales','block','business','label','Importe de bonos','format','currency','filters',jsonb_build_array('student','payment_status')),
    jsonb_build_object('key','credit_grants','block','business','label','Bonos','format','number','filters',jsonb_build_array('student','payment_status')),
    jsonb_build_object('key','assignments_created','block','teaching','label','Contenidos asignados','format','number','filters',jsonb_build_array('student','style','content_type')),
    jsonb_build_object('key','assignments_completed','block','teaching','label','Contenidos completados','format','number','filters',jsonb_build_array('student','style','content_type')),
    jsonb_build_object('key','assignments_pending','block','teaching','label','Contenidos pendientes','format','number','filters',jsonb_build_array('student','style','content_type')),
    jsonb_build_object('key','evaluations_count','block','teaching','label','Evaluaciones','format','number','filters',jsonb_build_array('teacher','student','style')),
    jsonb_build_object('key','evaluation_average','block','teaching','label','Media de evaluación','format','number','filters',jsonb_build_array('teacher','student','style')),
    jsonb_build_object('key','marketing_spend','block','marketing','label','Inversión en campañas','format','currency','filters',jsonb_build_array('campaign')),
    jsonb_build_object('key','marketing_revenue','block','marketing','label','Ingresos atribuidos','format','currency','filters',jsonb_build_array('campaign')),
    jsonb_build_object('key','marketing_impressions','block','marketing','label','Impresiones','format','number','filters',jsonb_build_array('campaign')),
    jsonb_build_object('key','marketing_reach','block','marketing','label','Alcance','format','number','filters',jsonb_build_array('campaign')),
    jsonb_build_object('key','marketing_clicks','block','marketing','label','Clics','format','number','filters',jsonb_build_array('campaign')),
    jsonb_build_object('key','marketing_inquiries','block','marketing','label','Consultas','format','number','filters',jsonb_build_array('campaign')),
    jsonb_build_object('key','marketing_bookings','block','marketing','label','Reservas de campañas','format','number','filters',jsonb_build_array('campaign')),
    jsonb_build_object('key','marketing_ctr','block','marketing','label','CTR','format','percentage','filters',jsonb_build_array('campaign')),
    jsonb_build_object('key','marketing_inquiry_rate','block','marketing','label','Conversión clic → consulta','format','percentage','filters',jsonb_build_array('campaign')),
    jsonb_build_object('key','marketing_booking_rate','block','marketing','label','Conversión consulta → reserva','format','percentage','filters',jsonb_build_array('campaign')),
    jsonb_build_object('key','marketing_roi','block','marketing','label','ROI de campañas','format','percentage','filters',jsonb_build_array('campaign')),
    jsonb_build_object('key','missions_open','block','operations','label','Misiones abiertas','format','number','filters',jsonb_build_array('mission_type','priority')),
    jsonb_build_object('key','missions_completed','block','operations','label','Misiones completadas','format','number','filters',jsonb_build_array('teacher','mission_type','priority')),
    jsonb_build_object('key','missions_not_done','block','operations','label','Misiones no realizadas / caducadas','format','number','filters',jsonb_build_array('mission_type','priority')),
    jsonb_build_object('key','notifications_sent','block','operations','label','Notificaciones enviadas','format','number','filters',jsonb_build_array('channel','event_key')),
    jsonb_build_object('key','notifications_failed','block','operations','label','Notificaciones fallidas','format','number','filters',jsonb_build_array('channel','event_key')),
    jsonb_build_object('key','notification_attempts','block','operations','label','Intentos de notificación','format','number','filters',jsonb_build_array('channel','event_key'))
  ) else jsonb_build_array() end;
$$;
revoke all on function public.statistics_metric_catalog() from public,anon;
grant execute on function public.statistics_metric_catalog() to authenticated;
