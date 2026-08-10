from pathlib import Path

app_path = Path('app/cya-app.tsx')
css_path = Path('app/globals.css')
card_path = Path('app/teaching-content-card.tsx')
card_css_path = Path('app/teaching-content-card.module.css')

app = app_path.read_text()
css = css_path.read_text()
card = card_path.read_text()
card_css = card_css_path.read_text()

# 1) Avatar simple en preparación y clase en vivo.
old = '  Pencil, Play, Plus, Search, Sparkles, TrendingUp, UsersRound,\n'
new = '  Pencil, Play, Plus, Search, Sparkles, TrendingUp, UserRound, UsersRound,\n'
assert app.count(old) == 1
app = app.replace(old, new)
app = app.replace('<span className="avatar"><CircleUserRound /></span>', '<span className="avatar"><UserRound /></span>')
app = app.replace('<span className="avatar"><CircleUserRound/></span>', '<span className="avatar live-student-avatar"><UserRound/></span>')

# 2) LiveSession recibe el historial de clases y mantiene el contexto de preparación disponible durante la sesión.
old_sig = 'function LiveSession({ item, students, credits, terms, library, relations, refresh, notify, exit }: { item: ClassItem; students: Person[]; credits: CreditItem[]; terms: CatalogTerm[]; library: TeachingContent[]; relations: TeachingRelation[]; refresh: () => Promise<void>; notify: (message: string) => void; exit: () => void }) {'
new_sig = 'function LiveSession({ item, classes, students, credits, terms, library, relations, refresh, notify, exit }: { item: ClassItem; classes: ClassItem[]; students: Person[]; credits: CreditItem[]; terms: CatalogTerm[]; library: TeachingContent[]; relations: TeachingRelation[]; refresh: () => Promise<void>; notify: (message: string) => void; exit: () => void }) {'
assert app.count(old_sig) == 1
app = app.replace(old_sig, new_sig)

old_state = '  const [activePersonId,setActivePersonId]=useState(firstPerson), [notes,setNotes]=useState<ClassNote[]>([]), [evaluations,setEvaluations]=useState<StudentEvaluation[]>([]), [assignments,setAssignments]=useState<ContentAssignment[]>([]), [events,setEvents]=useState<ClassContentEvent[]>([]);\n'
new_state = old_state + '  const [prepProfiles,setPrepProfiles]=useState<StudentPrepProfile[]>([]), [prepRequests,setPrepRequests]=useState<ClassPreparationRequest[]>([]);\n'
assert app.count(old_state) == 1
app = app.replace(old_state, new_state)

old_tab = 'useState<"work"|"evaluate"|"notes">("work")'
new_tab = 'useState<"work"|"context"|"evaluate"|"notes">("work")'
assert app.count(old_tab) == 1
app = app.replace(old_tab, new_tab)

anchor = '  useEffect(() => { const initial=window.setTimeout(() => void loadLive(),0), fallback=window.setInterval(() => { void loadLive(); void refresh(); },15000); if (!db) return () => { clearTimeout(initial); clearInterval(fallback); }; const channel=db.channel(`class-live-${item.id}`).on(\'postgres_changes\',{event:\'*\',schema:\'public\',table:\'class_notes\',filter:`class_id=eq.${item.id}`},() => void loadLive()).on(\'postgres_changes\',{event:\'*\',schema:\'public\',table:\'class_content_events\',filter:`class_id=eq.${item.id}`},() => void loadLive()).on(\'postgres_changes\',{event:\'*\',schema:\'public\',table:\'student_content_assignments\'},(payload) => { const row=(payload.new || payload.old) as {person_id?:number}; if (row.person_id && personKey.split(\',\').includes(String(row.person_id))) void loadLive(); }).subscribe(); return () => { clearTimeout(initial); clearInterval(fallback); void db?.removeChannel(channel); }; },[item.id,loadLive,personKey,refresh]);\n'
assert app.count(anchor) == 1
prep_effect = anchor + '''  useEffect(() => { if (!db || !personKey) return; let alive=true; const ids=personKey.split(',').map(Number); void Promise.all([db.from("student_profiles").select("person_id,goals,teacher_notes,health_notes").in("person_id",ids),db.from("class_preparation_requests").select("id,class_id,person_id,request_type,body,external_file_id,content_id,created_at").eq("class_id",item.id).order("created_at")]).then(([profileResult,requestResult]) => { if (!alive) return; if (!profileResult.error) setPrepProfiles((profileResult.data ?? []) as StudentPrepProfile[]); if (!requestResult.error) setPrepRequests((requestResult.data ?? []) as ClassPreparationRequest[]); }); return () => { alive=false; }; },[item.id,personKey]);\n'''
app = app.replace(anchor, prep_effect)

