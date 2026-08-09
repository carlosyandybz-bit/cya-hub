
create table public.communication_recipients (
  id bigint generated always as identity primary key,
  campaign_id bigint not null references public.marketing_campaigns(id) on delete cascade,
  person_id bigint not null references public.people(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','email')),
  destination text,
  message_snapshot text not null check (length(btrim(message_snapshot)) > 0),
  media_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(media_snapshot) = 'array'),
  status text not null default 'ready' check (status in ('ready','sent','skipped','failed')),
  blocked_reason text,
  prepared_at timestamptz not null default now(),
  sent_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, person_id, channel),
  check ((status = 'skipped') or length(btrim(coalesce(destination,''))) > 0)
);

create table public.communication_events (
  id bigint generated always as identity primary key,
  recipient_id bigint not null references public.communication_recipients(id) on delete cascade,
  event_type text not null check (event_type in ('prepared','sent','skipped','failed')),
  detail text,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index communication_recipients_person_idx on public.communication_recipients(person_id);
create index communication_recipients_campaign_status_idx on public.communication_recipients(campaign_id,status,updated_at desc);
create index communication_events_recipient_time_idx on public.communication_events(recipient_id,occurred_at desc);

alter table public.communication_recipients enable row level security;
alter table public.communication_events enable row level security;

create policy communication_recipients_staff_select on public.communication_recipients
  for select to authenticated using ((select private.is_staff()));
create policy communication_recipients_staff_insert on public.communication_recipients
  for insert to authenticated with check ((select private.is_staff()));
create policy communication_recipients_staff_update on public.communication_recipients
  for update to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

create policy communication_events_staff_select on public.communication_events
  for select to authenticated using ((select private.is_staff()));
create policy communication_events_staff_insert on public.communication_events
  for insert to authenticated with check ((select private.is_staff()));

revoke all on table public.communication_recipients, public.communication_events from public, anon;
grant select, insert, update on table public.communication_recipients to authenticated;
grant select, insert on table public.communication_events to authenticated;
revoke all on sequence public.communication_recipients_id_seq, public.communication_events_id_seq from public, anon;
grant usage, select on sequence public.communication_recipients_id_seq, public.communication_events_id_seq to authenticated;

create or replace function public.prepare_campaign_recipients(
  p_campaign_id bigint,
  p_person_ids bigint[] default null
)
returns table(ready_count bigint, skipped_count bigint, sent_count bigint, total_count bigint)
language plpgsql
set search_path = ''
as $$
declare
  v_campaign public.marketing_campaigns%rowtype;
  v_person record;
  v_recipient_id bigint;
  v_result_status text;
  v_destination text;
  v_reason text;
  v_message text;
  v_media jsonb;
  v_event_title text;
  v_event_url text;
  v_digits text;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para preparar comunicaciones.' using errcode='42501';
  end if;

  select * into v_campaign
  from public.marketing_campaigns
  where id = p_campaign_id
  for update;

  if not found then raise exception 'La campaña no existe.' using errcode='P0002'; end if;
  if v_campaign.channel not in ('whatsapp','email') then
    raise exception 'Esta campaña no usa un canal de mensajería.' using errcode='22023';
  end if;
  if length(btrim(coalesce(v_campaign.message,''))) = 0 then
    raise exception 'Escribe el mensaje antes de preparar el envío.' using errcode='22023';
  end if;
  if v_campaign.audience_scope = 'custom' and coalesce(array_length(p_person_ids,1),0) = 0 then
    raise exception 'Selecciona al menos un destinatario.' using errcode='22023';
  end if;

  select e.title, e.registration_url into v_event_title, v_event_url
  from public.marketing_events e where e.id = v_campaign.event_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'media_type', m.media_type,
        'provider', m.provider,
        'external_file_id', m.external_file_id,
        'title', m.title
      )
      order by m.sort_order, m.id
    ),
    '[]'::jsonb
  )
  into v_media
  from public.marketing_campaign_media m
  where m.campaign_id = p_campaign_id;

  update public.communication_recipients
  set status='skipped', blocked_reason='Fuera de la audiencia actual', updated_at=now()
  where campaign_id=p_campaign_id and status <> 'sent';

  for v_person in
    select p.id, p.display_name, p.first_name, p.phone, p.email, p.country_code, p.crm_stage,
           coalesce(cp.contact_permission,'unknown') as contact_permission
    from public.people p
    left join public.crm_profiles cp on cp.person_id=p.id
    where p.active
      and case v_campaign.audience_scope
        when 'potential' then p.crm_stage in ('new','contacted','interested','booked')
        when 'students' then p.crm_stage='student'
        when 'all' then p.crm_stage <> 'lost'
        when 'custom' then p.id = any(coalesce(p_person_ids,array[]::bigint[]))
        else false
      end
    order by p.display_name, p.id
  loop
    v_reason := null;
    v_destination := null;

    if v_campaign.channel='whatsapp' then
      v_digits := regexp_replace(coalesce(v_person.phone,''),'[^0-9]','','g');
      if btrim(coalesce(v_person.phone,'')) <> '' then
        if left(btrim(v_person.phone),1)='+' then
          v_destination := nullif(v_digits,'');
        elsif upper(coalesce(v_person.country_code,''))='ES' and length(v_digits)=9 then
          v_destination := '34' || v_digits;
        elsif upper(coalesce(v_person.country_code,''))='ES' and length(v_digits)=11 and left(v_digits,2)='34' then
          v_destination := v_digits;
        elsif length(v_digits) >= 11 then
          v_destination := v_digits;
        end if;
      end if;
    else
      v_destination := nullif(lower(btrim(coalesce(v_person.email,''))),'');
    end if;

    if v_person.contact_permission='blocked' then
      v_reason := 'Marcado como no contactar';
    elsif v_person.contact_permission <> 'allowed' then
      v_reason := 'Permiso de comunicaciones sin confirmar';
    elsif v_campaign.channel='whatsapp' and v_destination is null then
      v_reason := case when btrim(coalesce(v_person.phone,''))='' then 'Sin teléfono' else 'Añade el prefijo internacional al teléfono' end;
    elsif v_campaign.channel='email' and v_destination is null then
      v_reason := 'Sin email';
    end if;

    v_message := replace(
      replace(
        replace(
          replace(v_campaign.message,'{nombre}',coalesce(nullif(btrim(v_person.first_name),''),v_person.display_name)),
          '{nombre_completo}',v_person.display_name
        ),
        '{evento}',coalesce(v_event_title,'')
      ),
      '{enlace}',coalesce(v_event_url,'')
    );

    insert into public.communication_recipients(
      campaign_id,person_id,channel,destination,message_snapshot,media_snapshot,status,blocked_reason,prepared_at,created_by
    )
    values(
      p_campaign_id,v_person.id,v_campaign.channel,v_destination,v_message,v_media,
      case when v_reason is null then 'ready' else 'skipped' end,
      v_reason,now(),(select auth.uid())
    )
    on conflict(campaign_id,person_id,channel) do update set
      destination=case when communication_recipients.status='sent' then communication_recipients.destination else excluded.destination end,
      message_snapshot=case when communication_recipients.status='sent' then communication_recipients.message_snapshot else excluded.message_snapshot end,
      media_snapshot=case when communication_recipients.status='sent' then communication_recipients.media_snapshot else excluded.media_snapshot end,
      status=case when communication_recipients.status='sent' then 'sent' else excluded.status end,
      blocked_reason=case when communication_recipients.status='sent' then communication_recipients.blocked_reason else excluded.blocked_reason end,
      prepared_at=case when communication_recipients.status='sent' then communication_recipients.prepared_at else now() end,
      updated_at=now()
    returning id,status into v_recipient_id,v_result_status;

    if v_result_status <> 'sent' then
      insert into public.communication_events(recipient_id,event_type,detail,created_by)
      values(v_recipient_id,case when v_reason is null then 'prepared' else 'skipped' end,v_reason,(select auth.uid()));
    end if;
  end loop;

  return query
    select count(*) filter (where r.status='ready'),
           count(*) filter (where r.status='skipped'),
           count(*) filter (where r.status='sent'),
           count(*)
    from public.communication_recipients r
    where r.campaign_id=p_campaign_id;
