from pathlib import Path

app_path = Path('app/cya-app.tsx')
s = app_path.read_text()

# Student-visible notes are loaded separately under RLS, like private class videos.
s = s.replace(
'''  const [privateVideos, setPrivateVideos] = useState<ClassPrivateVideo[]>([]);
  const [portalNow] = useState(() => Date.now());''',
'''  const [privateVideos, setPrivateVideos] = useState<ClassPrivateVideo[]>([]);
  const [studentNotes, setStudentNotes] = useState<ClassNote[]>([]);
  const [portalNow] = useState(() => Date.now());''')

old_load = '''    const videoResult = await db.from("class_video_resources")
      .select("id,class_id,person_id,external_file_id,title,mime_type,created_at")
      .eq("visibility_scope", "private_student")
      .eq("person_id", nextSnapshot.profile.id)
      .order("created_at", { ascending: false });
    if (!videoResult.error) setPrivateVideos((videoResult.data ?? []) as ClassPrivateVideo[]);
    setSnapshot(nextSnapshot);'''
new_load = '''    const [videoResult, noteResult] = await Promise.all([
      db.from("class_video_resources")
        .select("id,class_id,person_id,external_file_id,title,mime_type,created_at")
        .eq("visibility_scope", "private_student")
        .eq("person_id", nextSnapshot.profile.id)
        .order("created_at", { ascending: false }),
      db.from("class_notes")
        .select("id,class_id,person_id,body,visibility_scope,created_at")
        .eq("visibility_scope", "student")
        .eq("person_id", nextSnapshot.profile.id)
        .order("created_at", { ascending: false }),
    ]);
    if (!videoResult.error) setPrivateVideos((videoResult.data ?? []) as ClassPrivateVideo[]);
    if (!noteResult.error) setStudentNotes((noteResult.data ?? []) as ClassNote[]);
    setSnapshot(nextSnapshot);'''
if old_load not in s:
    raise SystemExit('Student portal load marker missing')
s = s.replace(old_load, new_load)

# Live exercise list must keep the newest class-local event per exercise.
s = s.replace(
'''  const personEvents=events.filter((event) => event.person_id===activePersonId), exerciseEvents=[...new Map(personEvents.filter((event) => event.event_type.startsWith('exercise_')).map((event) => [event.content_id,event])).values()];''',
'''  const personEvents=events.filter((event) => event.person_id===activePersonId), exerciseEvents=personEvents.filter((event,index,rows) => event.event_type.startsWith('exercise_') && rows.findIndex((candidate) => candidate.content_id===event.content_id && candidate.event_type.startsWith('exercise_'))===index);''')

portal_anchor = '''      {snapshot.class_summaries?.length ? <article className="card portal-card"><div className="card-head"><h2>Resumen de mis clases</h2><span>{snapshot.class_summaries.length}</span></div><div className="portal-class-summary-list">{snapshot.class_summaries.slice(0,6).map((summary) => <div key={summary.class_id}><strong>{new Intl.DateTimeFormat("es-ES",{day:"numeric",month:"short",year:"numeric"}).format(new Date(summary.closed_at))}</strong><p>{summary.student_message || "Clase cerrada y documentación actualizada."}</p></div>)}</div></article> : null}'''
portal_extra = portal_anchor + '''
      {studentNotes.length ? <article className="card portal-card"><div className="card-head"><h2>Observaciones de mis clases</h2><span>{studentNotes.length}</span></div><div className="portal-class-summary-list">{studentNotes.slice(0,8).map((note) => <div key={note.id}><strong>{new Intl.DateTimeFormat("es-ES",{day:"numeric",month:"short",year:"numeric"}).format(new Date(note.created_at))}</strong><p>{note.body}</p></div>)}</div></article> : null}
      {snapshot.class_activity?.some((event) => event.event_type === "reviewed" || event.event_type.startsWith("exercise_")) ? <article className="card portal-card"><div className="card-head"><h2>Trabajo de mis clases</h2><span>{snapshot.class_activity.filter((event) => event.event_type === "reviewed" || event.event_type.startsWith("exercise_")).filter((event,index,rows) => rows.findIndex((candidate) => candidate.class_id===event.class_id && candidate.content_id===event.content_id)===index).length}</span></div><div className="portal-class-summary-list">{snapshot.class_activity.filter((event) => event.event_type === "reviewed" || event.event_type.startsWith("exercise_")).filter((event,index,rows) => rows.findIndex((candidate) => candidate.class_id===event.class_id && candidate.content_id===event.content_id)===index).slice(0,12).map((event) => <div key={event.id}><strong>{event.title}</strong><p>{event.event_type === "reviewed" ? "Repasado en clase" : event.event_type === "exercise_completed" ? "Ejercicio realizado" : event.event_type === "exercise_active" ? "Ejercicio para trabajar" : "Ejercicio pendiente"}</p></div>)}</div></article> : null}'''
