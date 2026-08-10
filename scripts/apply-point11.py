from pathlib import Path
import re

app_path = Path('app/cya-app.tsx')
css_path = Path('app/globals.css')
app = app_path.read_text()
css = css_path.read_text()

# 1. Search result type.
needle = "type ClassContentEvent = { id: number; class_id: number; person_id: number; content_id: number; event_type: string; previous_status: string | null; new_status: string | null; payload: Record<string, unknown>; created_at: string; teaching_contents?: { title: string; content_type: string } | null };\n"
insert = needle + "type LiveClassSearchResult = { content_id: number; title: string; content_type: string; description: string | null; correction_guidance: string | null; completion_status: string; publication_status: string; visibility: string; measurement_mode: string; ready: boolean };\n"
assert app.count(needle) == 1
app = app.replace(needle, insert)

# 2. Search state + one unified creation route.
old = "  const [search,setSearch]=useState(\"\"), [searchKind,setSearchKind]=useState<\"all\"|\"correction\"|\"explanation\"|\"exercise\"|\"sequence\">(\"all\"), [showCorrected,setShowCorrected]=useState(false), [showLearningHistory,setShowLearningHistory]=useState(false), [liveTab,setLiveTab]=useState<\"work\"|\"evaluate\"|\"notes\">(\"work\");\n  const [internalText,setInternalText]=useState(\"\"), [studentText,setStudentText]=useState(\"\"), [newCorrection,setNewCorrection]=useState(\"\"), [quickType,setQuickType]=useState<\"explanation\"|\"exercise\"|\"sequence\">(\"explanation\"), [quickTitle,setQuickTitle]=useState(\"\");"
new = "  const [search,setSearch]=useState(\"\"), [searchKind,setSearchKind]=useState<\"all\"|\"correction\"|\"explanation\"|\"exercise\"|\"sequence\">(\"all\"), [searchResults,setSearchResults]=useState<LiveClassSearchResult[]>([]), [searchLoading,setSearchLoading]=useState(false), [searchError,setSearchError]=useState(\"\"), [showCorrected,setShowCorrected]=useState(false), [showLearningHistory,setShowLearningHistory]=useState(false), [liveTab,setLiveTab]=useState<\"work\"|\"evaluate\"|\"notes\">(\"work\");\n  const [internalText,setInternalText]=useState(\"\"), [studentText,setStudentText]=useState(\"\"), [quickType,setQuickType]=useState<\"correction\"|\"explanation\"|\"exercise\"|\"sequence\">(\"explanation\"), [quickTitle,setQuickTitle]=useState(\"\");"
assert app.count(old) == 1
app = app.replace(old, new)

# 3. Replace client-side search filtering with a contextual, server-validated live search.
pattern = re.compile(r"  const normalizedSearch=search\.trim\(\)\.toLocaleLowerCase\('es'\); const matchesSearch=.*?\n  const unifiedLibrary=.*?;\n", re.S)
replacement = """  const shouldShowSearch=Boolean(search.trim()) || searchKind!=='all';
  useEffect(() => {
    let alive=true;
    if (!shouldShowSearch || !contextReady || !participant) { setSearchResults([]); setSearchLoading(false); setSearchError(''); return; }
    setSearchResults([]); setSearchLoading(true); setSearchError('');
    const timer=window.setTimeout(async () => {
      if (!db) { if (alive) { setSearchLoading(false); setSearchError('Sin conexión con los datos.'); } return; }
      const result=await db.rpc('search_class_teaching_content',{p_class_id:item.id,p_person_id:participant.person_id,p_query:search.trim(),p_content_type:searchKind==='all'?null:searchKind,p_limit:30});
      if (!alive) return;
      if (result.error) { setSearchResults([]); setSearchError(result.error.message); }
      else setSearchResults((result.data ?? []) as LiveClassSearchResult[]);
      setSearchLoading(false);
    },140);
    return () => { alive=false; window.clearTimeout(timer); };
  },[contextReady,item.id,participant?.person_id,search,searchKind,shouldShowSearch]);
"""
app, count = pattern.subn(replacement, app, count=1)
assert count == 1

