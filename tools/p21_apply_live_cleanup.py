from pathlib import Path
import re

root = Path('.')
app_path = root / 'app/cya-app.tsx'
css_path = root / 'app/evaluation-final-model.css'
p17_path = root / 'tests/p17-evaluation-cutover.test.mjs'
p21_path = root / 'tests/p21-dar-clase.test.mjs'
doc_path = root / 'docs/P21_DAR_CLASE_RECONCILIACION.md'

app = app_path.read_text()
css = css_path.read_text()
p17 = p17_path.read_text()
p21 = p21_path.read_text()
doc = doc_path.read_text()


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    return text.replace(old, new, 1)


def sub_once(text, pattern, repl, label, flags=re.S):
    out, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    return out

# Unused imports/helpers proven dead by eslint and P21 audit.
app = replace_once(app, '  Clock3, Dumbbell, Eye, EyeOff, GitBranch, GraduationCap, House,\n', '  Dumbbell, Eye, EyeOff, GitBranch, GraduationCap, House,\n', 'remove Clock3')
app = replace_once(app, '  LibraryBig, Link2, LockKeyhole, LogOut, Megaphone, NotebookPen,\n', '  LibraryBig, Link2, LockKeyhole, Megaphone, NotebookPen,\n', 'remove LogOut')
app = replace_once(app, 'import { EvaluationRadar } from "./evaluation-radar";\n', '', 'remove EvaluationRadar import')
app = sub_once(app, r'\ntype StudentEvaluation = \{[^\n]+\};\n', '\n', 'remove StudentEvaluation type')
app = sub_once(app, r'\nfunction roleLabel\(role: string\) \{.*?\n\}\n', '\n', 'remove roleLabel')
app = sub_once(app, r'\nfunction classToOpen\(classes: ClassItem\[\]\) \{.*?\n\}\n', '\n', 'remove classToOpen')
app = sub_once(app, r'\nfunction assignmentIsDone\(assignment: ContentAssignment\) \{.*?\n\}\n', '\n', 'remove assignmentIsDone')
app = sub_once(app, r'\nfunction ManualStartClass\(.*?\nfunction FinishClassModal', '\nfunction FinishClassModal', 'remove ManualStartClass')

# Defer async state-producing load so React effects remain subscriptions/schedulers.
app = replace_once(
    app,
    '  useEffect(() => { void loadFinancialItems(); }, [loadFinancialItems]);',
    '  useEffect(() => { const timer=window.setTimeout(() => void loadFinancialItems(),0); return () => window.clearTimeout(timer); }, [loadFinancialItems]);',
    'defer loadFinancialItems',
)

# Defer class setup default propagation rather than synchronously setting state in the effect body.
setup_pattern = re.compile(r'''  useEffect\(\(\) => \{\n    if \(!danceProfiles\.length\) return;\n(?P<body>.*?)  \}, \[danceProfiles,personIds,styleId\]\);''', re.S)
match = setup_pattern.search(app)
if not match:
    raise SystemExit('setup defaults effect: match not found')
body = match.group('body')
indented = ''.join(('    ' + line if line.strip() else line) for line in body.splitlines(True))
setup_replacement = (
    '  useEffect(() => {\n'
    '    if (!danceProfiles.length) return;\n'
    '    const timer=window.setTimeout(() => {\n'
    f'{indented}'
    '    },0);\n'
    '    return () => window.clearTimeout(timer);\n'
    '  }, [danceProfiles,personIds,styleId]);'
)
app = setup_pattern.sub(setup_replacement, app, count=1)

