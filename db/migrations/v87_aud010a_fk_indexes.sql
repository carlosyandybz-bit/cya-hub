-- CYA Hub · v87 · CYA-AUD-010A · targeted FK indexes
--
-- Performance-only migration. It deliberately:
-- - adds indexes only for operational FK relationships reported by the Supabase advisor;
-- - does not remove any existing/unused index;
-- - does not modify RLS, grants, data, functions or constraints;
-- - leaves audit-only created_by/updated_by FKs for a later stats-backed review.

begin;

-- Academia Online: the existing academy_programs_context_idx starts with
-- style_term_id, so role/level need their own leading-column coverage.
create index if not exists academy_programs_role_term_id_idx
  on public.academy_programs(role_term_id);
create index if not exists academy_programs_level_term_id_idx
  on public.academy_programs(level_term_id);

-- BZ Points / rewards.
create index if not exists bz_action_events_class_id_idx
  on public.bz_action_events(class_id)
  where class_id is not null;
create index if not exists bz_action_events_content_id_idx
  on public.bz_action_events(content_id)
  where content_id is not null;
create index if not exists bz_reward_redemptions_reward_id_idx
  on public.bz_reward_redemptions(reward_id);

-- Class workflow and financial/media relationships.
create index if not exists class_close_grant_artifacts_grant_id_idx
  on public.class_close_grant_artifacts(grant_id);
create index if not exists class_content_events_content_id_idx
  on public.class_content_events(content_id)
  where content_id is not null;
create index if not exists class_financial_items_person_id_idx
  on public.class_financial_items(person_id)
  where person_id is not null;
create index if not exists class_media_resources_person_id_idx
  on public.class_media_resources(person_id)
  where person_id is not null;
create index if not exists class_participants_preferred_billing_grant_id_idx
  on public.class_participants(preferred_billing_grant_id)
  where preferred_billing_grant_id is not null;
create index if not exists class_preparation_requests_content_id_idx
  on public.class_preparation_requests(content_id)
  where content_id is not null;

-- Evaluation context: existing composite indexes start with person_id/class_id,
-- so these FK columns are not independently covered as leading columns.
create index if not exists evaluation_sessions_style_term_id_idx
  on public.evaluation_sessions(style_term_id);
create index if not exists evaluation_sessions_role_term_id_idx
  on public.evaluation_sessions(role_term_id);
create index if not exists evaluation_sessions_level_term_id_idx
  on public.evaluation_sessions(level_term_id);

-- Feedback Online operational relationships.
create index if not exists feedback_credit_orders_product_id_idx
  on public.feedback_credit_orders(product_id);
create index if not exists feedback_request_contents_content_id_idx
  on public.feedback_request_contents(content_id);
create index if not exists feedback_requests_product_id_idx
  on public.feedback_requests(product_id);
create index if not exists feedback_requests_style_term_id_idx
  on public.feedback_requests(style_term_id)
  where style_term_id is not null;
create index if not exists feedback_requests_role_term_id_idx
  on public.feedback_requests(role_term_id)
  where role_term_id is not null;
create index if not exists feedback_requests_level_term_id_idx
  on public.feedback_requests(level_term_id)
  where level_term_id is not null;
create index if not exists feedback_requests_assigned_teacher_user_id_idx
  on public.feedback_requests(assigned_teacher_user_id)
  where assigned_teacher_user_id is not null;
create index if not exists feedback_requests_evaluation_session_id_idx
  on public.feedback_requests(evaluation_session_id)
  where evaluation_session_id is not null;

commit;