context_anchor = "  const personEvents=events.filter((event) => event.person_id===activePersonId), exerciseEvents=personEvents.filter((event,index,rows) => event.event_type.startsWith('exercise_') && rows.findIndex((candidate) => candidate.content_id===event.content_id && candidate.event_type.startsWith('exercise_'))===index);\n"
assert app.count(context_anchor) == 1
context_logic = context_anchor + '''  const prepProfile=prepProfiles.find((row) => row.person_id===activePersonId) ?? null, prepRequestsForPerson=prepRequests.filter((row) => row.person_id===activePersonId);\n  const previousClass=[...classes].filter((candidate) => candidate.id!==item.id && candidate.status==='finished' && candidate.class_participants.some((row) => row.person_id===activePersonId)).sort((a,b) => new Date(b.scheduled_start_at).getTime()-new Date(a.scheduled_start_at).getTime())[0] ?? null;\n  const recentLearningContext=learning.slice().sort((a,b)=>new Date(b.updated_at).getTime()-new Date(a.updated_at).getTime()).slice(0,3), explainedIds=new Set(learning.filter((assignment) => assignment.assignment_status==='explained').map((assignment) => assignment.content_id));\n  const compatibleNext=library.filter((content) => content.active && content.completion_status==='complete' && content.publication_status==='published' && ['explanation','sequence'].includes(content.content_type) && !assignedContentIds.has(content.id) && contentFitsContext(content,item.style_term_id,participant?.role_term_id ?? null,participant?.level_term_id ?? null));\n  const connectedNext=compatibleNext.filter((content) => { const prerequisites=relations.filter((relation) => relation.source_content_id===content.id && relation.relation_type==='prerequisite'); return prerequisites.length>0 && prerequisites.every((relation) => explainedIds.has(relation.target_content_id)); });\n  const freeNext=compatibleNext.filter((content) => !relations.some((relation) => relation.source_content_id===content.id && relation.relation_type==='prerequisite'));\n  const suggestedNext=[...connectedNext,...freeNext.filter((content) => !connectedNext.some((candidate) => candidate.id===content.id))].slice(0,3), connectedSuggestionIds=new Set(connectedNext.map((content) => content.id));\n'''
app = app.replace(context_anchor, context_logic)

# 3) Resultados del buscador con tipo semántico para un layout y color claros.
old_result = 'return <article className={`unified-result ${assignment||exerciseEvent?\'assigned\':\'\'}`} key={`search-${result.content_id}`}'
new_result = 'return <article className={`unified-result ${assignment||exerciseEvent?\'assigned\':\'\'}`} data-kind={type} key={`search-${result.content_id}`}'
assert app.count(old_result) == 1
app = app.replace(old_result, new_result)

# 4) Cuarta pestaña: Contexto.
old_tabs = '<nav className="live-work-tabs"><button className={liveTab===\'work\'?\'active\':\'\'} onClick={() => setLiveTab(\'work\')}><BookOpen/> Trabajo</button><button className={liveTab===\'evaluate\'?\'active\':\'\'} onClick={() => setLiveTab(\'evaluate\')}><TrendingUp/> Evaluar</button><button className={liveTab===\'notes\'?\'active\':\'\'} onClick={() => setLiveTab(\'notes\')}><NotebookPen/> Observaciones</button></nav>'
new_tabs = '<nav className="live-work-tabs"><button className={liveTab===\'work\'?\'active\':\'\'} onClick={() => setLiveTab(\'work\')}><BookOpen/> Trabajo</button><button className={liveTab===\'context\'?\'active\':\'\'} onClick={() => setLiveTab(\'context\')}><Sparkles/> Contexto</button><button className={liveTab===\'evaluate\'?\'active\':\'\'} onClick={() => setLiveTab(\'evaluate\')}><TrendingUp/> Evaluar</button><button className={liveTab===\'notes\'?\'active\':\'\'} onClick={() => setLiveTab(\'notes\')}><NotebookPen/> Observaciones</button></nav>'
assert app.count(old_tabs) == 1
app = app.replace(old_tabs, new_tabs)