# Physically remove the old numeric evaluation engine from LiveSession.
app = replace_once(
    app,
    '  const [activePersonId,setActivePersonId]=useState(firstPerson), [notes,setNotes]=useState<ClassNote[]>([]), [evaluations,setEvaluations]=useState<StudentEvaluation[]>([]), [assignments,setAssignments]=useState<ContentAssignment[]>([]), [events,setEvents]=useState<ClassContentEvent[]>([]);',
    '  const [activePersonId,setActivePersonId]=useState(firstPerson), [notes,setNotes]=useState<ClassNote[]>([]), [assignments,setAssignments]=useState<ContentAssignment[]>([]), [events,setEvents]=useState<ClassContentEvent[]>([]);',
    'remove evaluation state',
)
app = replace_once(
    app,
    '  const [search,setSearch]=useState(""), [searchKind,setSearchKind]=useState<"all"|"correction"|"explanation"|"exercise"|"sequence">("all"), [searchResults,setSearchResults]=useState<LiveClassSearchResult[]>([]), [searchLoading,setSearchLoading]=useState(false), [searchError,setSearchError]=useState(""), [showCorrected,setShowCorrected]=useState(false), [showLearningHistory,setShowLearningHistory]=useState(false), [liveTab,setLiveTab]=useState<"work"|"context"|"evaluate"|"notes">("work");',
    '  const [search,setSearch]=useState(""), [searchKind,setSearchKind]=useState<"all"|"correction"|"explanation"|"exercise"|"sequence">("all"), [searchResults,setSearchResults]=useState<LiveClassSearchResult[]>([]), [searchLoading,setSearchLoading]=useState(false), [searchError,setSearchError]=useState(""), [showCorrected,setShowCorrected]=useState(false), [showLearningHistory,setShowLearningHistory]=useState(false), [liveTab,setLiveTab]=useState<"work"|"context"|"notes">("work");',
    'remove evaluate tab type',
)
app = replace_once(
    app,
    '  const [measurementMode,setMeasurementMode]=useState<"frequency"|"importance"|"both"|"none">("both"), [frequency,setFrequency]=useState(50), [importance,setImportance]=useState(50), [busy,setBusy]=useState(""), [syncError,setSyncError]=useState(""), [finishOpen,setFinishOpen]=useState(false), [evaluationLevelId,setEvaluationLevelId]=useState<number|null>(firstParticipant?.level_term_id ?? null);',
    '  const [measurementMode,setMeasurementMode]=useState<"frequency"|"importance"|"both"|"none">("both"), [frequency,setFrequency]=useState(50), [importance,setImportance]=useState(50), [busy,setBusy]=useState(""), [syncError,setSyncError]=useState(""), [finishOpen,setFinishOpen]=useState(false);',
    'remove evaluation level state',
)

live_load_pattern = r'''  const loadLive=useCallback\(async \(\) => \{.*?\},\[item\.id,personKey\]\);'''
live_load_replacement = '''  const loadLive=useCallback(async () => { if (!db || !personKey) return; const ids=personKey.split(',').map(Number); const [noteResult,assignmentResult,eventResult]=await Promise.all([db.from('class_notes').select('id,class_id,person_id,body,visibility_scope,created_at').eq('class_id',item.id).order('created_at',{ascending:false}),db.from('student_content_assignments').select('id,person_id,content_id,assignment_status,current_frequency,current_importance,snapshot_style_term_id,snapshot_role_term_id,snapshot_level_term_id,snapshot_measurement_mode,updated_at,teaching_contents!inner(id,title,content_type,measurement_mode,description,correction_guidance)').in('person_id',ids).order('updated_at',{ascending:false}),db.from('class_content_events').select('id,class_id,person_id,content_id,event_type,previous_status,new_status,payload,created_at,teaching_contents(title,content_type)').eq('class_id',item.id).order('created_at',{ascending:false})]); const error=noteResult.error || assignmentResult.error || eventResult.error; if (error) { setSyncError(error.message); return; } setSyncError(''); setNotes((noteResult.data ?? []) as ClassNote[]); setAssignments((assignmentResult.data ?? []) as unknown as ContentAssignment[]); setEvents((eventResult.data ?? []) as unknown as ClassContentEvent[]); },[item.id,personKey]);'''
app = sub_once(app, live_load_pattern, live_load_replacement, 'replace LiveSession load')

live_sync_pattern = r'''  useEffect\(\(\) => \{ const initial=window\.setTimeout\(\(\) => void loadLive\(\),0\), fallback=window\.setInterval\(\(\) => \{ void loadLive\(\); void refresh\(\); \},15000\);.*?\},\[item\.id,loadLive,personKey,refresh\]\);'''
live_sync_replacement = '''  useEffect(() => { const initial=window.setTimeout(() => void loadLive(),0), fallback=window.setInterval(() => void loadLive(),60000); if (!db) return () => { clearTimeout(initial); clearInterval(fallback); }; const channel=db.channel(`class-live-${item.id}`).on('postgres_changes',{event:'*',schema:'public',table:'class_notes',filter:`class_id=eq.${item.id}`},() => void loadLive()).on('postgres_changes',{event:'*',schema:'public',table:'class_content_events',filter:`class_id=eq.${item.id}`},() => void loadLive()).on('postgres_changes',{event:'*',schema:'public',table:'student_content_assignments'},(payload) => { const row=(payload.new || payload.old) as {person_id?:number}; if (row.person_id && personKey.split(',').includes(String(row.person_id))) void loadLive(); }).subscribe(); return () => { clearTimeout(initial); clearInterval(fallback); void db?.removeChannel(channel); }; },[item.id,loadLive,personKey]);'''
app = sub_once(app, live_sync_pattern, live_sync_replacement, 'replace LiveSession realtime/fallback')

