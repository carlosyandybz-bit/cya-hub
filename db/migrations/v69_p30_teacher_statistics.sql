-- P30 — Estadísticas globales para cualquier profesor.
-- Lectura agregada sobre fuentes canónicas; no crea un almacén analítico paralelo.

create or replace function public.teacher_statistics_snapshot(p_days integer default 30)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_days integer:=coalesce(p_days,30);
  v_now timestamptz:=now();
  v_from timestamptz;
  v_previous_from timestamptz;
  v_previous_to timestamptz;
  v_current jsonb;
  v_previous jsonb;
  v_marketing jsonb;
  v_operation jsonb;
  v_pedagogy jsonb;
begin
  if not (select private.is_staff()) then
    raise exception 'Las estadísticas globales están disponibles para profesores.' using errcode='42501';
  end if;
  if v_days not in (30,90,365) then
    raise exception 'Periodo no válido. Usa 30, 90 o 365 días.' using errcode='22023';
  end if;

  v_from:=v_now-make_interval(days=>v_days);
  v_previous_to:=v_from;
  v_previous_from:=v_previous_to-make_interval(days=>v_days);

  select jsonb_build_object(
    'students_active',(select count(*) from public.student_profiles sp where sp.active),
    'classes_finished',(select count(*) from public.classes c where c.status='finished' and c.scheduled_start_at>=v_from and c.scheduled_start_at<v_now),
    'class_minutes',(select coalesce(sum(coalesce(c.actual_duration_minutes,c.duration_minutes)),0) from public.classes c where c.status='finished' and c.scheduled_start_at>=v_from and c.scheduled_start_at<v_now),
    'attendance_present',(select count(*) from public.class_participants cp join public.classes c on c.id=cp.class_id where cp.attendance_status='present' and c.scheduled_start_at>=v_from and c.scheduled_start_at<v_now),
    'attendance_absent',(select count(*) from public.class_participants cp join public.classes c on c.id=cp.class_id where cp.attendance_status='absent' and c.scheduled_start_at>=v_from and c.scheduled_start_at<v_now),
    'credit_sales_cents',(select coalesce(sum(cg.price_cents),0) from public.credit_grants cg where cg.payment_status='paid' and cg.purchased_at>=v_from and cg.purchased_at<v_now),
    'credit_grants_sold',(select count(*) from public.credit_grants cg where cg.payment_status='paid' and cg.purchased_at>=v_from and cg.purchased_at<v_now),
    'new_students',(select count(*) from public.student_profiles sp where sp.student_since is not null and sp.student_since>=v_from::date and sp.student_since<v_now::date+1),
    'pending_debt_minutes',(select coalesce(sum(cp.uncovered_minutes),0) from public.class_participants cp join public.classes c on c.id=cp.class_id where cp.uncovered_minutes>0 and c.scheduled_start_at>=v_from and c.scheduled_start_at<v_now)
  ) into v_current;

  select jsonb_build_object(
    'classes_finished',(select count(*) from public.classes c where c.status='finished' and c.scheduled_start_at>=v_previous_from and c.scheduled_start_at<v_previous_to),
    'class_minutes',(select coalesce(sum(coalesce(c.actual_duration_minutes,c.duration_minutes)),0) from public.classes c where c.status='finished' and c.scheduled_start_at>=v_previous_from and c.scheduled_start_at<v_previous_to),
    'credit_sales_cents',(select coalesce(sum(cg.price_cents),0) from public.credit_grants cg where cg.payment_status='paid' and cg.purchased_at>=v_previous_from and cg.purchased_at<v_previous_to),
    'credit_grants_sold',(select count(*) from public.credit_grants cg where cg.payment_status='paid' and cg.purchased_at>=v_previous_from and cg.purchased_at<v_previous_to),
    'new_students',(select count(*) from public.student_profiles sp where sp.student_since is not null and sp.student_since>=v_previous_from::date and sp.student_since<v_previous_to::date)
  ) into v_previous;

  select jsonb_build_object(
    'evaluations',(select count(*) from public.student_evaluations e where e.created_at>=v_from and e.created_at<v_now),
    'evaluation_average',(select round(avg(e.score)::numeric,1) from public.student_evaluations e where e.created_at>=v_from and e.created_at<v_now),
    'assignments_created',(select count(*) from public.student_content_assignments a where a.assigned_at>=v_from and a.assigned_at<v_now),
    'assignments_completed',(select count(*) from public.student_content_assignments a where a.completed_at>=v_from and a.completed_at<v_now),
    'assignments_pending',(select count(*) from public.student_content_assignments a where a.assignment_status='pending'),
    'students_evaluated',(select count(distinct e.person_id) from public.student_evaluations e where e.created_at>=v_from and e.created_at<v_now)
  ) into v_pedagogy;

  select jsonb_build_object(
    'campaigns',(select count(*) from public.marketing_campaigns mc where mc.created_at>=v_from and mc.created_at<v_now),
    'spend_cents',(select coalesce(sum(mm.spend_cents),0) from public.marketing_campaign_metrics mm where mm.metric_date>=v_from::date and mm.metric_date<=v_now::date),
    'revenue_cents',(select coalesce(sum(mm.revenue_cents),0) from public.marketing_campaign_metrics mm where mm.metric_date>=v_from::date and mm.metric_date<=v_now::date),
    'bookings',(select coalesce(sum(mm.bookings),0) from public.marketing_campaign_metrics mm where mm.metric_date>=v_from::date and mm.metric_date<=v_now::date),
    'metric_rows',(select count(*) from public.marketing_campaign_metrics mm where mm.metric_date>=v_from::date and mm.metric_date<=v_now::date),
    'messages_sent',(select count(*) from public.communication_recipients cr where cr.status='sent' and cr.sent_at>=v_from and cr.sent_at<v_now),
    'messages_blocked',(select count(*) from public.communication_recipients cr where cr.status='blocked' and cr.created_at>=v_from and cr.created_at<v_now)
  ) into v_marketing;

  select jsonb_build_object(
    'missions_completed',(select count(*) from public.missions m where m.state in ('completed','completed_automatically') and m.completed_at>=v_from and m.completed_at<v_now),
    'missions_open',(select count(*) from public.missions m where m.state in ('available','upcoming')),
    'missions_not_done',(select count(*) from public.missions m where m.state in ('not_done','expired') and coalesce(m.expired_at,m.updated_at)>=v_from),
    'notifications_sent',(select count(*) from public.notification_deliveries nd where nd.status='sent' and nd.sent_at>=v_from and nd.sent_at<v_now),
    'notifications_failed',(select count(*) from public.notification_deliveries nd where nd.status='failed' and coalesce(nd.last_attempt_at,nd.queued_at)>=v_from),
    'notification_attempts',(select coalesce(sum(nd.attempt_count),0) from public.notification_deliveries nd where nd.queued_at>=v_from and nd.queued_at<v_now)
  ) into v_operation;

  return jsonb_build_object(
    'days',v_days,
    'generated_at',v_now,
    'period',jsonb_build_object('from',v_from,'to',v_now),
    'previous_period',jsonb_build_object('from',v_previous_from,'to',v_previous_to),
    'current',v_current,
    'previous',v_previous,
    'pedagogy',v_pedagogy,
    'marketing',v_marketing,
    'operation',v_operation,
    'future',jsonb_build_object(
      'bz_points','pending_module',
      'online_feedback','pending_module',
      'online_academy','pending_module',
      'video_storage','pending_module'
    )
  );
end;
$$;

revoke all on function public.teacher_statistics_snapshot(integer) from public, anon;
grant execute on function public.teacher_statistics_snapshot(integer) to authenticated;

comment on function public.teacher_statistics_snapshot(integer) is 'P30 aggregate statistics for any staff/teacher. Reads canonical operational data and exposes no student-only global access.';
