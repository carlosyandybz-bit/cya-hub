-- CYA Hub · v35c · CORTE DEL MODELO DE EVALUACIÓN
-- IMPORTANTE: aplicar en producción únicamente cuando el frontend v35 esté desplegado.
--
-- Efectos:
-- 1) impide cerrar pedagógicamente una clase si cada alumno no tiene su evaluación postclase completada;
-- 2) elimina el autocompletado legado al cerrar la clase;
-- 3) retira a usuarios autenticados las RPC que permitían introducir puntuaciones numéricas manuales.

create or replace function private.require_post_class_evaluation_before_pedagogy_close()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_missing_person bigint;
begin
  if old.pedagogy_closed_at is null and new.pedagogy_closed_at is not null then
    if new.administrative_finished_at is null then
      raise exception 'Termina primero la parte administrativa de la clase.' using errcode='22023';
    end if;

    select cp.person_id into v_missing_person
    from public.class_participants cp
    where cp.class_id=new.id
      and not exists(
        select 1
        from public.evaluation_sessions s
        where s.class_id=new.id
          and s.person_id=cp.person_id
          and s.status='completed'
          and s.completed_at is not null
      )
    order by cp.person_id
    limit 1;

    if v_missing_person is not null then
      raise exception 'Completa la evaluación posterior a la clase de todos los alumnos antes del cierre pedagógico.' using errcode='22023';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_require_post_class_evaluation on public.classes;
create trigger trg_require_post_class_evaluation
before update of pedagogy_closed_at on public.classes
for each row execute function private.require_post_class_evaluation_before_pedagogy_close();

-- El modelo antiguo completaba automáticamente cualquier borrador al cerrar la clase.
-- Eso ya no es válido: la evaluación se completa explícitamente antes del cierre.
drop trigger if exists trg_complete_class_evaluation_sessions on public.classes;

-- Se conservan las funciones antiguas para trazabilidad de migraciones, pero dejan de
-- ser una superficie operativa para el cliente web.
revoke all on function public.save_class_evaluation(bigint,bigint,bigint,smallint) from public,anon,authenticated;
revoke all on function public.save_class_evaluation_v2(bigint,bigint,bigint,bigint,smallint) from public,anon,authenticated;
revoke all on function public.save_evaluation_score(bigint,bigint,smallint,text) from public,anon,authenticated;
revoke all on function public.start_student_evaluation(bigint,bigint,text,bigint,bigint,bigint,text) from public,anon,authenticated;
revoke all on function public.complete_evaluation_session(bigint) from public,anon,authenticated;

-- Única superficie de escritura de evaluación para la aplicación final.
grant execute on function public.prepare_post_class_evaluation(bigint,bigint) to authenticated;
grant execute on function public.decide_evaluation_milestone(bigint,bigint,text,bigint,text) to authenticated;
grant execute on function public.complete_post_class_evaluation(bigint) to authenticated;
