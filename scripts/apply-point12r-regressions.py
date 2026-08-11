from pathlib import Path
import re


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)


def sub_once(text, pattern, replacement, label, flags=0):
    text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"missing pattern: {label}")
    return text


p = Path("app/cya-app.tsx")
s = p.read_text()

s = replace_once(s, '''const correctionStates = [
  ["pending", "Pendiente de corrección"], ["corrected", "Corregida"],
] as const;''', '''const correctionStates = [
  ["pending", "Pendiente de corrección"], ["in_correction", "En corrección"], ["corrected", "Corregida"],
] as const;''', "three correction states")

s = s.replace("corrections.filter((assignment) => assignment.assignment_status==='pending')", "corrections.filter((assignment) => assignment.assignment_status!=='corrected')")

s = replace_once(s, '''  const [internalText,setInternalText]=useState(""), [studentText,setStudentText]=useState(""), [quickType,setQuickType]=useState<"correction"|"explanation"|"exercise"|"sequence">("explanation"), [quickTitle,setQuickTitle]=useState("");''', '''  const [internalText,setInternalText]=useState(""), [studentText,setStudentText]=useState(""), [quickType,setQuickType]=useState<"correction"|"explanation"|"exercise"|"sequence">("explanation");''', "remove duplicate quick title")
search_kind_effect_anchor = "  const shouldShowSearch=Boolean(search.trim()) || searchKind!=='all';"
s = replace_once(s, search_kind_effect_anchor, search_kind_effect_anchor + "\n  useEffect(() => { if (searchKind!=='all') setQuickType(searchKind); },[searchKind]);", "sync quick type to search filter")

s = sub_once(s, r'''  async function createQuickContent\(\) \{\n    if \(!db \|\| !participant \|\| !quickTitle\.trim\(\) \|\| !contextReady\) return;\n    setBusy\('quick-create'\);\n    const result=quickType==='correction'\n      \? await db\.rpc\('create_class_correction',\{p_class_id:item\.id,p_person_id:participant\.person_id,p_title:quickTitle\.trim\(\),p_measurement_mode:measurementMode,p_frequency:measurementMode==='frequency'\|\|measurementMode==='both'\?frequency:null,p_importance:measurementMode==='importance'\|\|measurementMode==='both'\?importance:null\}\)\n      : await db\.rpc\('create_quick_class_content',\{p_class_id:item\.id,p_person_id:participant\.person_id,p_content_type:quickType,p_title:quickTitle\.trim\(\)\}\);\n    if \(result\.error\) notify\(result\.error\.message\);\n    else \{ const createdType=quickType; setQuickTitle\(''\); await Promise\.all\(\[refresh\(\),loadLive\(\)\]\); notify\(createdType==='correction'\?'Corrección pendiente añadida\.':`\$\{teachingKindLabels\[createdType\]\} apuntada para completar después\.`\); \}\n    setBusy\(''\);\n  \}''', '''  async function createQuickContent() {
    const title=search.trim();
    if (!db || !participant || !title || !contextReady) return;
    setBusy('quick-create');
    const result=quickType==='correction'
      ? await db.rpc('create_class_correction',{p_class_id:item.id,p_person_id:participant.person_id,p_title:title,p_measurement_mode:measurementMode,p_frequency:measurementMode==='frequency'||measurementMode==='both'?frequency:null,p_importance:measurementMode==='importance'||measurementMode==='both'?importance:null})
      : await db.rpc('create_quick_class_content',{p_class_id:item.id,p_person_id:participant.person_id,p_content_type:quickType,p_title:title});
    if (result.error) notify(result.error.message);
    else { const createdType=quickType; setSearch(''); await Promise.all([refresh(),loadLive()]); notify(createdType==='correction'?'Corrección pendiente añadida.':`${teachingKindLabels[createdType]} apuntada para completar después.`); }
    setBusy('');
  }''', "search-based quick create", flags=re.S)

s = sub_once(s, r'''<section className="live-unified-search card"><details className="quick-content-create">.*?</details>\{shouldShowSearch \?''', '''<section className="live-unified-search card">{shouldShowSearch ?''', "remove standalone quick creator", flags=re.S)

