begin;

grant execute on function private.current_notification_audience() to authenticated;

commit;