# 5) Correcciones: estado, frecuencia e importancia visibles/editables sin abrir el contenido.
old_corr_start = 'return <TeachingContentCard key={assignment.id} kindLabel="Corrección"'
new_corr_start = 'return <TeachingContentCard key={assignment.id} kindTone="correction" className={`live-content-card ${Math.max(assignment.current_frequency ?? 0,assignment.current_importance ?? 0)>=75?\'live-priority-high\':Math.max(assignment.current_frequency ?? 0,assignment.current_importance ?? 0)>=50?\'live-priority-medium\':\'live-priority-low\'}`} kindLabel="Corrección"'
assert app.count(old_corr_start) == 1
app = app.replace(old_corr_start, new_corr_start)

old_corr_actions = "actions={assignment.assignment_status==='pending' ? <button className=\"btn ghost live-mini-action\" onClick={() => void recordEvent(assignment.content_id,'improved')}>↑ Mejorado</button> : null}><div className=\"correction-detail\">"
new_corr_actions = "actions={assignment.assignment_status==='pending' ? <button className=\"btn ghost live-mini-action\" onClick={() => void recordEvent(assignment.content_id,'improved')}>↑ Mejorado</button> : null} quickControls={<div className=\"live-card-quick correction-quick\"><select className=\"quick-status\" aria-label={`Estado de ${assignment.teaching_contents.title}`} value={assignment.assignment_status} disabled={busy===`correction-${assignment.id}`} onChange={(event) => void updateCorrection(assignment,{status:event.target.value})}>{correctionStates.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>{assignment.snapshot_measurement_mode==='frequency'||assignment.snapshot_measurement_mode==='both' ? <label><span>Frec.</span><select aria-label={`Frecuencia de ${assignment.teaching_contents.title}`} value={assignment.current_frequency ?? 0} disabled={busy===`correction-${assignment.id}`} onChange={(event) => void updateCorrection(assignment,{frequency:Number(event.target.value)})}>{[0,25,50,75,100].map((value) => <option key={value}>{value}</option>)}</select></label> : null}{assignment.snapshot_measurement_mode==='importance'||assignment.snapshot_measurement_mode==='both' ? <label><span>Imp.</span><select aria-label={`Importancia de ${assignment.teaching_contents.title}`} value={assignment.current_importance ?? 0} disabled={busy===`correction-${assignment.id}`} onChange={(event) => void updateCorrection(assignment,{importance:Number(event.target.value)})}>{[0,25,50,75,100].map((value) => <option key={value}>{value}</option>)}</select></label> : null}</div>}><div className=\"correction-detail\">"
assert app.count(old_corr_actions) == 1
app = app.replace(old_corr_actions, new_corr_actions)

# 6) Explicaciones/secuencias: mover sus controles a una banda rápida y colorear por tipo.
old_learning = 'return <TeachingContentCard key={assignment.id} kindLabel={teachingKindLabels[assignment.teaching_contents.content_type]}'
new_learning = 'return <TeachingContentCard key={assignment.id} kindTone={assignment.teaching_contents.content_type as "explanation"|"sequence"} className="live-content-card" kindLabel={teachingKindLabels[assignment.teaching_contents.content_type]}'
assert app.count(old_learning) == 1
app = app.replace(old_learning, new_learning)
old_learning_actions = "actions={<div className=\"live-card-actions\"><select value={assignment.assignment_status} disabled={busy===`guide-${assignment.id}`} onChange={(event) => void updateLearning(assignment,event.target.value)}>{assignmentOptions(assignment.teaching_contents.content_type).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>{assignment.assignment_status==='explained' ? <button className=\"btn ghost live-mini-action\" onClick={() => void recordEvent(assignment.content_id,'reviewed')}>Repasar</button> : null}</div>}/>"
new_learning_actions = "quickControls={<div className=\"live-card-quick learning-quick\"><select aria-label={`Estado de ${assignment.teaching_contents.title}`} value={assignment.assignment_status} disabled={busy===`guide-${assignment.id}`} onChange={(event) => void updateLearning(assignment,event.target.value)}>{assignmentOptions(assignment.teaching_contents.content_type).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>{assignment.assignment_status==='explained' ? <button className=\"btn ghost live-mini-action\" onClick={() => void recordEvent(assignment.content_id,'reviewed')}>Repasar</button> : null}</div>}/>"
assert app.count(old_learning_actions) == 1
app = app.replace(old_learning_actions, new_learning_actions)