create_from_search = '''{!searchLoading && !searchError && search.trim() ? <details className="quick-content-create search-create-new"><summary><Plus/> Crear nuevo: “{search.trim()}”</summary><div><strong>Crear con este nombre</strong><select value={quickType} onChange={(event) => setQuickType(event.target.value as typeof quickType)}><option value="correction">Corrección</option><option value="explanation">Explicación</option><option value="exercise">Ejercicio</option><option value="sequence">Secuencia</option></select>{quickType==='correction' ? <div className="correction-new-grid quick-correction-fields"><label className="field"><span>Medir por</span><select value={measurementMode} onChange={(event) => setMeasurementMode(event.target.value as typeof measurementMode)}><option value="both">Frecuencia + importancia</option><option value="frequency">Frecuencia</option><option value="importance">Importancia</option><option value="none">Sin medición</option></select></label>{measurementMode==='frequency'||measurementMode==='both' ? <label className="field"><span>Frecuencia</span><select value={frequency} onChange={(event) => setFrequency(Number(event.target.value))}>{[0,25,50,75,100].map((value) => <option key={value}>{value}</option>)}</select></label> : null}{measurementMode==='importance'||measurementMode==='both' ? <label className="field"><span>Importancia</span><select value={importance} onChange={(event) => setImportance(Number(event.target.value))}>{[0,25,50,75,100].map((value) => <option key={value}>{value}</option>)}</select></label> : null}</div> : null}<button className="btn" onClick={() => void createQuickContent()} disabled={busy==='quick-create'}>{busy==='quick-create'?'Guardando…':`Crear ${teachingKindLabels[quickType].toLocaleLowerCase("es")}`}</button></div><small>Se reutiliza exactamente “{search.trim()}”; no tienes que volver a escribir el nombre.</small></details> : null}'''
no_matches = '''{!searchLoading && !searchError && !searchResults.length ? <div className="compact-empty"><Search/><span>No hay coincidencias para este alumno, estilo, rol y nivel.</span></div> : null}'''
s = replace_once(s, no_matches, no_matches + create_from_search, "create from search result footer")

s = sub_once(s, r''' actions=\{assignment\.assignment_status==='pending' \? <button className="btn ghost live-mini-action" onClick=\{\(\) => void recordEvent\(assignment\.content_id,'improved'\)\}>↑ Mejorado</button> : null\}''', ''' actions={null}''', "remove cramped improved side action")
quick_status_close = '''</select>{assignment.snapshot_measurement_mode==='frequency'||assignment.snapshot_measurement_mode==='both' ?'''
s = replace_once(s, quick_status_close, '''</select>{assignment.assignment_status!=='corrected' ? <button className="btn ghost live-mini-action live-improved-action" disabled={busy===`event-${assignment.content_id}-improved`} onClick={() => void recordEvent(assignment.content_id,'improved')}>↑ Mejorado</button> : null}{assignment.snapshot_measurement_mode==='frequency'||assignment.snapshot_measurement_mode==='both' ?''', "usable improved quick action")

s = replace_once(s, '''type ClassContentEvent = { id: number; class_id: number; person_id: number; content_id: number; event_type: string; previous_status: string | null; new_status: string | null; payload: Record<string, unknown>; created_at: string; teaching_contents?: { title: string; content_type: string } | null };''', '''type ClassContentEvent = { id: number; class_id: number; person_id: number; content_id: number; event_type: string; previous_status: string | null; new_status: string | null; payload: Record<string, unknown>; visible_to_student?: boolean; created_at: string; teaching_contents?: { title: string; content_type: string } | null };''', "event visibility type")

media_type_old = '''type MediaDraft={id:string;file:File;title:string;kind:"class_document"|"final_dance";audience:string;saved:boolean};'''
media_type_new = '''type MediaDraft={id:string;file:File;title:string;kind:"class_document"|"final_dance";audience:string;mode:"student"|"reusable";contentId:string;saved:boolean};'''
if media_type_old in s:
    s = replace_once(s, media_type_old, media_type_new, "media draft modes")
else:
    s = sub_once(s, r'''type MediaDraft\s*=\s*\{id:string;file:File;title:string;kind:"class_document"\|"final_dance";audience:string;saved:boolean\};''', media_type_new, "media draft modes")

events_state_anchor = '''  const [events,setEvents]=useState<ClassContentEvent[]>([]), [media,setMedia]=useState<MediaDraft[]>([]), [studentMessage,setStudentMessage]=useState(""), [internalNote,setInternalNote]=useState(""), [busy,setBusy]=useState(false), [error,setError]=useState("");'''
if events_state_anchor in s:
    s = replace_once(s, events_state_anchor, '''  const [events,setEvents]=useState<ClassContentEvent[]>([]), [media,setMedia]=useState<MediaDraft[]>([]), [studentMessage,setStudentMessage]=useState(""), [internalNote,setInternalNote]=useState(""), [visibleEventIds,setVisibleEventIds]=useState<Set<number>>(new Set()), [busy,setBusy]=useState(false), [error,setError]=useState("");''', "summary visibility state")
