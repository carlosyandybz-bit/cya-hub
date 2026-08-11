-- CYA Hub · v48b · P20
-- Covering index for the v48 foreign key form_versions.published_by.

create index if not exists form_versions_published_by_idx
  on public.form_versions(published_by);
