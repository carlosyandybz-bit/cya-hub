-- v77 — BZ trigger functions are implementation details and must not be executable by API roles.
revoke all on function private.bz_registration_trigger() from public,anon,authenticated;
revoke all on function private.bz_credit_grant_trigger() from public,anon,authenticated;
revoke all on function private.bz_class_trigger() from public,anon,authenticated;
revoke all on function private.bz_assignment_trigger() from public,anon,authenticated;
revoke all on function private.bz_class_content_event_trigger() from public,anon,authenticated;
