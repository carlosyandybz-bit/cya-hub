alter view public.crm_person_explorer_v set (security_invoker = true);
alter view public.crm_person_pedagogy_v set (security_invoker = true);
alter view public.crm_person_credit_v set (security_invoker = true);
revoke all on public.crm_person_explorer_v from anon, authenticated;
revoke all on public.crm_person_pedagogy_v from anon, authenticated;
revoke all on public.crm_person_credit_v from anon, authenticated;