# 7) Contexto en vivo: pedagógico, decisiones del alumno y siguientes contenidos listos.
live_start = app.index('function LiveSession(')
live_end = app.index('\nfunction LiveClassView(', live_start)
live = app[live_start:live_end]
marker = '    </main>{finishOpen ?'
assert live.count(marker) == 1
context_ui = '''      {liveTab==='context' ? <section className="live-context-grid"><article className="card live-card live-context-card"><div className="live-card-head"><div><p className="eyebrow">Contexto pedagógico</p><h2>{student?.display_name || 'Alumno'}</h2></div><Sparkles/></div>{previousClass ? <div className="context-strip"><span>Última clase</span><strong>{dateLabel(previousClass.scheduled_start_at)} · {minutesLabel(previousClass.duration_minutes)}</strong></div> : null}{prepProfile?.health_notes ? <div className="prepare-alert"><AlertTriangle/><div><strong>A tener en cuenta</strong><span>{prepProfile.health_notes}</span></div></div> : null}{prepProfile?.teacher_notes ? <div className="prepare-info"><strong>Notas del profesor</strong><p>{prepProfile.teacher_notes}</p></div> : null}{prepProfile?.goals ? <div className="prepare-info"><strong>Objetivo</strong><p>{prepProfile.goals}</p></div> : null}<div className="context-mini-grid"><div><strong>{corrections.filter((assignment) => assignment.assignment_status==='pending').length}</strong><span>correcciones pendientes</span></div><div><strong>{recentLearningContext.length}</strong><span>contenidos recientes</span></div></div>{corrections.filter((assignment) => assignment.assignment_status==='pending').length ? <div className="prepare-list"><strong>Mirar hoy</strong>{corrections.filter((assignment) => assignment.assignment_status==='pending').slice(0,4).map((assignment) => <span key={assignment.id}>{assignment.teaching_contents.title}</span>)}</div> : null}{recentLearningContext.length ? <div className="prepare-list"><strong>Últimas explicaciones y secuencias</strong>{recentLearningContext.map((assignment) => <span key={assignment.id}>{assignment.teaching_contents.title} · {assignmentOptions(assignment.teaching_contents.content_type).find(([value]) => value===assignment.assignment_status)?.[1] || assignment.assignment_status}</span>)}</div> : null}</article><article className="card live-card live-context-card"><div className="live-card-head"><div><p className="eyebrow">Para esta clase</p><h2>Decisiones del alumno</h2></div><span className="badge">{prepRequestsForPerson.length}</span></div>{prepRequestsForPerson.length ? <div className="request-list live-request-list">{prepRequestsForPerson.map((request) => { const requested=request.content_id ? library.find((content) => content.id===request.content_id) : null, canAdd=Boolean(requested && requested.active && requested.completion_status==='complete' && requested.publication_status==='published' && contentFitsContext(requested,item.style_term_id,participant?.role_term_id ?? null,participant?.level_term_id ?? null)); return <article key={request.id}><span>{request.request_type==='video'?'Vídeo':request.request_type==='focus'?'Quiere trabajar':request.request_type==='content'?'Contenido':'Mensaje'}</span><strong>{request.body || requested?.title || (request.external_file_id?'Vídeo adjunto':'Petición guardada')}</strong>{request.external_file_id ? <SecureDriveAsset fileId={request.external_file_id} mediaType="video" title="Vídeo para preparar la clase" controls className="request-video" /> : null}{requested && canAdd && !assignedContentIds.has(requested.id) ? <button className="btn ghost context-add" onClick={() => void assignContent(requested)}><Plus/> Añadir a esta clase</button> : null}</article>; })}</div> : <div className="compact-empty"><Sparkles/><span>No dejó indicaciones específicas para esta clase.</span></div>}</article><article className="card live-card live-context-card context-suggestions"><div className="live-card-head"><div><p className="eyebrow">Guía de hoy</p><h2>Siguiente contenido</h2></div><span className="badge">{suggestedNext.length}</span></div>{suggestedNext.length ? <div className="context-suggestion-list">{suggestedNext.map((content) => <article data-kind={content.content_type} key={content.id}><div><span>{connectedSuggestionIds.has(content.id)?'Siguiente por mapa':'Compatible'}</span><strong>{content.title}</strong><small>{teachingKindLabels[content.content_type]}</small></div><button className="btn" disabled={busy===`assign-${content.id}`} onClick={() => void assignContent(content)}><Plus/> Añadir</button></article>)}</div> : <div className="compact-empty"><GitBranch/><span>No hay otro contenido compatible desbloqueado.</span></div>}</article></section> : null}\n'''
live = live.replace(marker, context_ui + marker)
app = app[:live_start] + live + app[live_end:]

