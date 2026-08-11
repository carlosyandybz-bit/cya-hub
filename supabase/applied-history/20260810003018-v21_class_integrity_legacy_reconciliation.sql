-- Reconcile legacy finished classes using the timestamps that already existed.
-- Never invent historical elapsed time when started_at is unavailable.

with elapsed as (
  select id,
         greatest(1,least(480,round(extract(epoch from (administrative_finished_at-started_at))/60.0)::integer)) as minutes
  from public.classes
  where status='finished' and started_at is not null and administrative_finished_at is not null
)
update public.classes c
set actual_end_at=c.administrative_finished_at,
    actual_duration_minutes=e.minutes,
    duration_source='elapsed',
    billed_duration_minutes=case
      when exists(select 1 from public.credit_movements m where m.class_id=c.id and m.movement_type='class') then c.billed_duration_minutes
      else e.minutes
    end,
    updated_at=now()
from elapsed e
where c.id=e.id and c.duration_source='legacy_scheduled';

-- For legacy participants without a grant, the outstanding amount must follow the recovered actual duration.
update public.class_participants cp
set billed_minutes=case when cp.attendance_status='present' then coalesce(c.billed_duration_minutes,c.actual_duration_minutes,c.duration_minutes) else 0 end,
    uncovered_minutes=case when cp.attendance_status='present' and cp.billing_grant_id is null then coalesce(c.actual_duration_minutes,c.duration_minutes) else 0 end,
    billing_status=case
      when cp.attendance_status='absent' then 'not_billable'
      when cp.attendance_status='present' and cp.billing_grant_id is null then 'uncovered'
      when cp.attendance_status='present' then 'covered'
      else 'planned'
    end,
    updated_at=now()
from public.classes c
where c.id=cp.class_id and c.status='finished';

-- Turn legacy uncovered attendance into explicit incidents, now using recovered real time when available.
with candidates as (
  select cp.class_id,cp.person_id,cp.uncovered_minutes,
         'legacy:class:'||cp.class_id::text||':person:'||cp.person_id::text as dedupe_key
  from public.class_participants cp
  join public.classes c on c.id=cp.class_id
  where c.status='finished' and cp.attendance_status='present' and cp.uncovered_minutes>0
), inserted as (
  insert into public.student_incidents(
    incident_type,status,title,related_class_id,related_grant_id,debt_minutes,remaining_minutes,dedupe_key,detail,created_by
  )
  select 'negative_balance','open','Saldo pendiente de una clase anterior',class_id,null,uncovered_minutes,uncovered_minutes,dedupe_key,
         jsonb_build_object('origin','legacy_reconciliation'),null
  from candidates
  on conflict (dedupe_key) do nothing
  returning id,dedupe_key
)
insert into public.student_incident_people(incident_id,person_id)
select i.id,c.person_id
from candidates c
join public.student_incidents i on i.dedupe_key=c.dedupe_key
on conflict do nothing;

-- Cover newly introduced foreign keys reported by the database advisor.
create index if not exists classes_administratively_finished_by_idx on public.classes(administratively_finished_by) where administratively_finished_by is not null;
create index if not exists student_incidents_created_by_idx on public.student_incidents(created_by) where created_by is not null;
create index if not exists student_incidents_related_grant_idx on public.student_incidents(related_grant_id) where related_grant_id is not null;
create index if not exists student_incidents_resolution_grant_idx on public.student_incidents(resolution_grant_id) where resolution_grant_id is not null;
create index if not exists student_incidents_resolved_by_idx on public.student_incidents(resolved_by) where resolved_by is not null;