else:
    summary_open = re.search(r'function ClassFinalSummary\([^)]*\) \{\n', s)
    if not summary_open:
        raise SystemExit("missing pattern: ClassFinalSummary start")
    pos = summary_open.end()
    s = s[:pos] + '  const [visibleEventIds,setVisibleEventIds]=useState<Set<number>>(new Set());\n' + s[pos:]

s = s.replace('''select("id,class_id,person_id,content_id,event_type,previous_status,new_status,payload,created_at,teaching_contents(title,content_type)")''', '''select("id,class_id,person_id,content_id,event_type,previous_status,new_status,payload,visible_to_student,created_at,teaching_contents(title,content_type)")''', 1)
old_summary_load = '''then((result) => { if (alive && !result.error) setEvents((result.data ?? []) as unknown as ClassContentEvent[]); });'''
new_summary_load = '''then((result) => { if (alive && !result.error) { const rows=(result.data ?? []) as unknown as ClassContentEvent[]; setEvents(rows); setVisibleEventIds(new Set(rows.filter((event) => event.visible_to_student || event.event_type==='reviewed' || event.event_type==='exercise_active' || event.event_type==='exercise_completed' || (event.event_type==='status_changed' && ['corrected','explained'].includes(event.new_status || ''))).map((event) => event.id))); } });'''
s = replace_once(s, old_summary_load, new_summary_load, "summary default visibility")

s = replace_once(s, '''kind:file.type.startsWith('video/')?'final_dance':'class_document',audience:item.class_type==='pair'?'both':String(personIds[0] || ''),saved:false''', '''kind:file.type.startsWith('video/')?'final_dance':'class_document',audience:item.class_type==='pair'?'both':String(personIds[0] || ''),mode:'student',contentId:'',saved:false''', "summary media defaults")

s = sub_once(s, r'''  async function uploadMedia\(\) \{\n.*?\n  \}\n  async function closeSummary\(\)''', '''  async function uploadMedia() {
    if (!db || !media.length) return true;
    const sessionResult=await db.auth.getSession(), token=sessionResult.data.session?.access_token; if (!token) { setError("Tu sesión ha caducado."); return false; }
    for (const draft of media) {
      if (draft.saved) continue;
      if (draft.mode==='reusable' && !draft.file.type.startsWith('video/')) { setError("Los recursos reutilizables de este cierre deben ser vídeos. Las imágenes siguen pudiendo guardarse como archivo específico del alumno."); return false; }
      const response=await fetch('/api/google-drive/upload',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':draft.file.type || 'video/mp4','x-cya-file-name':encodeURIComponent(draft.file.name),'x-cya-file-size':String(draft.file.size),'x-cya-media-scope':'class_video'},body:draft.file});
      const payload=await response.json().catch(() => null) as {id?:string;mimeType?:string;error?:string}|null;
      if (!response.ok || !payload?.id) { setError(payload?.error || `No se pudo subir ${draft.file.name}.`); return false; }
      if (draft.mode==='reusable') {
        const reusable=await db.rpc('register_class_video_resource',{p_class_id:item.id,p_person_id:null,p_visibility_scope:'reusable',p_external_file_id:payload.id,p_title:draft.title.trim() || draft.file.name,p_mime_type:payload.mimeType || draft.file.type,p_size_bytes:draft.file.size,p_content_id:draft.contentId?Number(draft.contentId):null});
        if (reusable.error) { setError(reusable.error.message); return false; }
      } else {
        const recipients=draft.audience==='both' ? personIds : [Number(draft.audience)];
        for (const personId of recipients) { const result=await db.rpc('register_class_media_resource',{p_class_id:item.id,p_person_id:personId,p_media_kind:draft.kind,p_external_file_id:payload.id,p_title:draft.title.trim() || draft.file.name,p_mime_type:payload.mimeType || draft.file.type,p_size_bytes:draft.file.size}); if (result.error) { setError(result.error.message); return false; } }
      }
      setMedia((current) => current.map((row) => row.id===draft.id ? {...row,saved:true} : row));
    }
    return true;
  }
  async function closeSummary()''', "summary reusable media upload", flags=re.S)