# 8) LiveClassView pasa las clases para mostrar el contexto previo.
old_call = '<LiveSession key={selected.id} item={selected} students={students} credits={credits} terms={terms} library={library} relations={relations} refresh={refresh} notify={notify} exit={() => selectClass(null)} />'
new_call = '<LiveSession key={selected.id} item={selected} classes={classes} students={students} credits={credits} terms={terms} library={library} relations={relations} refresh={refresh} notify={notify} exit={() => selectClass(null)} />'
assert app.count(old_call) == 1
app = app.replace(old_call, new_call)

# 9) TeachingContentCard soporta tipo cromático y controles visibles en el estado contraído.
old_props = '  actions?: ReactNode;\n  children?: ReactNode;\n  className?: string;\n'
new_props = '  actions?: ReactNode;\n  quickControls?: ReactNode;\n  kindTone?: "correction" | "explanation" | "exercise" | "sequence";\n  children?: ReactNode;\n  className?: string;\n'
assert card.count(old_props) == 1
card = card.replace(old_props, new_props)
old_destructure = '  actions,\n  children,\n  className = "",\n'
new_destructure = '  actions,\n  quickControls,\n  kindTone,\n  children,\n  className = "",\n'
assert card.count(old_destructure) == 1
card = card.replace(old_destructure, new_destructure)
old_return = '  return <article className={`${styles.card} ${className}`.trim()}>\n'
new_return = '  const toneClass = kindTone === "correction" ? styles.correction : kindTone === "explanation" ? styles.explanation : kindTone === "exercise" ? styles.exercise : kindTone === "sequence" ? styles.sequence : "";\n\n  return <article className={`${styles.card} ${toneClass} ${className}`.trim()}>\n'
assert card.count(old_return) == 1
card = card.replace(old_return, new_return)
old_toggle = '        <button type="button" className={styles.toggle} onClick={() => setOpen(true)}>\n'
new_toggle = '        {quickControls ? <div className={styles.quickControls}>{quickControls}</div> : null}\n\n        <button type="button" className={styles.toggle} onClick={() => setOpen(true)}>\n'
assert card.count(old_toggle) == 1
card = card.replace(old_toggle, new_toggle)

# 10) CSS de tarjeta: tipo de contenido + banda rápida compacta.
card_append = '''\n.correction{background:linear-gradient(90deg,#fff8f9 0,#fff 32%)}.correction .kind{color:#c63e50}.explanation{background:linear-gradient(90deg,#f7faff 0,#fff 32%)}.explanation .kind{color:#3f6fd9}.exercise{background:linear-gradient(90deg,#f6fcf9 0,#fff 32%)}.exercise .kind{color:#17835a}.sequence{background:linear-gradient(90deg,#fbf8ff 0,#fff 32%)}.sequence .kind{color:#7a48d6}\n.quickControls{display:block}.quickControls>div{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.quickControls select{min-height:36px;max-width:100%;padding:0 8px;border:1px solid #ded9e7;border-radius:10px;background:#fff;color:#514b5d;font-size:11.5px;font-weight:650}.quickControls label{display:flex;align-items:center;gap:4px;color:#777184;font-size:10.5px;font-weight:750}.quickControls label select{min-width:58px}.quickControls .btn{min-height:36px;padding:0 9px;font-size:11px}\n@media(max-width:620px){.quickControls>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%}.quickControls .quick-status{grid-column:1/-1;width:100%}.quickControls label{min-width:0}.quickControls label select{width:100%;min-width:0}.quickControls .btn{width:100%}}\n'''
if '.quickControls{' not in card_css:
    card_css += card_append

