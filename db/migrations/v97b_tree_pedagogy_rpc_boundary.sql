-- CYA Hub v97b · Explicitly close anonymous access to tree pedagogy SECURITY DEFINER RPCs.
revoke execute on function public.set_teaching_tree_content_mandatory(bigint,bigint,bigint,boolean) from public, anon;
revoke execute on function public.set_student_tree_content_mastery(bigint,bigint,bigint,bigint,text,text,bigint,bigint,text) from public, anon;
revoke execute on function public.accept_tree_evaluation_recommendation(bigint,bigint,bigint,bigint,boolean,bigint,bigint) from public, anon;
revoke execute on function public.get_student_tree_mandatory_progress(bigint,bigint,bigint,bigint) from public, anon;
revoke execute on function public.get_student_tree_recommendations(bigint,bigint,bigint,bigint) from public, anon;
revoke execute on function public.get_student_tree_level_readiness(bigint,bigint,bigint,bigint) from public, anon;

grant execute on function public.set_teaching_tree_content_mandatory(bigint,bigint,bigint,boolean) to authenticated;
grant execute on function public.set_student_tree_content_mastery(bigint,bigint,bigint,bigint,text,text,bigint,bigint,text) to authenticated;
grant execute on function public.accept_tree_evaluation_recommendation(bigint,bigint,bigint,bigint,boolean,bigint,bigint) to authenticated;
grant execute on function public.get_student_tree_mandatory_progress(bigint,bigint,bigint,bigint) to authenticated;
grant execute on function public.get_student_tree_recommendations(bigint,bigint,bigint,bigint) to authenticated;
grant execute on function public.get_student_tree_level_readiness(bigint,bigint,bigint,bigint) to authenticated;