s = replace_once(s, '''const result=await db.rpc('close_class_pedagogy_v2',{p_class_id:item.id,p_student_message:studentMessage.trim() || null,p_internal_note:internalNote.trim() || null});''', '''const result=await db.rpc('close_class_pedagogy_v3',{p_class_id:item.id,p_student_message:studentMessage.trim() || null,p_internal_note:internalNote.trim() || null,p_visible_event_ids:[...visibleEventIds]});''', "close summary v3 visibility")

old_render_event = '''  const renderEvent = (event:ClassContentEvent,tone:"positive"|"negative"|"neutral") => <div className={`summary-event ${tone}`} key={`${event.id}-${tone}`}><span>{tone==='positive'?'↑':tone==='negative'?'↓':'•'}</span><div><strong>{titleFor(event)}</strong><small>{event.event_type==='improved'?'Mejorado':event.event_type==='reviewed'?'Repasado':event.new_status==='corrected'?'Corregida':event.new_status==='explained'?'Explicada':event.event_type==='exercise_completed'?'Ejercicio realizado':event.event_type==='exercise_active'?'Ejercicio activo':event.event_type==='added'?'Añadido hoy':'Cambio observado'}</small></div></div>;'''
new_render_event = '''  const renderEvent = (event:ClassContentEvent,tone:"positive"|"negative"|"neutral") => <div className={`summary-event ${tone}`} key={`${event.id}-${tone}`}><span>{tone==='positive'?'↑':tone==='negative'?'↓':'•'}</span><div><strong>{titleFor(event)}</strong><small>{event.event_type==='improved'?'Mejorado':event.event_type==='reviewed'?'Repasado':event.new_status==='corrected'?'Corregida':event.new_status==='explained'?'Explicada':event.event_type==='exercise_completed'?'Ejercicio realizado':event.event_type==='exercise_active'?'Ejercicio activo':event.event_type==='added'?'Añadido hoy':'Cambio observado'}</small></div><label className="summary-student-toggle"><input type="checkbox" checked={visibleEventIds.has(event.id)} onChange={(change) => setVisibleEventIds((current) => { const next=new Set(current); if(change.target.checked)next.add(event.id);else next.delete(event.id);return next; })}/><span>Mostrar al alumno</span></label></div>;'''
s = replace_once(s, old_render_event, new_render_event, "summary row visibility")

old_media_article = '''<article key={draft.id}><div><strong>{draft.file.name}</strong><span>{draft.saved?'Guardado':'Pendiente'}</span></div><label className="field"><span>Tipo</span><select value={draft.kind} disabled={draft.saved} onChange={(event) => setMedia((current) => current.map((row) => row.id===draft.id ? {...row,kind:event.target.value as MediaDraft['kind']} : row))}><option value="final_dance">Baile final</option><option value="class_document">Documento de clase</option></select></label>{item.class_type==='pair' ? <label className="field"><span>Disponible para</span><select value={draft.audience} disabled={draft.saved} onChange={(event) => setMedia((current) => current.map((row) => row.id===draft.id ? {...row,audience:event.target.value} : row))}><option value="both">Ambos</option>{personIds.map((personId) => <option key={personId} value={personId}>{students.find((person) => person.id===personId)?.display_name || 'Alumno'}</option>)}</select></label> : null}<button className="icon-btn" type="button" aria-label="Quitar archivo" disabled={draft.saved} onClick={() => setMedia((current) => current.filter((row) => row.id!==draft.id))}><X /></button></article>'''
new_media_article = '''<article key={draft.id}><div><strong>{draft.file.name}</strong><span>{draft.saved?'Guardado':'Pendiente'}</span></div><label className="field"><span>Destino</span><select value={draft.mode} disabled={draft.saved} onChange={(event) => setMedia((current) => current.map((row) => row.id===draft.id ? {...row,mode:event.target.value as MediaDraft['mode']} : row))}><option value="student">Específico para el alumno</option>{draft.file.type.startsWith('video/') ? <option value="reusable">Reutilizable</option> : null}</select></label>{draft.mode==='student' ? <><label className="field"><span>Tipo</span><select value={draft.kind} disabled={draft.saved} onChange={(event) => setMedia((current) => current.map((row) => row.id===draft.id ? {...row,kind:event.target.value as MediaDraft['kind']} : row))}><option value="final_dance">Baile final</option><option value="class_document">Documento de clase</option></select></label>{item.class_type==='pair' ? <label className="field"><span>Disponible para</span><select value={draft.audience} disabled={draft.saved} onChange={(event) => setMedia((current) => current.map((row) => row.id===draft.id ? {...row,audience:event.target.value} : row))}><option value="both">Ambos</option>{personIds.map((personId) => <option key={personId} value={personId}>{students.find((person) => person.id===personId)?.display_name || 'Alumno'}</option>)}</select></label> : null}</> : <label className="field"><span>Vincular a contenido reutilizable</span><select value={draft.contentId} disabled={draft.saved} onChange={(event) => setMedia((current) => current.map((row) => row.id===draft.id ? {...row,contentId:event.target.value} : row))}><option value="">Guardar como recurso reutilizable sin vincular</option>{library.filter((content) => content.active && content.completion_status==='complete' && content.publication_status==='published' && ['correction','explanation','sequence'].includes(content.content_type)).map((content) => <option key={content.id} value={content.id}>{teachingKindLabels[content.content_type]} · {content.title}</option>)}</select></label>}<button className="icon-btn" type="button" aria-label="Quitar archivo" disabled={draft.saved} onClick={() => setMedia((current) => current.filter((row) => row.id!==draft.id))}><X /></button></article>'''
s = replace_once(s, old_media_article, new_media_article, "summary media destination controls")