end;
$$;

create or replace function public.mark_communication_sent(p_recipient_id bigint)
returns public.communication_recipients
language plpgsql
set search_path = ''
as $$
declare
  v_recipient public.communication_recipients;
  v_campaign_title text;
  v_stage text;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para registrar comunicaciones.' using errcode='42501';
  end if;

  select * into v_recipient
  from public.communication_recipients
  where id=p_recipient_id
  for update;

  if not found then raise exception 'El destinatario no existe.' using errcode='P0002'; end if;
  if v_recipient.status='skipped' then
    raise exception 'Este contacto no está habilitado para recibir la campaña.' using errcode='22023';
  end if;
  if v_recipient.status='sent' then return v_recipient; end if;

  update public.communication_recipients
  set status='sent', sent_at=now(), blocked_reason=null, updated_at=now()
  where id=p_recipient_id
  returning * into v_recipient;

  select c.title into v_campaign_title
  from public.marketing_campaigns c
  where c.id=v_recipient.campaign_id;

  select p.crm_stage into v_stage
  from public.people p
  where p.id=v_recipient.person_id
  for update;

  if v_stage='new' then
    update public.people set crm_stage='contacted',updated_at=now()
    where id=v_recipient.person_id;
    insert into public.crm_activities(person_id,activity_type,summary,from_stage,to_stage,created_by)
    values(v_recipient.person_id,'stage_change','Estado actualizado al registrar un mensaje enviado','new','contacted',(select auth.uid()));
  end if;

  insert into public.crm_activities(person_id,activity_type,summary,created_by)
  values(v_recipient.person_id,'message','Mensaje enviado · '||coalesce(v_campaign_title,'Campaña'),(select auth.uid()));

  insert into public.communication_events(recipient_id,event_type,detail,created_by)
  values(v_recipient.id,'sent','Confirmado manualmente desde CYA Hub',(select auth.uid()));

  return v_recipient;
end;
$$;

revoke all on function public.prepare_campaign_recipients(bigint,bigint[]) from public, anon;
revoke all on function public.mark_communication_sent(bigint) from public, anon;
grant execute on function public.prepare_campaign_recipients(bigint,bigint[]) to authenticated;
grant execute on function public.mark_communication_sent(bigint) to authenticated;