# 4. Unified quick creation also supports corrections, with their measurement data.
pattern = re.compile(r"  async function createCorrection\(\).*?\n  async function createQuickContent\(\) \{.*?\n  \}", re.S)
replacement = """  async function createQuickContent() {
    if (!db || !participant || !quickTitle.trim() || !contextReady) return;
    setBusy('quick-create');
    const result=quickType==='correction'
      ? await db.rpc('create_class_correction',{p_class_id:item.id,p_person_id:participant.person_id,p_title:quickTitle.trim(),p_measurement_mode:measurementMode,p_frequency:measurementMode==='frequency'||measurementMode==='both'?frequency:null,p_importance:measurementMode==='importance'||measurementMode==='both'?importance:null})
      : await db.rpc('create_quick_class_content',{p_class_id:item.id,p_person_id:participant.person_id,p_content_type:quickType,p_title:quickTitle.trim()});
    if (result.error) notify(result.error.message);
    else { const createdType=quickType; setQuickTitle(''); await Promise.all([refresh(),loadLive()]); notify(createdType==='correction'?'Corrección pendiente añadida.':`${teachingKindLabels[createdType]} apuntada para completar después.`); }
    setBusy('');
  }"""
app, count = pattern.subn(replacement, app, count=1)
assert count == 1

# 5. Replace search panel with contextual results and type-specific quick actions.
start = app.index('      <section className="live-unified-search card">')
end_marker = '      <nav className="live-work-tabs">'
end = app.index(end_marker, start)
new_panel = '''      <section className="live-unified-search card"><details className="quick-content-create"><summary><Plus/> Crear nuevo</summary><div><select value={quickType} onChange={(event) => setQuickType(event.target.value as typeof quickType)}><option value="correction">Corrección</option><option value="explanation">Explicación</option><option value="exercise">Ejercicio</option><option value="sequence">Secuencia</option></select><input value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} placeholder="Título corto"/>{quickType==='correction' ? <div className="correction-new-grid quick-correction-fields"><label className="field"><span>Medir por</span><select value={measurementMode} onChange={(event) => setMeasurementMode(event.target.value as typeof measurementMode)}><option value="both">Frecuencia + importancia</option><option value="frequency">Frecuencia</option><option value="importance">Importancia</option><option value="none">Sin medición</option></select></label>{measurementMode==='frequency'||measurementMode==='both' ? <label className="field"><span>Frecuencia</span><select value={frequency} onChange={(event) => setFrequency(Number(event.target.value))}>{[0,25,50,75,100].map((value) => <option key={value}>{value}</option>)}</select></label> : null}{measurementMode==='importance'||measurementMode==='both' ? <label className="field"><span>Importancia</span><select value={importance} onChange={(event) => setImportance(Number(event.target.value))}>{[0,25,50,75,100].map((value) => <option key={value}>{value}</option>)}</select></label> : null}</div> : null}<button className="btn" onClick={() => void createQuickContent()} disabled={!quickTitle.trim() || busy==='quick-create'}>{busy==='quick-create'?'Guardando…':'Guardar pendiente'}</button></div><small>CYA hereda alumno, estilo, rol y nivel de esta clase. Lo nuevo queda pendiente y oculto al alumno hasta que corresponda.</small></details>{shouldShowSearch ? <div className="unified-results"><div className="unified-result-head"><strong>Resultados</strong><span>{searchLoading?'…':searchResults.length}</span></div>{searchError ? <p className="error live-search-error">{searchError}</p> : null}{searchLoading ? <div className="compact-empty"><span className="spinner"/><span>Buscando en el contexto de {student?.display_name || 'este alumno'}…</span></div> : searchResults.map((result) => { const type=result.content_type, content=library.find((row) => row.id===result.content_id), assignment=personAssignments.find((row) => row.content_id===result.content_id), exerciseEvent=exerciseEvents.find((row) => row.content_id===result.content_id); const statusLabel=type==='exercise' ? (exerciseEvent?.event_type==='exercise_completed'?'Realizado':exerciseEvent?.event_type==='exercise_active'?'Activo':exerciseEvent?.event_type==='exercise_pending'?'Pendiente':'Disponible') : assignment ? (assignmentOptions(type).find(([value]) => value===assignment.assignment_status)?.[1] || assignment.assignment_status) : result.ready?'Compatible con esta clase':'Incompleta · solo profesores'; return <article className={`unified-result ${assignment||exerciseEvent?'assigned':''}`} key={`search-${result.content_id}`}><span className="content-kind">{teachingKindLabels[type]}</span><div><strong>{result.title}</strong><small>{statusLabel}</small></div><div className="unified-result-actions">{type==='correction' && assignment ? assignment.assignment_status==='corrected' ? <button className="btn ghost" onClick={() => void updateCorrection(assignment,{status:'pending'})}>Ha reaparecido</button> : <><button className="btn ghost" onClick={() => void recordEvent(result.content_id,'improved')}>Mejorado</button><button className="btn" onClick={() => void updateCorrection(assignment,{status:'corrected'})}>Corregir</button></> : ['explanation','sequence'].includes(type) && assignment ? assignment.assignment_status==='explained' ? <button className="btn ghost" onClick={() => void recordEvent(result.content_id,'reviewed')}>Repasar</button> : <button className="btn" onClick={() => void updateLearning(assignment,'explained')}>Explicada</button> : type==='exercise' ? exerciseEvent?.event_type==='exercise_completed' ? <CheckCircle2/> : exerciseEvent?.event_type==='exercise_active' ? <button className="btn" onClick={() => void recordEvent(result.content_id,'exercise_completed')}>Realizado</button> : <button className="btn" onClick={() => void recordEvent(result.content_id,'exercise_active')}>{exerciseEvent?'Activar':'Usar'}</button> : !assignment && result.ready && content ? <button className="btn" disabled={busy===`assign-${result.content_id}`} onClick={() => void assignContent(content)}><Plus/> Añadir</button> : !assignment ? <span className="badge">Completar después</span> : <CheckCircle2/>}</div></article>; })}{!searchLoading && !searchError && !searchResults.length ? <div className="compact-empty"><Search/><span>No hay coincidencias para este alumno, estilo, rol y nivel.</span></div> : null}</div> : null}</section>
'''
app = app[:start] + new_panel + app[end:]

