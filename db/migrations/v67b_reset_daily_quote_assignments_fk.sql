-- Correctivo runtime 2026-08-14
-- daily_quote_assignments es estado derivado de daily_quotes. El FK RESTRICT
-- bloquea el reinicio completo al borrar frases diarias. El ciclo de vida
-- correcto es CASCADE: borrar una frase elimina únicamente sus asignaciones.

alter table public.daily_quote_assignments
  drop constraint if exists daily_quote_assignments_quote_id_fkey;

alter table public.daily_quote_assignments
  add constraint daily_quote_assignments_quote_id_fkey
  foreign key (quote_id)
  references public.daily_quotes(id)
  on delete cascade;

comment on constraint daily_quote_assignments_quote_id_fkey on public.daily_quote_assignments
  is 'Assignments are derived from a daily quote and must disappear when that quote is deliberately removed by reset/admin operations.';