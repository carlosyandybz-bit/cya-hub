grant select, insert, update, delete on table public.class_financial_items to authenticated;
grant select, insert, update, delete on table public.class_financial_accounts to authenticated;
grant select, insert, update, delete on table public.class_payment_movements to authenticated;
grant select, insert, update, delete on table public.class_video_resources to authenticated;

grant select, insert, update, delete on table public.class_financial_items to service_role;
grant select, insert, update, delete on table public.class_financial_accounts to service_role;
grant select, insert, update, delete on table public.class_payment_movements to service_role;
grant select, insert, update, delete on table public.class_video_resources to service_role;

grant usage, select on sequence public.class_financial_items_id_seq to authenticated, service_role;
grant usage, select on sequence public.class_payment_movements_id_seq to authenticated, service_role;
grant usage, select on sequence public.class_video_resources_id_seq to authenticated, service_role;