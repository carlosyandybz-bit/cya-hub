with candidates as (
  select cp.class_id, cp.person_id, cp.uncovered_minutes,
         'legacy:class:'||cp.class_id::text||':person:'||cp.person_id::text as dedupe_key
  from public.class_participants cp
  join public.classes c on c.id=cp.class_id
  where c.status='finished'
    and cp.attendance_status='present'
    and cp.uncovered_minutes>0
), inserted as (
  insert into public.student_incidents(
    incident_type,status,title,related_class_id,related_grant_id,debt_minutes,remaining_minutes,dedupe_key,detail,created_by
  )
  select 'negative_balance','open','Saldo pendiente de una clase anterior',class_id,null,uncovered_minutes,uncovered_minutes,dedupe_key,
         jsonb_build_object('origin','legacy_reconciliation'),null
  from candidates
  on conflict (dedupe_key) do update set updated_at=now()
  returning id,dedupe_key
)
insert into public.student_incident_people(incident_id,person_id)
select i.id,c.person_id
from candidates c
join public.student_incidents i on i.dedupe_key=c.dedupe_key
on conflict do nothing;