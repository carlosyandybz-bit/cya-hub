from pathlib import Path

app_path = Path('app/cya-app.tsx')
css_path = Path('app/globals.css')
text = app_path.read_text()


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    '  AlertTriangle, Archive, ArrowRight, Bell, BookOpen, CalendarDays, CheckCircle2, ChevronRight, CircleUserRound,',
    '  AlertTriangle, Archive, ArrowLeft, ArrowRight, Bell, BookOpen, CalendarDays, CheckCircle2, ChevronRight, CircleUserRound,',
    'ArrowLeft import',
)
replace_once(
    'type View = "home" | "students" | "classes" | "credits" | "agenda" | "live" | "teaching" | "marketing" | "admin";\ntype Person = {',
    '''type View = "home" | "students" | "classes" | "credits" | "agenda" | "live" | "teaching" | "marketing" | "admin";\ntype CyaOverlay = "new-student" | "schedule" | "credit" | null;\ntype CyaHistoryState = {\n  cyaHub: true;\n  view: View;\n  experience: ExperienceContext;\n  selectedId: number | null;\n  overlay: CyaOverlay;\n  modalStudentId: number | null;\n  liveClassId: number | null;\n};\ntype Person = {''',
    'history types',
)
replace_once(
    '  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 3000); return () => clearTimeout(timer); }, [toast]);\n  if (!ready) return <Spinner />;',
    '''  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 3000); return () => clearTimeout(timer); }, [toast]);\n  useEffect(() => {\n    if (typeof window === "undefined") return;\n    const existing = window.history.state as CyaHistoryState | null;\n    if (!existing?.cyaHub) {\n      window.history.replaceState({ cyaHub: true, view: "home", experience: "teacher", selectedId: null, overlay: null, modalStudentId: null, liveClassId: null } satisfies CyaHistoryState, "", window.location.href);\n    }\n    const restore = (event: PopStateEvent) => {\n      const state = event.state as CyaHistoryState | null;\n      if (!state?.cyaHub) return;\n      setView(state.view);\n      setExperienceState(state.experience);\n      setLiveClassId(state.liveClassId ?? null);\n      setSelected(state.selectedId ? students.find((student) => student.id === state.selectedId) ?? null : null);\n      setNewOpen(state.overlay === "new-student");\n      setScheduleOpen(state.overlay === "schedule");\n      setCreditOpen(state.overlay === "credit");\n      setScheduleStudentId(state.overlay === "schedule" ? state.modalStudentId ?? null : null);\n      setCreditStudentId(state.overlay === "credit" ? state.modalStudentId ?? null : null);\n    };\n    window.addEventListener("popstate", restore);\n    return () => window.removeEventListener("popstate", restore);\n  }, [students]);\n  if (!ready) return <Spinner />;''',
    'popstate effect',
)
replace_once(
    '''  const activeIdentity = identity;\n  async function setExperience(value: ExperienceContext) {\n    const allowed = value === "teacher" ? activeIdentity.can_teach : value === "student" ? activeIdentity.can_study : activeIdentity.can_admin;\n    if (!allowed || !db) return;\n    setExperienceState(value);\n    if (value === "admin") setView("admin");\n    else if (value === "teacher" && view === "admin") setView("home");\n    const result = await db.from("user_preferences").upsert({ user_id: activeIdentity.user_id, preferred_context: value }, { onConflict: "user_id" });\n    if (result.error) setToast("La vista ha cambiado, pero no se pudo guardar como preferencia.");\n  }''',
    '''  const activeIdentity = identity;\n  function historyState(nextView: View, options: Partial<Omit<CyaHistoryState, "cyaHub" | "view">> = {}): CyaHistoryState {\n    return {\n      cyaHub: true,\n      view: nextView,\n      experience: options.experience ?? experience,\n      selectedId: options.selectedId ?? null,\n      overlay: options.overlay ?? null,\n      modalStudentId: options.modalStudentId ?? null,\n      liveClassId: options.liveClassId ?? null,\n    };\n  }\n  function clearTransient() {\n    setSelected(null);\n    setNewOpen(false);\n    setScheduleOpen(false);\n    setCreditOpen(false);\n    setScheduleStudentId(null);\n    setCreditStudentId(null);\n  }\n  function navigateView(nextView: View, options: { liveClassId?: number | null; experience?: ExperienceContext } = {}) {\n    const nextExperience = options.experience ?? experience;\n    if (view === nextView && !selected && !newOpen && !scheduleOpen && !creditOpen && (nextView !== "live" || (options.liveClassId ?? null) === liveClassId) && nextExperience === experience) return;\n    const state = historyState(nextView, { experience: nextExperience, liveClassId: options.liveClassId ?? null });\n    window.history.pushState(state, "", window.location.href);\n    clearTransient();\n    setExperienceState(nextExperience);\n    setLiveClassId(state.liveClassId);\n    setView(nextView);\n  }\n  function replaceView(nextView: View, options: { experience?: ExperienceContext } = {}) {\n    const nextExperience = options.experience ?? experience;\n    const state = historyState(nextView, { experience: nextExperience });\n    window.history.replaceState(state, "", window.location.href);\n    clearTransient();\n    setLiveClassId(null);\n    setExperienceState(nextExperience);\n    setView(nextView);\n  }\n  function openStudentDetail(student: Person) {\n    window.history.pushState(historyState(view, { selectedId: student.id }), "", window.location.href);\n    setSelected(student);\n  }\n  function openNewStudent() {\n    window.history.pushState(historyState(view, { overlay: "new-student" }), "", window.location.href);\n    setNewOpen(true);\n  }\n  function openSchedule(studentId: number | null = null) {\n    window.history.pushState(historyState(view, { overlay: "schedule", modalStudentId: studentId }), "", window.location.href);\n    setSelected(null);\n    setScheduleStudentId(studentId);\n    setScheduleOpen(true);\n  }\n  function openCredit(studentId: number | null = null) {\n    window.history.pushState(historyState(view, { overlay: "credit", modalStudentId: studentId }), "", window.location.href);\n    setSelected(null);\n    setCreditStudentId(studentId);\n    setCreditOpen(true);\n  }\n  function goBack(fallback: View = "home") {\n    const state = window.history.state as CyaHistoryState | null;\n    if (state?.cyaHub && (state.selectedId || state.overlay || state.view !== "home")) {\n      window.history.back();\n      return;\n    }\n    replaceView(fallback);\n  }\n  async function setExperience(value: ExperienceContext) {\n    const allowed = value === "teacher" ? activeIdentity.can_teach : value === "student" ? activeIdentity.can_study : activeIdentity.can_admin;\n    if (!allowed || !db) return;\n    if (value === "admin") navigateView("admin", { experience: value });\n    else if (value === "teacher" && view === "admin") navigateView("home", { experience: value });\n    else {\n      window.history.pushState(historyState(view, { experience: value }), "", window.location.href);\n      setExperienceState(value);\n    }\n    const result = await db.from("user_preferences").upsert({ user_id: activeIdentity.user_id, preferred_context: value }, { onConflict: "user_id" });\n    if (result.error) setToast("La vista ha cambiado, pero no se pudo guardar como preferencia.");\n  }''',
    'navigation helpers',
)
replace_once(
    '''  async function created() { await Promise.all([loadStudents(),loadMarketing()]); setToast("Alumno provisional creado correctamente."); setView("students"); }\n  async function classSaved() { await Promise.all([loadOperations(),loadMarketing()]); setToast("Clase programada correctamente."); setView("classes"); }\n  async function creditSaved() { await Promise.all([loadOperations(),loadMarketing()]); setToast("Bono creado correctamente."); setView("credits"); }''',
    '''  async function created() { await Promise.all([loadStudents(),loadMarketing()]); setToast("Alumno provisional creado correctamente."); setNewOpen(false); replaceView("students"); }\n  async function classSaved() { await Promise.all([loadOperations(),loadMarketing()]); setToast("Clase programada correctamente."); setScheduleOpen(false); setScheduleStudentId(null); replaceView("classes"); }\n  async function creditSaved() { await Promise.all([loadOperations(),loadMarketing()]); setToast("Bono creado correctamente."); setCreditOpen(false); setCreditStudentId(null); replaceView("credits"); }''',
    'save destinations',
)
replace_once(
    '''  function goLive(id?: number) { if (id) setLiveClassId(id); setView("live"); }\n  function goTarget(target: string) {\n    if (target === "admin") { if (activeIdentity.can_admin) { setExperienceState("admin"); setView("admin"); } return; }\n    if (target === "live") { goLive(); return; }\n    if (["home", "students", "classes", "credits", "agenda", "teaching", "marketing"].includes(target)) setView(target as View);\n  }''',
    '''  function goLive(id?: number) { navigateView("live", { liveClassId: id ?? liveClassId }); }\n  function goTarget(target: string) {\n    if (target === "admin") { if (activeIdentity.can_admin) navigateView("admin", { experience: "admin" }); return; }\n    if (target === "live") { goLive(); return; }\n    if (["home", "students", "classes", "credits", "agenda", "teaching", "marketing"].includes(target)) navigateView(target as View);\n  }''',
    'go target',
)

