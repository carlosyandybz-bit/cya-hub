begin;

create table public.credit_grants (
  id bigint generated always as identity primary key,
  modality text not null check (modality in ('individual','pair')),
  label text,
  total_minutes integer not null check (total_minutes > 0 and total_minutes <= 100000),
  price_cents integer not null default 0 check (price_cents >= 0),
  payment_status text not null default 'paid' check (payment_status in ('paid','pending','refunded')),
  status text not null default 'active' check (status in ('active','exhausted','cancelled')),
  purchased_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.credit_grant_members (
  grant_id bigint not null references public.credit_grants(id) on delete cascade,
  person_id bigint not null references public.student_profiles(person_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (grant_id,person_id)
);

create table public.classes (
  id bigint generated always as identity primary key,
  teacher_user_id uuid not null references auth.users(id) on delete restrict,
  class_type text not null check (class_type in ('individual','pair')),
  status text not null default 'scheduled' check (status in ('scheduled','active','finished','cancelled')),
  scheduled_start_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes > 0 and duration_minutes <= 480),
  style_term_id bigint references public.catalog_terms(id) on delete set null,
  location_term_id bigint references public.catalog_terms(id) on delete set null,
  notes text,
  started_at timestamptz,
  administrative_finished_at timestamptz,
  pedagogy_closed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  rescheduled_from_id bigint references public.classes(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.class_participants (
  class_id bigint not null references public.classes(id) on delete cascade,
  person_id bigint not null references public.student_profiles(person_id) on delete restrict,
  attendance_status text not null default 'planned' check (attendance_status in ('planned','present','absent')),
  billing_grant_id bigint references public.credit_grants(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (class_id,person_id)
);

create table public.credit_movements (
  id bigint generated always as identity primary key,
  grant_id bigint not null references public.credit_grants(id) on delete restrict,
  person_id bigint references public.student_profiles(person_id) on delete set null,
  class_id bigint references public.classes(id) on delete set null,
  movement_type text not null check (movement_type in ('grant','class','adjustment','refund')),
  delta_minutes integer not null check (delta_minutes <> 0),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index credit_grants_status_purchased_idx on public.credit_grants(status,purchased_at desc);
create index credit_grants_created_by_idx on public.credit_grants(created_by) where created_by is not null;
create index credit_grant_members_person_id_idx on public.credit_grant_members(person_id,grant_id);
create index classes_teacher_schedule_idx on public.classes(teacher_user_id,status,scheduled_start_at);
create index classes_status_schedule_idx on public.classes(status,scheduled_start_at);
create index classes_style_term_id_idx on public.classes(style_term_id) where style_term_id is not null;
create index classes_location_term_id_idx on public.classes(location_term_id) where location_term_id is not null;
create index classes_rescheduled_from_id_idx on public.classes(rescheduled_from_id) where rescheduled_from_id is not null;
create index classes_created_by_idx on public.classes(created_by) where created_by is not null;
create index class_participants_person_id_idx on public.class_participants(person_id,class_id);
create index class_participants_billing_grant_id_idx on public.class_participants(billing_grant_id) where billing_grant_id is not null;
create index credit_movements_grant_created_idx on public.credit_movements(grant_id,created_at);
create index credit_movements_person_created_idx on public.credit_movements(person_id,created_at) where person_id is not null;
create index credit_movements_class_id_idx on public.credit_movements(class_id) where class_id is not null;
create index credit_movements_created_by_idx on public.credit_movements(created_by) where created_by is not null;

create trigger credit_grants_touch_updated_at before update on public.credit_grants for each row execute function private.touch_updated_at();
create trigger classes_touch_updated_at before update on public.classes for each row execute function private.touch_updated_at();
create trigger class_participants_touch_updated_at before update on public.class_participants for each row execute function private.touch_updated_at();

create function private.can_view_class(p_class_id bigint) returns boolean language sql stable security definer set search_path='' as $$
  select (select private.is_staff()) or exists(
    select 1 from public.class_participants cp join public.people p on p.id=cp.person_id
    where cp.class_id=p_class_id and p.auth_user_id=(select auth.uid())
  );
$$;
create function private.can_view_credit(p_grant_id bigint) returns boolean language sql stable security definer set search_path='' as $$
  select (select private.is_staff()) or exists(
    select 1 from public.credit_grant_members gm join public.people p on p.id=gm.person_id
    where gm.grant_id=p_grant_id and p.auth_user_id=(select auth.uid())
  );
$$;
revoke execute on function private.can_view_class(bigint) from public,anon;
revoke execute on function private.can_view_credit(bigint) from public,anon;
grant execute on function private.can_view_class(bigint) to authenticated;
grant execute on function private.can_view_credit(bigint) to authenticated;

alter table public.credit_grants enable row level security;
alter table public.credit_grant_members enable row level security;
alter table public.classes enable row level security;
alter table public.class_participants enable row level security;
alter table public.credit_movements enable row level security;

create policy classes_select on public.classes for select to authenticated using((select private.can_view_class(id)));
create policy classes_staff_insert on public.classes for insert to authenticated with check((select private.is_staff()) and teacher_user_id=(select auth.uid()) and created_by=(select auth.uid()));
create policy classes_staff_update on public.classes for update to authenticated using((select private.is_staff())) with check((select private.is_staff()));
create policy class_participants_select on public.class_participants for select to authenticated using((select private.can_view_class(class_id)));
create policy class_participants_staff_insert on public.class_participants for insert to authenticated with check((select private.is_staff()));
create policy class_participants_staff_update on public.class_participants for update to authenticated using((select private.is_staff())) with check((select private.is_staff()));
create policy credit_grants_select on public.credit_grants for select to authenticated using((select private.can_view_credit(id)));
create policy credit_grants_staff_insert on public.credit_grants for insert to authenticated with check((select private.is_staff()) and created_by=(select auth.uid()));
create policy credit_grants_staff_update on public.credit_grants for update to authenticated using((select private.is_staff())) with check((select private.is_staff()));
create policy credit_members_select on public.credit_grant_members for select to authenticated using((select private.can_view_credit(grant_id)));
create policy credit_members_staff_insert on public.credit_grant_members for insert to authenticated with check((select private.is_staff()));
create policy credit_movements_select on public.credit_movements for select to authenticated using((select private.can_view_credit(grant_id)));
create policy credit_movements_staff_insert on public.credit_movements for insert to authenticated with check((select private.is_staff()) and created_by=(select auth.uid()));

create function public.schedule_class(
  p_class_type text,
  p_student_ids bigint[],
  p_scheduled_start_at timestamptz,
  p_duration_minutes integer,
  p_style_term_id bigint default null,
  p_location_term_id bigint default null,
  p_notes text default null
) returns public.classes language plpgsql security invoker set search_path='' as $$
declare clean_ids bigint[]; new_class public.classes; expected_count integer;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para programar clases.' using errcode='42501'; end if;
  if p_class_type not in ('individual','pair') then raise exception 'Tipo de clase no válido.' using errcode='22023'; end if;
  select coalesce(array_agg(id order by id),'{}'::bigint[]) into clean_ids from (select distinct unnest(p_student_ids) id) s;
  expected_count:=case when p_class_type='pair' then 2 else 1 end;
  if cardinality(clean_ids)<>expected_count then raise exception 'La clase requiere % alumno(s) distintos.',expected_count using errcode='22023'; end if;
  if p_duration_minutes is null or p_duration_minutes<=0 or p_duration_minutes>480 then raise exception 'Duración no válida.' using errcode='22023'; end if;
  if p_scheduled_start_at is null then raise exception 'Fecha y hora obligatorias.' using errcode='22023'; end if;
  if (select count(*) from public.student_profiles sp join public.people p on p.id=sp.person_id where sp.person_id=any(clean_ids) and sp.active and p.active)<>expected_count then raise exception 'Hay alumnos no válidos o inactivos.' using errcode='22023'; end if;
  insert into public.classes(teacher_user_id,class_type,scheduled_start_at,duration_minutes,style_term_id,location_term_id,notes,created_by)
  values((select auth.uid()),p_class_type,p_scheduled_start_at,p_duration_minutes,p_style_term_id,p_location_term_id,nullif(btrim(p_notes),''),(select auth.uid()))
  returning * into new_class;
  insert into public.class_participants(class_id,person_id) select new_class.id,unnest(clean_ids);
  return new_class;
end;
$$;

create function public.create_credit_grant(
  p_student_ids bigint[],
  p_modality text,
  p_minutes integer,
  p_price_cents integer default 0,
  p_label text default null,
  p_payment_status text default 'paid'
) returns public.credit_grants language plpgsql security invoker set search_path='' as $$
declare clean_ids bigint[]; new_grant public.credit_grants; expected_count integer;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para crear bonos.' using errcode='42501'; end if;
  if p_modality not in ('individual','pair') then raise exception 'Modalidad no válida.' using errcode='22023'; end if;
  select coalesce(array_agg(id order by id),'{}'::bigint[]) into clean_ids from (select distinct unnest(p_student_ids) id) s;
  expected_count:=case when p_modality='pair' then 2 else 1 end;
  if cardinality(clean_ids)<>expected_count then raise exception 'El bono requiere % alumno(s) distintos.',expected_count using errcode='22023'; end if;
  if p_minutes is null or p_minutes<=0 then raise exception 'La duración del bono debe ser positiva.' using errcode='22023'; end if;
  if coalesce(p_price_cents,0)<0 then raise exception 'El importe no puede ser negativo.' using errcode='22023'; end if;
  if p_payment_status not in ('paid','pending') then raise exception 'Estado de pago no válido.' using errcode='22023'; end if;
  if (select count(*) from public.student_profiles sp join public.people p on p.id=sp.person_id where sp.person_id=any(clean_ids) and sp.active and p.active)<>expected_count then raise exception 'Hay alumnos no válidos o inactivos.' using errcode='22023'; end if;
  insert into public.credit_grants(modality,label,total_minutes,price_cents,payment_status,created_by)
  values(p_modality,nullif(btrim(p_label),''),p_minutes,coalesce(p_price_cents,0),p_payment_status,(select auth.uid()))
  returning * into new_grant;
  insert into public.credit_grant_members(grant_id,person_id) select new_grant.id,unnest(clean_ids);
  insert into public.credit_movements(grant_id,movement_type,delta_minutes,note,created_by)
  values(new_grant.id,'grant',p_minutes,'Alta de bono',(select auth.uid()));
  return new_grant;
end;
$$;
revoke all on function public.schedule_class(text,bigint[],timestamptz,integer,bigint,bigint,text) from public,anon;
revoke all on function public.create_credit_grant(bigint[],text,integer,integer,text,text) from public,anon;
grant execute on function public.schedule_class(text,bigint[],timestamptz,integer,bigint,bigint,text) to authenticated;
grant execute on function public.create_credit_grant(bigint[],text,integer,integer,text,text) to authenticated;

revoke all on public.credit_grants,public.credit_grant_members,public.classes,public.class_participants,public.credit_movements from anon,authenticated;
grant select,insert,update on public.credit_grants,public.classes,public.class_participants to authenticated;
grant select,insert on public.credit_grant_members,public.credit_movements to authenticated;
grant usage on sequence public.credit_grants_id_seq,public.classes_id_seq,public.credit_movements_id_seq to authenticated;

commit;
