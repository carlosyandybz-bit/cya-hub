-- P32 — Backup/restauración final tras P30/P31.
-- Amplía el inventario canónico; restore_json_table y apply_backup_restore consumen esta función.

create or replace function private.backup_tables_for_domain(p_domain text)
returns text[]
language sql
stable
set search_path=''
as $$
  select case p_domain
    when 'people' then array[
      'people','student_profiles','student_dance_profiles','crm_profiles','crm_activities',
      'student_incidents','student_incident_people'
    ]::text[]
    when 'classes' then array[
      'catalog_terms','evaluation_milestones','evaluation_descriptors',
      'classes','class_participants','class_notes','evaluation_sessions','student_evaluations',
      'student_aptitude_progress','evaluation_progress_awards','evaluation_milestone_decisions',
      'class_financial_items','class_financial_accounts','class_payment_movements',
      'class_video_resources','class_close_grant_artifacts','class_content_events',
      'class_media_resources','class_pedagogy_summaries','class_preparation_requests'
    ]::text[]
    when 'credits' then array[
      'people','student_profiles','credit_grants','credit_grant_members','credit_movements',
      'student_incidents','student_incident_people','class_financial_items',
      'class_financial_accounts','class_payment_movements','class_close_grant_artifacts'
    ]::text[]
    when 'teaching' then array[
      'catalog_terms','evaluation_milestones','evaluation_descriptors',
      'teaching_contents','teaching_content_styles','teaching_content_roles',
      'teaching_content_levels','teaching_content_tags','teaching_content_relations',
      'teaching_content_media','teaching_content_evaluation_points',
      'teaching_content_evaluation_recommendations','class_video_resources',
      'student_content_assignments','student_content_measurements','evaluation_sessions',
      'student_evaluations','student_aptitude_progress','evaluation_progress_awards',
      'evaluation_milestone_decisions'
    ]::text[]
    when 'missions' then array[
      'mission_engine_settings','mission_rules','missions','mission_comments','mission_evidence'
    ]::text[]
    when 'marketing' then array[
      'marketing_rates','marketing_content','marketing_content_media','marketing_events',
      'marketing_campaigns','marketing_campaign_media','marketing_campaign_metrics',
      'communication_recipients','communication_events'
    ]::text[]
    when 'forms' then array[
      'form_definitions','form_versions','form_fields','form_submissions'
    ]::text[]
    when 'calendar' then array[
      'calendar_connections','calendar_events'
    ]::text[]
    when 'settings' then array[
      'user_profiles','user_preferences','app_members','app_member_roles','catalog_terms',
      'app_appearance_settings','app_operational_defaults',
      'statistics_settings','statistics_metric_settings','statistics_dashboards',
      'statistics_dashboard_cards','statistics_dashboard_assignments',
      'evaluation_milestones','evaluation_descriptors','teaching_content_evaluation_points',
      'teaching_content_evaluation_recommendations','daily_quotes','daily_quote_assignments',
      'notification_rules','notification_deliveries','internal_notifications','integration_settings'
    ]::text[]
    when 'complete' then array[
      'user_profiles','user_preferences','app_members','app_member_roles','catalog_terms',
      'app_appearance_settings','app_operational_defaults',
      'statistics_settings','statistics_metric_settings','statistics_dashboards',
      'statistics_dashboard_cards','statistics_dashboard_assignments',
      'evaluation_milestones','evaluation_descriptors','marketing_rates',
      'people','student_profiles','crm_profiles','crm_activities','student_dance_profiles',
      'integration_settings','calendar_connections','calendar_events',
      'marketing_events','marketing_content','marketing_content_media','marketing_campaigns',
      'marketing_campaign_media','marketing_campaign_metrics','communication_recipients','communication_events',
      'classes','credit_grants','credit_grant_members','class_participants','credit_movements','class_notes',
      'evaluation_sessions','student_evaluations','student_aptitude_progress','evaluation_progress_awards',
      'evaluation_milestone_decisions','class_financial_items','class_financial_accounts',
      'class_payment_movements','class_video_resources','class_close_grant_artifacts',
      'student_incidents','student_incident_people',
      'teaching_contents','teaching_content_styles','teaching_content_roles','teaching_content_levels',
      'teaching_content_tags','teaching_content_media','teaching_content_relations',
      'teaching_content_evaluation_points','teaching_content_evaluation_recommendations',
      'student_content_assignments','student_content_measurements',
      'mission_engine_settings','mission_rules','missions','mission_comments','mission_evidence',
      'daily_quotes','daily_quote_assignments','notification_rules','internal_notifications',
      'notification_deliveries','form_definitions','form_versions','form_fields','form_submissions',
      'class_content_events','class_media_resources','class_pedagogy_summaries','class_preparation_requests',
      'audit_events'
    ]::text[]
    else null
  end;
$$;

revoke all on function private.backup_tables_for_domain(text) from public, anon, authenticated;