for old, new, label in [
    ('onClick={() => setView(id)}><Icon />{label}</button>', 'onClick={() => navigateView(id)}><Icon />{label}</button>', 'sidebar nav'),
    ('onClick={() => setView("home")} aria-label="Notificaciones"', 'onClick={() => navigateView("home")} aria-label="Notificaciones"', 'header notification'),
    ('onClick={() => setView("students")}><UsersRound /> Alumnos</button>', 'onClick={() => navigateView("students")}><UsersRound /> Alumnos</button>', 'students tab'),
    ('onClick={() => setView("classes")}><CalendarDays /> Clases</button>', 'onClick={() => navigateView("classes")}><CalendarDays /> Clases</button>', 'classes tab'),
    ('onClick={() => setView("credits")}><WalletCards /> Bonos</button>', 'onClick={() => navigateView("credits")}><WalletCards /> Bonos</button>', 'credits tab'),
    ('onClick={() => setView("agenda")}><CalendarDays /> Agenda</button>', 'onClick={() => navigateView("agenda")}><CalendarDays /> Agenda</button>', 'agenda tab'),
    ('addStudent={() => setNewOpen(true)} scheduleClass={() => { setScheduleStudentId(null); setScheduleOpen(true); }}', 'addStudent={openNewStudent} scheduleClass={() => openSchedule(null)}', 'home quick actions'),
    ('query={query} setQuery={setQuery} add={() => setNewOpen(true)} open={setSelected} schedule={(student) => { setScheduleStudentId(student.id); setScheduleOpen(true); }} credit={(student) => { setCreditStudentId(student.id); setCreditOpen(true); }}', 'query={query} setQuery={setQuery} add={openNewStudent} open={openStudentDetail} schedule={(student) => openSchedule(student.id)} credit={(student) => openCredit(student.id)}', 'students actions'),
    ('schedule={() => { setScheduleStudentId(null); setScheduleOpen(true); }} goLive={goLive}', 'schedule={() => openSchedule(null)} goLive={goLive}', 'classes schedule'),
    ('add={() => { setCreditStudentId(null); setCreditOpen(true); }}', 'add={() => openCredit(null)}', 'credits add'),
    ('schedule={() => { setScheduleStudentId(null); setScheduleOpen(true); }} openClass={goLive}', 'schedule={() => openSchedule(null)} openClass={goLive}', 'agenda schedule'),
    ('exit={() => setView("home")}', 'exit={() => goBack("home")}', 'live exit'),
    ('onClick={() => setView(id)}><Icon /><span>{label}</span></button>', 'onClick={() => navigateView(id)}><Icon /><span>{label}</span></button>', 'mobile nav'),
    ('{newOpen ? <AddStudent close={() => setNewOpen(false)} created={created} /> : null}', '{newOpen ? <AddStudent close={() => goBack(view)} created={created} /> : null}', 'new student close'),
    ('close={() => { setScheduleOpen(false); setScheduleStudentId(null); }} saved={classSaved}', 'close={() => goBack(view)} saved={classSaved}', 'schedule close'),
    ('close={() => { setCreditOpen(false); setCreditStudentId(null); }} saved={creditSaved}', 'close={() => goBack(view)} saved={creditSaved}', 'credit close'),
    ('close={() => setSelected(null)}', 'close={() => goBack(view)}', 'student detail close'),
    ('schedule={() => { setSelected(null); setScheduleStudentId(selected.id); setScheduleOpen(true); }}', 'schedule={() => openSchedule(selected.id)}', 'student detail schedule'),
    ('addCredit={() => { setSelected(null); setCreditStudentId(selected.id); setCreditOpen(true); }}', 'addCredit={() => openCredit(selected.id)}', 'student detail credit'),
    ('openClass={(id) => { setSelected(null); goLive(id); }}', 'openClass={(id) => goLive(id)}', 'student detail class'),
]:
    replace_once(old, new, label)