app = sub_once(
    app,
    r'''  useEffect\(\(\) => \{ setEvaluationLevelId\(participant\?\.level_term_id \?\? null\); \},\[activePersonId,participant\?\.level_term_id\]\);\n  const evaluationLevelTerm=.*?\n  const evaluationRadarItems=.*?;\n''',
    '',
    'remove legacy evaluation derivation',
)

# Search state changes occur inside the scheduled callback; use a scalar person id dependency.
search_pattern = r'''  const shouldShowSearch=Boolean\(search\.trim\(\)\) \|\| searchKind!=='all';\n  useEffect\(\(\) => \{.*?\n  \},\[contextReady,item\.id,participant\?\.person_id,search,searchKind,shouldShowSearch\]\);'''
search_replacement = '''  const shouldShowSearch=Boolean(search.trim()) || searchKind!=='all', searchPersonId=participant?.person_id ?? null;
  useEffect(() => {
    let alive=true;
    const timer=window.setTimeout(async () => {
      if (!alive) return;
      if (!shouldShowSearch || !contextReady || !searchPersonId) { setSearchResults([]); setSearchLoading(false); setSearchError(''); return; }
      setSearchResults([]); setSearchLoading(true); setSearchError('');
      if (!db) { setSearchLoading(false); setSearchError('Sin conexión con los datos.'); return; }
      const result=await db.rpc('search_class_teaching_content',{p_class_id:item.id,p_person_id:searchPersonId,p_query:search.trim(),p_content_type:searchKind==='all'?null:searchKind,p_limit:30});
      if (!alive) return;
      if (result.error) { setSearchResults([]); setSearchError(result.error.message); }
      else setSearchResults((result.data ?? []) as LiveClassSearchResult[]);
      setSearchLoading(false);
    },shouldShowSearch ? 140 : 0);
    return () => { alive=false; window.clearTimeout(timer); };
  },[contextReady,item.id,search,searchKind,searchPersonId,shouldShowSearch]);'''
app = sub_once(app, search_pattern, search_replacement, 'replace search effect')

app = sub_once(app, r'''\n  async function saveEvaluation\(aptitudeId:number,scoreValue:number\) \{.*?\n  async function createQuickContent''', '\n  async function createQuickContent', 'remove saveEvaluation')

# Remove the evaluate tab button and rendered block.
app = replace_once(
    app,
    "<button className={liveTab==='context'?'active':''} onClick={() => setLiveTab('context')}><Sparkles/> Contexto</button><button className={liveTab==='evaluate'?'active':''} onClick={() => setLiveTab('evaluate')}><TrendingUp/> Evaluar</button><button className={liveTab==='notes'?'active':''} onClick={() => setLiveTab('notes')}><NotebookPen/> Observaciones</button>",
    "<button className={liveTab==='context'?'active':''} onClick={() => setLiveTab('context')}><Sparkles/> Contexto</button><button className={liveTab==='notes'?'active':''} onClick={() => setLiveTab('notes')}><NotebookPen/> Observaciones</button>",
    'remove evaluate tab button',
)
app = sub_once(app, r'''\n      \{liveTab==='evaluate' \? <section.*?\n      \{liveTab==='notes' ''', "\n      {liveTab==='notes' ", 'remove evaluate JSX')

# The correction card keeps one compact set of controls; details remain for content body/media only.
app, duplicate_count = re.subn(r'''<div className="correction-detail">.*?</div>''', '', app, count=1, flags=re.S)
if duplicate_count != 1:
    raise SystemExit(f'remove correction duplicate: expected 1, got {duplicate_count}')