p.write_text(s)

p = Path("app/evaluation-engine.tsx")
s = p.read_text()
s = s.replace('type Requirement={person_id:number;style_term_id:number;role_term_id:number;level_term_id:number;mode:"diagnostic"|"review";confirmed:boolean};', 'type Requirement={person_id:number;style_term_id:number;role_term_id:number;level_term_id:number;mode:"diagnostic"|"review";confirmed:boolean;class_id?:number};')
old_finish = '''  async function finish(){setBusy("finish");setError("");const sid=await ensureSession();if(!sid){setBusy("");return;}const r=await client.rpc("complete_evaluation_v3",{p_session_id:sid});if(r.error){setError(r.error.message);setBusy("");return;}setFinished(true);if(complement?.entry_content_id){const entry=await client.from("teaching_content_levels").select("level_term_id").eq("content_id",complement.entry_content_id);const currentOrder=levels.find(x=>x.level_term_id===levelId)?.sort_order??0;const entryIds=(entry.data??[]).map(x=>Number(x.level_term_id));const entryOrders=levels.filter(x=>entryIds.includes(x.level_term_id)).map(x=>x.sort_order);if(entryOrders.length&&currentOrder>=Math.min(...entryOrders))setShowComplement(true);}setBusy("");if(!complement||!complement.entry_content_id)onCompleted?.();}'''
new_finish = '''  async function finish(){setBusy("finish");setError("");const sid=await ensureSession();if(!sid){setBusy("");return;}const r=await client.rpc("complete_evaluation_v3",{p_session_id:sid});if(r.error){setError(r.error.message);setBusy("");return;}setFinished(true);let shouldAskComplement=false;if(complement?.entry_content_id){const entry=await client.from("teaching_content_levels").select("level_term_id").eq("content_id",complement.entry_content_id);const currentOrder=levels.find(x=>x.level_term_id===levelId)?.sort_order??0;const entryIds=(entry.data??[]).map(x=>Number(x.level_term_id));const entryOrders=levels.filter(x=>entryIds.includes(x.level_term_id)).map(x=>x.sort_order);shouldAskComplement=Boolean(entryOrders.length&&currentOrder>=Math.min(...entryOrders));}setShowComplement(shouldAskComplement);setBusy("");if(!shouldAskComplement)onCompleted?.();}'''
s = replace_once(s, old_finish, new_finish, "complement finish sequencing")
p.write_text(s)

p = Path("app/evaluation-admin.tsx")
s = p.read_text()
insert_after = '''  async function addQuestion(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!styleId||!roleId||!levelId||!aptitudeId)return;const form=new FormData(event.currentTarget),prompt=String(form.get("prompt")||"").trim();if(!prompt||!contextMilestones.length)return notify("Crea antes los hitos de esta aptitud.");setBusy("question");const version=Math.max(0,...contextQuestions.map(q=>q.version))+1;const q=await client.from("evaluation_questions").insert({style_term_id:styleId,role_term_id:roleId,level_term_id:levelId,aptitude_term_id:aptitudeId,prompt,sort_order:questions.length*10+10,version,active:true}).select("id").single();if(q.error)notify(q.error.message);else{const options=contextMilestones.map((m,index)=>({question_id:Number(q.data.id),label:m.label,milestone_id:m.id,sort_order:(index+1)*10,active:true}));const o=await client.from("evaluation_question_options").insert(options);if(o.error)notify(o.error.message);else{notify("Pregunta creada con una respuesta por hito.");await load();event.currentTarget.reset();}}setBusy("");}'''
if insert_after not in s:
    raise SystemExit("missing pattern: evaluation addQuestion")
