create or replace view public.crm_person_pedagogy_v as
select a.person_id,
  coalesce(jsonb_agg(jsonb_build_object('assignment_id',a.id,'content_id',a.content_id,'title',tc.title,'content_type',tc.content_type,'assignment_status',a.assignment_status,'frequency',a.current_frequency,'importance',a.current_importance,'assigned_at',a.assigned_at,'completed_at',a.completed_at) order by a.updated_at desc,a.id desc),'[]'::jsonb) as content_assignments,
  count(*)::integer as assigned_content_count,
  count(*) filter (where a.assignment_status not in ('completed','corrected','archived','cancelled'))::integer as active_content_count,
  count(*) filter (where tc.content_type='correction' and a.assignment_status not in ('completed','corrected','archived','cancelled'))::integer as active_corrections_count,
  count(*) filter (where tc.content_type='explanation' and a.assignment_status not in ('completed','corrected','archived','cancelled'))::integer as active_explanations_count,
  count(*) filter (where tc.content_type='exercise' and a.assignment_status not in ('completed','corrected','archived','cancelled'))::integer as active_exercises_count,
  count(*) filter (where tc.content_type='sequence' and a.assignment_status not in ('completed','corrected','archived','cancelled'))::integer as active_sequences_count
from public.student_content_assignments a join public.teaching_contents tc on tc.id=a.content_id
where tc.active group by a.person_id;

create or replace view public.crm_person_credit_v as
with member_grants as (
  select gm.person_id,g.id,g.label,g.modality,g.total_minutes,g.price_cents,g.payment_status,g.status,g.purchased_at,g.expires_at
  from public.credit_grant_members gm join public.credit_grants g on g.id=gm.grant_id
), movements as (
  select person_id,sum(delta_minutes)::integer as credit_balance_minutes from public.credit_movements where person_id is not null group by person_id
)
select mg.person_id,count(distinct mg.id)::integer as credit_grant_count,
  count(distinct mg.id) filter (where mg.status='active' and mg.payment_status in ('paid','pending'))::integer as active_credit_grant_count,
  coalesce(m.credit_balance_minutes,0)::integer as credit_balance_minutes,coalesce(m.credit_balance_minutes,0)>0 as has_credit_balance,
  coalesce(jsonb_agg(distinct jsonb_build_object('grant_id',mg.id,'label',mg.label,'modality',mg.modality,'total_minutes',mg.total_minutes,'payment_status',mg.payment_status,'status',mg.status,'purchased_at',mg.purchased_at,'expires_at',mg.expires_at)),'[]'::jsonb) as credit_grants
from member_grants mg left join movements m on m.person_id=mg.person_id group by mg.person_id,m.credit_balance_minutes;

create or replace function public.crm_person_explorer_snapshot()
returns jsonb language plpgsql security definer set search_path='public','private' as $$
begin
  if not private.is_staff() then raise exception 'staff_required'; end if;
  return coalesce((select jsonb_agg(to_jsonb(v)||(coalesce(to_jsonb(pg),'{}'::jsonb)-'person_id')||(coalesce(to_jsonb(cr),'{}'::jsonb)-'person_id') order by v.display_name)
    from public.crm_person_explorer_v v left join public.crm_person_pedagogy_v pg on pg.person_id=v.person_id left join public.crm_person_credit_v cr on cr.person_id=v.person_id),'[]'::jsonb);
end $$;
revoke all on function public.crm_person_explorer_snapshot() from public,anon;
grant execute on function public.crm_person_explorer_snapshot() to authenticated;