replace_once(
    '''      <main className="main"><div className="content">\n        {view !== "live" ? <div className="context-toolbar"><ContextSelector identity={identity} value={experience} onChange={setExperience} compact /></div> : null}''',
    '''      <main className="main"><div className="content">\n        {view !== "home" && view !== "live" ? <button className="app-back" type="button" onClick={() => goBack("home")}><ArrowLeft size={18} /> Volver</button> : null}\n        {view !== "live" ? <div className="context-toolbar"><ContextSelector identity={identity} value={experience} onChange={setExperience} compact /></div> : null}''',
    'visible back control',
)
app_path.write_text(text)

css = css_path.read_text()
marker = '/* CYA history navigation */'
if marker in css:
    raise SystemExit('navigation CSS marker already present')
css += '''\n\n/* CYA history navigation */\n.app-back {\n  display: inline-flex;\n  align-items: center;\n  gap: 0.45rem;\n  min-height: 44px;\n  margin: 0 0 0.65rem;\n  padding: 0.45rem 0.75rem;\n  border: 0;\n  border-radius: 999px;\n  background: transparent;\n  color: var(--ink, #24212f);\n  font: inherit;\n  font-weight: 750;\n  cursor: pointer;\n}\n.app-back:hover { background: rgba(109, 74, 255, 0.08); }\n.app-back:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }\n@media (max-width: 720px) {\n  .app-back { margin-top: -0.15rem; }\n}\n'''
css_path.write_text(css)