extra_admin = insert_after + '''
  async function updateQuestionOption(optionId:number,changes:Record<string,unknown>){setBusy(`option-${optionId}`);const r=await client.from("evaluation_question_options").update(changes).eq("id",optionId);if(r.error)notify(r.error.message);else await load();setBusy("");}
  async function addQuestionOption(questionId:number){if(!contextMilestones.length)return;const label=window.prompt("Texto de la nueva respuesta");if(!label?.trim())return;const question=contextQuestions.find(q=>q.id===questionId);const rows=question?.evaluation_question_options??[];const milestone=contextMilestones[0];setBusy(`option-new-${questionId}`);const r=await client.from("evaluation_question_options").insert({question_id:questionId,label:label.trim(),milestone_id:milestone.id,sort_order:(Math.max(0,...rows.map(x=>x.sort_order))+10),active:true});if(r.error)notify(r.error.message);else{notify("Respuesta añadida. Elige el hito que le corresponde.");await load();}setBusy("");}'''
s = replace_once(s, insert_after, extra_admin, "admin option editing functions")
old_question_row = '''<div className="term-list">{contextQuestions.map(q=><div key={q.id}><span>{q.prompt}</span><small>{q.evaluation_question_options?.filter(o=>o.active).length||0} respuestas · v{q.version}</small></div>)}</div>'''
new_question_row = '''<div className="term-list evaluation-question-admin-list">{contextQuestions.map(q=><details key={q.id}><summary><span>{q.prompt}</span><small>{q.evaluation_question_options?.filter(o=>o.active).length||0} respuestas · v{q.version}</small></summary><div className="evaluation-option-admin-list">{(q.evaluation_question_options??[]).sort((a,b)=>a.sort_order-b.sort_order).map(o=><div key={o.id}><input aria-label={`Respuesta de ${q.prompt}`} defaultValue={o.label} disabled={busy===`option-${o.id}`} onBlur={e=>{const value=e.currentTarget.value.trim();if(value&&value!==o.label)void updateQuestionOption(o.id,{label:value});}}/><select aria-label={`Hito de ${o.label}`} value={o.milestone_id} disabled={busy===`option-${o.id}`} onChange={e=>void updateQuestionOption(o.id,{milestone_id:Number(e.target.value)})}>{contextMilestones.map(m=><option key={m.id} value={m.id}>{m.label} · {m.score}/100</option>)}</select><label><input type="checkbox" checked={o.active} disabled={busy===`option-${o.id}`} onChange={e=>void updateQuestionOption(o.id,{active:e.target.checked})}/><span>Activa</span></label></div>)}<button type="button" className="btn ghost" disabled={busy===`option-new-${q.id}`} onClick={()=>void addQuestionOption(q.id)}><Plus/> Añadir respuesta</button></div></details>)}</div>'''
s = replace_once(s, old_question_row, new_question_row, "admin option controls")
p.write_text(s)

p = Path("app/cya-app.tsx")
s = p.read_text()
s = replace_once(s, '''function RadarChart({ items, scaleLabel }: { items: Array<{ label: string; value: number }>; scaleLabel: string }) {''', '''function RadarChart({ items, scaleLabel, showValues = true }: { items: Array<{ label: string; value: number }>; scaleLabel: string; showValues?: boolean }) {''', "radar optional values")
s = replace_once(s, '''<b>{item.label}</b><strong>{Math.round(values[index])}</strong>''', '''<b>{item.label}</b>{showValues ? <strong>{Math.round(values[index])}</strong> : null}''', "hide radar values")
s = s.replace('''<RadarChart items={relativeRadar} scaleLabel="Porcentaje de tus puntos totales. Sirve para comparar tus áreas entre sí, no con otros alumnos." />''', '''<RadarChart items={relativeRadar} showValues={false} scaleLabel="Tu forma de progreso muestra fortalezas relativas y áreas a trabajar, sin compararte con otros alumnos." />''', 1)
s = s.replace('''<strong>{item.score}</strong>''', '''<strong>Valoración guardada</strong>''', 1)
p.write_text(s)