# 6. The corrections card no longer has a second creation route.
pattern = re.compile(r'<details className="new-correction">.*?</details>', re.S)
app, count = pattern.subn('', app, count=1)
assert count == 1

# 7. Small mobile-friendly action layout.
css_append = '''\n/* v32 · buscador contextual en Dar clase */\n.unified-result-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap}.unified-result-actions>.btn{min-height:38px;padding:0 10px;font-size:11.5px}.unified-result-actions>svg{width:20px;color:var(--green)}.quick-correction-fields{grid-column:1/-1;margin:2px 0}.live-search-error{margin:8px 0}.unified-results .compact-empty{min-height:74px}\n@media(max-width:620px){.unified-result{grid-template-columns:auto minmax(0,1fr)}.unified-result-actions{grid-column:2;justify-content:flex-start}.unified-result-actions>.btn{min-height:42px}.quick-correction-fields{grid-template-columns:1fr 1fr}.quick-correction-fields>.field:first-child{grid-column:1/-1}}\n'''
if '/* v32 · buscador contextual en Dar clase */' not in css:
    css += css_append

# Sanity guards.
assert "search_class_teaching_content" in app
assert '<option value="correction">Corrección</option>' in app
live = app[app.index('function LiveSession('):app.index('\nfunction LiveClassView(', app.index('function LiveSession('))]
assert '<summary><Plus/> Nueva corrección</summary>' not in live
assert live.count("create_class_correction") == 1
assert "contentFitsContext(content,item.style_term_id" not in live

app_path.write_text(app)
css_path.write_text(css)
