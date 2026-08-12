-- CYA Hub P0F / v56
-- Completa el contrato administrativo de hitos: umbral válido 0..100.
-- Incremental, idempotente y sin modificación de puntuaciones o históricos.

begin;

alter table public.evaluation_milestones
  drop constraint if exists evaluation_milestones_threshold_score_check;

alter table public.evaluation_milestones
  add constraint evaluation_milestones_threshold_score_check
  check (threshold_score >= 0 and threshold_score <= 100);

commit;