if portal_anchor not in s:
    raise SystemExit('Student portal summary marker missing')
s = s.replace(portal_anchor, portal_extra)
app_path.write_text(s)

sql_path = Path('supabase/v31-class-workflow-realtime.sql')
q = sql_path.read_text()

# Narrow sequence grants to the identities introduced by this migration.
q = q.replace(
'''grant usage,select on all sequences in schema public to authenticated;''',
'''grant usage,select on sequence public.class_content_events_id_seq, public.class_preparation_requests_id_seq, public.class_media_resources_id_seq to authenticated;''')

# Preparation Drive refs must at least have a valid Drive identifier shape.
q = q.replace(
'''  check (body is not null or external_file_id is not null or content_id is not null)
);''',
'''  check (body is not null or external_file_id is not null or content_id is not null),
  check (external_file_id is null or external_file_id ~ '^[A-Za-z0-9_-]{10,200}$')
);''', 1)

# Tighten update policy: the new class must still be the student's own scheduled class.
old_policy = '''drop policy if exists class_preparation_requests_student_update on public.class_preparation_requests;
create policy class_preparation_requests_student_update on public.class_preparation_requests for update to authenticated
  using (person_id=(select private.current_person_id()) and exists(select 1 from public.classes c where c.id=class_id and c.status='scheduled'))
  with check (person_id=(select private.current_person_id()));'''
new_policy = '''drop policy if exists class_preparation_requests_student_update on public.class_preparation_requests;
create policy class_preparation_requests_student_update on public.class_preparation_requests for update to authenticated
  using (person_id=(select private.current_person_id()) and exists(select 1 from public.classes c join public.class_participants cp on cp.class_id=c.id where c.id=class_id and cp.person_id=person_id and c.status='scheduled'))
  with check (person_id=(select private.current_person_id()) and exists(select 1 from public.classes c join public.class_participants cp on cp.class_id=c.id where c.id=class_id and cp.person_id=person_id and c.status='scheduled'));'''
if old_policy not in q:
    raise SystemExit('Preparation update policy marker missing')
q = q.replace(old_policy, new_policy)

security = r'''

-- v31 security closure: pending teaching data is not directly readable by students either.
drop policy if exists student_content_assignments_select on public.student_content_assignments;
create policy student_content_assignments_select on public.student_content_assignments for select to authenticated
  using ((select private.is_staff()) or (
    person_id=(select private.current_person_id())
    and student_visible_at is not null
    and assignment_status in ('corrected','explained','completed')
  ));

drop policy if exists student_content_measurements_select on public.student_content_measurements;
create policy student_content_measurements_select on public.student_content_measurements for select to authenticated
  using ((select private.is_staff()) or exists(
    select 1 from public.student_content_assignments a
    where a.id=student_content_measurements.assignment_id
      and a.person_id=(select private.current_person_id())
      and a.student_visible_at is not null
      and a.assignment_status in ('corrected','explained','completed')
  ));

drop policy if exists class_notes_student_select on public.class_notes;
create policy class_notes_student_select on public.class_notes for select to authenticated
  using (
    visibility_scope='student'
    and person_id=(select private.current_person_id())
    and exists(select 1 from public.classes c where c.id=class_id and c.pedagogy_closed_at is not null)
  );
'''
if 'v31 security closure' not in q:
    q += security
sql_path.write_text(q)
print('Point 10 student delivery and RLS fix applied')
