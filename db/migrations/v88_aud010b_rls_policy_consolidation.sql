-- CYA Hub · v88 · CYA-AUD-010B · consolidate overlapping permissive RLS policies
--
-- Performance/security-preserving migration. It deliberately:
-- - consolidates only policy pairs reported by Supabase multiple_permissive_policies;
-- - preserves the effective staff OR student authorization predicates;
-- - preserves existing policy target roles (authenticated/public) and table grants;
-- - does not modify data, functions, constraints, indexes or RLS enablement.

begin;

-- class_content_events: staff sees all; students only their closed, visible events.
drop policy if exists class_content_events_staff_all on public.class_content_events;
drop policy if exists class_content_events_student_select on public.class_content_events;

create policy class_content_events_read
on public.class_content_events
for select to authenticated
using (
  (select private.is_staff())
  or (
    visible_to_student
    and person_id=(select private.current_person_id())
    and exists (
      select 1 from public.classes c
      where c.id=class_content_events.class_id
        and c.pedagogy_closed_at is not null
    )
  )
);
create policy class_content_events_staff_insert
on public.class_content_events for insert to authenticated
with check ((select private.is_staff()));
create policy class_content_events_staff_update
on public.class_content_events for update to authenticated
using ((select private.is_staff()))
with check ((select private.is_staff()));
create policy class_content_events_staff_delete
on public.class_content_events for delete to authenticated
using ((select private.is_staff()));

-- class_financial_accounts: keep the historical TO public scope exactly as-is.
drop policy if exists class_financial_accounts_staff_all on public.class_financial_accounts;
drop policy if exists class_financial_accounts_student_select on public.class_financial_accounts;

create policy class_financial_accounts_read
on public.class_financial_accounts
for select to public
using (
  (select private.is_staff())
  or exists (
    select 1 from public.class_participants cp
    where cp.class_id=class_financial_accounts.class_id
      and cp.person_id=(select private.current_person_id())
  )
);
create policy class_financial_accounts_staff_insert
on public.class_financial_accounts for insert to public
with check ((select private.is_staff()));
create policy class_financial_accounts_staff_update
on public.class_financial_accounts for update to public
using ((select private.is_staff()))
with check ((select private.is_staff()));
create policy class_financial_accounts_staff_delete
on public.class_financial_accounts for delete to public
using ((select private.is_staff()));

-- class_media_resources: staff sees all; students only their media after pedagogical close.
drop policy if exists class_media_resources_staff_all on public.class_media_resources;
drop policy if exists class_media_resources_student_select on public.class_media_resources;

create policy class_media_resources_read
on public.class_media_resources
for select to authenticated
using (
  (select private.is_staff())
  or (
    person_id=(select private.current_person_id())
    and exists (
      select 1 from public.classes c
      where c.id=class_media_resources.class_id
        and c.pedagogy_closed_at is not null
    )
  )
);
create policy class_media_resources_staff_insert
on public.class_media_resources for insert to authenticated
with check ((select private.is_staff()));
create policy class_media_resources_staff_update
on public.class_media_resources for update to authenticated
using ((select private.is_staff()))
with check ((select private.is_staff()));
create policy class_media_resources_staff_delete
on public.class_media_resources for delete to authenticated
using ((select private.is_staff()));

-- class_notes already has separate write policies; only SELECT overlaps.
drop policy if exists class_notes_staff_select on public.class_notes;
drop policy if exists class_notes_student_select on public.class_notes;

create policy class_notes_read
on public.class_notes
for select to authenticated
using (
  (select private.is_staff())
  or (select private.can_read_student_class_note(class_notes.class_id,class_notes.person_id,class_notes.visibility_scope))
);

-- class_payment_movements: keep the historical TO public scope exactly as-is.
drop policy if exists class_payment_movements_staff_all on public.class_payment_movements;
drop policy if exists class_payment_movements_student_select on public.class_payment_movements;

create policy class_payment_movements_read
on public.class_payment_movements
for select to public
using (
  (select private.is_staff())
  or exists (
    select 1 from public.class_participants cp
    where cp.class_id=class_payment_movements.class_id
      and cp.person_id=(select private.current_person_id())
  )
);
create policy class_payment_movements_staff_insert
on public.class_payment_movements for insert to public
with check ((select private.is_staff()));
create policy class_payment_movements_staff_update
on public.class_payment_movements for update to public
using ((select private.is_staff()))
with check ((select private.is_staff()));
create policy class_payment_movements_staff_delete
on public.class_payment_movements for delete to public
using ((select private.is_staff()));

-- class_preparation_requests overlaps for every DML action.
drop policy if exists class_preparation_requests_staff_all on public.class_preparation_requests;
drop policy if exists class_preparation_requests_student_select on public.class_preparation_requests;
drop policy if exists class_preparation_requests_student_insert on public.class_preparation_requests;
drop policy if exists class_preparation_requests_student_update on public.class_preparation_requests;
drop policy if exists class_preparation_requests_student_delete on public.class_preparation_requests;

create policy class_preparation_requests_read
on public.class_preparation_requests
for select to authenticated
using (
  (select private.is_staff())
  or person_id=(select private.current_person_id())
);
create policy class_preparation_requests_insert
on public.class_preparation_requests
for insert to authenticated
with check (
  (select private.is_staff())
  or (select private.can_manage_own_scheduled_class_preparation(class_preparation_requests.class_id,class_preparation_requests.person_id))
);
create policy class_preparation_requests_update
on public.class_preparation_requests
for update to authenticated
using (
  (select private.is_staff())
  or (select private.can_manage_own_scheduled_class_preparation(class_preparation_requests.class_id,class_preparation_requests.person_id))
)
with check (
  (select private.is_staff())
  or (select private.can_manage_own_scheduled_class_preparation(class_preparation_requests.class_id,class_preparation_requests.person_id))
);
create policy class_preparation_requests_delete
on public.class_preparation_requests
for delete to authenticated
using (
  (select private.is_staff())
  or (
    person_id=(select private.current_person_id())
    and exists (
      select 1 from public.classes c
      where c.id=class_preparation_requests.class_id
        and c.status='scheduled'
    )
  )
);

-- class_video_resources: preserve historical public staff policy scope.
drop policy if exists class_video_resources_staff_all on public.class_video_resources;
drop policy if exists class_video_resources_student_select on public.class_video_resources;

create policy class_video_resources_read
on public.class_video_resources
for select to public
using (
  (select private.is_staff())
  or (
    visibility_scope='private_student'
    and person_id=(select private.current_person_id())
    and exists (
      select 1 from public.classes c
      where c.id=class_video_resources.class_id
        and c.pedagogy_closed_at is not null
    )
  )
);
create policy class_video_resources_staff_insert
on public.class_video_resources for insert to public
with check ((select private.is_staff()));
create policy class_video_resources_staff_update
on public.class_video_resources for update to public
using ((select private.is_staff()))
with check ((select private.is_staff()));
create policy class_video_resources_staff_delete
on public.class_video_resources for delete to public
using ((select private.is_staff()));

-- evaluation_sessions already has separate staff write policies; only SELECT overlaps.
drop policy if exists evaluation_sessions_staff_select on public.evaluation_sessions;
drop policy if exists evaluation_sessions_student_select on public.evaluation_sessions;

create policy evaluation_sessions_read
on public.evaluation_sessions
for select to authenticated
using (
  (select private.is_staff())
  or (
    person_id=(select private.current_person_id())
    and status='completed'
    and (
      class_id is null
      or exists (
        select 1 from public.classes c
        where c.id=evaluation_sessions.class_id
          and c.pedagogy_closed_at is not null
      )
    )
  )
);

commit;