# 11) CSS global del buscador, contexto y prioridad.
global_append = '''\n/* v33 · remate visual/funcional de Dar clase */\n.live-work-tabs{grid-template-columns:repeat(4,minmax(0,1fr));overflow-x:auto}.live-student-avatar{background:#f0edfa;color:#675e82}.live-student-avatar svg{width:27px;height:27px;stroke-width:1.8}.unified-results{gap:7px;padding-top:8px}.unified-result{min-height:66px;grid-template-columns:minmax(0,1fr) auto;gap:7px 12px;padding:11px 12px;border:1px solid #ebe7f0;border-radius:13px;background:#fff}.unified-result:last-child{border-bottom:1px solid #ebe7f0}.unified-result>.content-kind{grid-column:1;width:max-content;padding:4px 7px;border-radius:999px;background:#f0ecff}.unified-result>div:not(.unified-result-actions){grid-column:1}.unified-result-actions{grid-column:2;grid-row:1/3;align-self:center}.unified-result[data-kind='correction']{border-left:4px solid #ce4a5c;background:#fffafb}.unified-result[data-kind='correction']>.content-kind{background:#fdecef;color:#b53b4b}.unified-result[data-kind='explanation']{border-left:4px solid #557fe1;background:#fafcff}.unified-result[data-kind='explanation']>.content-kind{background:#eaf0ff;color:#3e66c5}.unified-result[data-kind='exercise']{border-left:4px solid #269368;background:#fafffc}.unified-result[data-kind='exercise']>.content-kind{background:#e8f8f0;color:#197651}.unified-result[data-kind='sequence']{border-left:4px solid #8a5ddd;background:#fdfaff}.unified-result[data-kind='sequence']>.content-kind{background:#f0eaff;color:#7044c7}.live-content-card.live-priority-high{box-shadow:inset 4px 0 #d04b59,0 6px 20px rgba(36,28,54,.05)}.live-content-card.live-priority-medium{box-shadow:inset 4px 0 #d78a32,0 6px 20px rgba(36,28,54,.05)}.live-content-card.live-priority-low{box-shadow:inset 4px 0 #4a9c75,0 6px 20px rgba(36,28,54,.05)}.live-card-quick{width:100%}.live-context-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.live-context-card{align-self:start}.context-suggestions{grid-column:1/-1}.context-strip{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;padding:10px 11px;border-radius:11px;background:#f5f2fb}.context-strip span{color:var(--muted);font-size:11px}.context-strip strong{font-size:11.5px;text-align:right}.context-mini-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin-top:12px}.context-mini-grid>div{padding:11px;border:1px solid #ebe7f0;border-radius:12px;background:#faf9fc;text-align:center}.context-mini-grid strong,.context-mini-grid span{display:block}.context-mini-grid strong{color:var(--purple2);font-size:20px}.context-mini-grid span{margin-top:3px;color:var(--muted);font-size:10.5px}.live-request-list .context-add{width:max-content;margin-top:7px;min-height:38px;padding:0 11px;font-size:11.5px}.context-suggestion-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.context-suggestion-list article{min-width:0;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;padding:11px;border:1px solid #e8e4ed;border-radius:13px;background:#fff}.context-suggestion-list article>div{min-width:0}.context-suggestion-list span,.context-suggestion-list strong,.context-suggestion-list small{display:block}.context-suggestion-list span{color:var(--purple2);font-size:10px;font-weight:800;text-transform:uppercase}.context-suggestion-list strong{overflow:hidden;margin-top:3px;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.context-suggestion-list small{margin-top:3px;color:var(--muted);font-size:10.5px}.context-suggestion-list .btn{min-height:38px;padding:0 10px;font-size:11px}.context-suggestion-list article[data-kind='correction']{border-left:4px solid #ce4a5c}.context-suggestion-list article[data-kind='explanation']{border-left:4px solid #557fe1}.context-suggestion-list article[data-kind='exercise']{border-left:4px solid #269368}.context-suggestion-list article[data-kind='sequence']{border-left:4px solid #8a5ddd}\n@media(max-width:620px){.live-work-tabs{grid-template-columns:repeat(4,minmax(82px,1fr))}.live-work-tabs button{padding:0 5px;font-size:10.5px}.unified-result{grid-template-columns:1fr}.unified-result>.content-kind,.unified-result>div:not(.unified-result-actions),.unified-result-actions{grid-column:1}.unified-result-actions{grid-row:auto;justify-content:flex-start}.live-context-grid,.context-suggestion-list{grid-template-columns:1fr}.context-suggestions{grid-column:1}.context-suggestion-list article{grid-template-columns:minmax(0,1fr) auto}.context-suggestion-list .btn{min-height:42px}}\n'''
if '/* v33 · remate visual/funcional de Dar clase */' not in css:
    css += global_append

# Sanity guards.
live = app[app.index('function LiveSession('):app.index('\nfunction LiveClassView(', app.index('function LiveSession('))]
assert 'Nueva corrección' not in live
assert "liveTab==='context'" in live
assert 'quickControls={' in live
assert 'search_class_teaching_content' in live
assert 'data-kind={type}' in live
assert 'suggestedNext' in live and "relation_type==='prerequisite'" in live
assert '<UserRound/>' in live
assert 'classes={classes}' in app
assert 'kindTone' in card and 'quickControls' in card

app_path.write_text(app)
css_path.write_text(css)
card_path.write_text(card)
card_css_path.write_text(card_css)