# Reset internal route state asynchronously when leaving selected class.
app = replace_once(
    app,
    "  useEffect(() => { if (!selectedClassId) { setForceData(false); setSummaryId(null); } },[selectedClassId]);",
    "  useEffect(() => { if (selectedClassId) return; const timer=window.setTimeout(() => { setForceData(false); setSummaryId(null); },0); return () => window.clearTimeout(timer); },[selectedClassId]);",
    'defer LiveClassView reset',
)

# P17 no longer needs CSS to hide a live evaluation tab: P21 physically removes it.
css = replace_once(
    css,
    '''.live-work-tabs > button:nth-child(3),\n.live-evaluation {\n  display: none !important;\n}\n\n''',
    '',
    'remove live evaluation CSS hide',
)
css = replace_once(
    css,
    '/* StudentMasterDetail conserva temporalmente el JSX histórico para evitar una\n',
    '/* P21 elimina físicamente la evaluación numérica heredada de Dar clase.\n   StudentMasterDetail conserva temporalmente su JSX histórico para evitar una\n',
    'update evaluation css comment',
)

# Cross-package regression follows the physical cutover instead of depending on nth-child CSS.
p17 = replace_once(p17, "const page=fs.readFileSync('app/page.tsx','utf8');\n", "const page=fs.readFileSync('app/page.tsx','utf8');\nconst cya=fs.readFileSync('app/cya-app.tsx','utf8');\n", 'P17 load cya app')
p17 = replace_once(
    p17,
    '''  assert.match(css,/live-work-tabs > button:nth-child\\(3\\)/);\n  assert.match(css,/live-evaluation/);\n  assert.match(css,/display: none !important/);''',
    '''  assert.doesNotMatch(cya,/liveTab==='evaluate'/);\n  assert.doesNotMatch(cya,/save_class_evaluation_v2/);\n  assert.doesNotMatch(css,/live-work-tabs > button:nth-child\\(3\\)/);\n  assert.doesNotMatch(css,/live-evaluation/);\n  assert.match(css,/evalStack/);\n  assert.match(css,/display: none !important/);''',
    'P17 physical cutover assertions',
)

# P21 regression explicitly protects the non-disruptive live workspace.
p21 += '''\n\ntest('P21.2 physically removes the hidden numeric evaluation engine from Dar clase', () => {\n  const live = sliceBetween(app, 'function LiveSession(', 'function LiveClassView(');\n  assert.doesNotMatch(live, /liveTab==='evaluate'/);\n  assert.doesNotMatch(live, /save_class_evaluation_v2/);\n  assert.doesNotMatch(live, /EvaluationRadar/);\n  assert.doesNotMatch(live, /student_evaluations/);\n});\n\ntest('P21.2 live fallback does not globally refresh CYA every 15 seconds', () => {\n  const live = sliceBetween(app, 'function LiveSession(', 'function LiveClassView(');\n  assert.doesNotMatch(live, /setInterval\\(\\(\\) => \\{ void loadLive\\(\\); void refresh\\(\\); \\},15000\\)/);\n  assert.match(live, /setInterval\\(\\(\\) => void loadLive\\(\\),60000\\)/);\n});\n\ntest('P21.2 correction cards expose only one status-frequency-importance control set', () => {\n  const live = sliceBetween(app, 'function LiveSession(', 'function LiveClassView(');\n  assert.doesNotMatch(live, /correction-detail/);\n  assert.match(live, /correction-quick/);\n});\n'''

doc = replace_once(doc, '| Ejercicios | EXISTE | deduplicar por último estado por contenido |', '| Ejercicios | EXISTE: usa el último evento por contenido | preservar + regresión |', 'update exercise audit')
doc += '''\n\n## 8. P21.2 — limpieza física iniciada\n\n- se retira el tab numérico `Evaluar` de `LiveSession`;\n- se conserva exclusivamente el flujo guiado de P17;\n- se elimina el refresco global cada 15 s: Realtime queda como vía principal y `loadLive()` como fallback discreto;\n- se elimina el segundo juego duplicado de controles de Correcciones;\n- se corrigen efectos React detectados por el lint sin desactivar reglas.\n'''

app_path.write_text(app)
css_path.write_text(css)
p17_path.write_text(p17)
p21_path.write_text(p21)
doc_path.write_text(doc)
print('P21.2 cleanup applied')
