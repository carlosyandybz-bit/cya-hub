begin;

revoke all on function public.preview_daily_quote(date) from public;
revoke all on function public.preview_daily_quote(date) from anon;
grant execute on function public.preview_daily_quote(date) to authenticated;

commit;
