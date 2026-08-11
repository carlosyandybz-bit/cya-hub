from pathlib import Path

# ---- cya-app.tsx ----
app_path=Path('app/cya-app.tsx')
app=app_path.read_text()

import_anchor='import { ClassSummaryContentEditor } from "./class-summary-content-editor";\n'
import_line='import { QuickProvisionalStudentModal, type EditablePersonIdentity } from "./person-identity-editor";\n'
if import_line not in app:
    if import_anchor not in app: raise SystemExit('cya-app import anchor missing')
    app=app.replace(import_anchor,import_anchor+import_line,1)

app=app.replace('{student.auth_user_id ? "Con portal" : "Provisional"}','{student.auth_user_id ? "Registrado" : "Provisional"}',1)

old_refresh='''  const refreshLive = useCallback(async () => {\n    await loadOperations();\n    try { await loadTeaching(); }\n    catch (error) { setToast(error instanceof Error ? error.message : "La clase está abierta, pero no se pudo actualizar la enseñanza."); }\n  }, [loadOperations,loadTeaching]);'''
new_refresh='''  const refreshLive = useCallback(async () => {\n    await Promise.all([loadOperations(),loadStudents()]);\n    try { await loadTeaching(); }\n    catch (error) { setToast(error instanceof Error ? error.message : "La clase está abierta, pero no se pudo actualizar la enseñanza."); }\n  }, [loadOperations,loadStudents,loadTeaching]);'''
if old_refresh in app:
    app=app.replace(old_refresh,new_refresh,1)
elif new_refresh not in app:
    raise SystemExit('refreshLive anchor missing')

old_sig='''function ManualClassDraft({ students, close, created }: { students: Person[]; close: () => void; created: (id: number) => Promise<void> }) {\n  const [type,setType] = useState<"individual"|"pair">("individual"), [busy,setBusy] = useState(false), [error,setError] = useState("");'''
new_sig='''function ManualClassDraft({ students, close, created, refresh }: { students: Person[]; close: () => void; created: (id: number) => Promise<void>; refresh: () => Promise<void> }) {\n  const [type,setType] = useState<"individual"|"pair">("individual"), [busy,setBusy] = useState(false), [error,setError] = useState("");\n  const [firstId,setFirstId] = useState(""), [secondId,setSecondId] = useState("");\n  const [quickSlot,setQuickSlot] = useState<1|2|null>(null);'''
if old_sig in app:
    app=app.replace(old_sig,new_sig,1)
elif new_sig not in app:
    raise SystemExit('ManualClassDraft signature anchor missing')

old_selects='''<div className="fields-2"><label className="field"><span>Alumno *</span><select name="student_1" required defaultValue=""><option value="" disabled>Seleccionar</option>{students.map((student) => <option key={student.id} value={student.id}>{student.display_name}</option>)}</select></label>{type === "pair" ? <label className="field"><span>Segundo alumno *</span><select name="student_2" required defaultValue=""><option value="" disabled>Seleccionar</option>{students.map((student) => <option key={student.id} value={student.id}>{student.display_name}</option>)}</select></label> : null}</div><p className="modal-intro">Después confirmarás fecha, duración, estilo, rol, nivel, lugar y bono antes de empezar a bailar.</p>'''
new_selects='''<div className="fields-2"><div className="field"><span>Alumno *</span><select name="student_1" required value={firstId} onChange={(event) => setFirstId(event.target.value)}><option value="" disabled>Seleccionar</option>{students.map((student) => <option key={student.id} value={student.id}>{student.display_name}</option>)}</select><button type="button" className="text-button" onClick={() => setQuickSlot(1)}><Plus size={15}/> Crear alumno provisional</button></div>{type === "pair" ? <div className="field"><span>Segundo alumno *</span><select name="student_2" required value={secondId} onChange={(event) => setSecondId(event.target.value)}><option value="" disabled>Seleccionar</option>{students.map((student) => <option key={student.id} value={student.id}>{student.display_name}</option>)}</select><button type="button" className="text-button" onClick={() => setQuickSlot(2)}><Plus size={15}/> Crear alumno provisional</button></div> : null}</div><p className="modal-intro">Después confirmarás fecha, duración, estilo, rol, nivel, lugar y bono antes de empezar a bailar.</p>'''
if old_selects in app:
    app=app.replace(old_selects,new_selects,1)
elif new_selects not in app:
    raise SystemExit('ManualClassDraft selects anchor missing')

old_return_end='''{error ? <p className="error">{error}</p> : null}<div className="actions"><button className="btn ghost" type="button" onClick={close}>Cancelar</button><button className="btn" disabled={busy}><ArrowRight size={17} /> {busy ? "Creando…" : "Continuar"}</button></div></form>\n  </section></div>;\n}\n\nfunction ClassSetupStage'''
new_return_end='''{error ? <p className="error">{error}</p> : null}<div className="actions"><button className="btn ghost" type="button" onClick={close}>Cancelar</button><button className="btn" disabled={busy}><ArrowRight size={17} /> {busy ? "Creando…" : "Continuar"}</button></div></form>\n  </section></div>{quickSlot && db ? <QuickProvisionalStudentModal client={db} close={() => setQuickSlot(null)} created={async (person: EditablePersonIdentity) => { await refresh(); if (quickSlot===1) setFirstId(String(person.id)); else setSecondId(String(person.id)); }} /> : null}</>;\n}\n\nfunction ClassSetupStage'''
if old_return_end in app:
    app=app.replace('  return <div className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><section className="modal" role="dialog" aria-modal="true">\n    <header className="modal-head"><h2>Empezar otra clase</h2>', '  return <><div className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><section className="modal" role="dialog" aria-modal="true">\n    <header className="modal-head"><h2>Empezar otra clase</h2>',1)
    app=app.replace(old_return_end,new_return_end,1)
elif 'QuickProvisionalStudentModal client={db}' not in app:
    raise SystemExit('ManualClassDraft return anchor missing')

old_manual_call='<ManualClassDraft students={students} close={() => setManualOpen(false)} created={async (id) => { await refresh(); selectClass(id); }} />'
new_manual_call='<ManualClassDraft students={students} close={() => setManualOpen(false)} refresh={refresh} created={async (id) => { await refresh(); selectClass(id); }} />'
if old_manual_call in app:
    app=app.replace(old_manual_call,new_manual_call,1)
elif new_manual_call not in app:
    raise SystemExit('ManualClassDraft call anchor missing')

student_detail_anchor='''      rates={marketingRates}\n      close={() => goBack(view)}'''
student_detail_new='''      rates={marketingRates}\n      refresh={async () => { await Promise.all([loadStudents(),loadMarketing()]); }}\n      close={() => goBack(view)}'''
if student_detail_anchor in app:
    app=app.replace(student_detail_anchor,student_detail_new,1)
elif 'refresh={async () => { await Promise.all([loadStudents(),loadMarketing()]); }}' not in app:
    raise SystemExit('StudentMasterDetail refresh anchor missing')

app_path.write_text(app)

# ---- student-detail.tsx ----
detail_path=Path('app/student-detail.tsx')
detail=detail_path.read_text()
if '  Pencil,\n' not in detail:
    detail=detail.replace('  Phone,\n  Target,','  Phone,\n  Pencil,\n  Target,',1)
identity_import='import { StudentIdentityEditor } from "./person-identity-editor";\n'
if identity_import not in detail:
    anchor='import { EvaluationRadar } from "./evaluation-radar";\n'
    if anchor not in detail: raise SystemExit('student detail import anchor missing')
    detail=detail.replace(anchor,anchor+identity_import,1)

if '  health_notes?: string | null;\n' not in detail:
    detail=detail.replace('  teacher_notes: string | null;\n  active: boolean;','  teacher_notes: string | null;\n  health_notes?: string | null;\n  active: boolean;',1)

old_props='''  rates,\n  close,\n  schedule,'''
new_props='''  rates,\n  refresh,\n  close,\n  schedule,'''
if old_props in detail:
    detail=detail.replace(old_props,new_props,1)

old_type='''  rates: Rate[];\n  close: () => void;'''
new_type='''  rates: Rate[];\n  refresh: () => Promise<void>;\n  close: () => void;'''
if old_type in detail:
    detail=detail.replace(old_type,new_type,1)
elif new_type not in detail:
    raise SystemExit('student detail props type anchor missing')

state_anchor='''  const [tab, setTab] = useState<Tab>("summary");\n  const [profile, setProfile] = useState<StudentProfile | null>(null);'''
state_new='''  const [tab, setTab] = useState<Tab>("summary");\n  const [profile, setProfile] = useState<StudentProfile | null>(null);\n  const [identityEditorOpen,setIdentityEditorOpen] = useState(false);\n  const [profileRefresh,setProfileRefresh] = useState(0);'''
if state_anchor in detail:
    detail=detail.replace(state_anchor,state_new,1)
elif 'identityEditorOpen' not in detail:
    raise SystemExit('student detail state anchor missing')

detail=detail.replace('select("person_id,student_since,goals,teacher_notes,active")','select("person_id,student_since,goals,teacher_notes,health_notes,active")',1)
detail=detail.replace('  }, [client, student.id]);','  }, [client, student.id, profileRefresh]);',1)

old_identity_head='<section className={styles.sectionCard}><div className={styles.sectionHead}><div><span>Identidad</span><h3>Datos principales</h3></div></div><div className={styles.readGrid}>'
new_identity_head='<section className={styles.sectionCard}><div className={styles.sectionHead}><div><span>Identidad</span><h3>Datos principales</h3></div><button onClick={() => setIdentityEditorOpen(true)}><Pencil size={15}/> Editar</button></div><div className={styles.readGrid}>'
if old_identity_head in detail:
    detail=detail.replace(old_identity_head,new_identity_head,1)
elif new_identity_head not in detail:
    raise SystemExit('renderData identity header anchor missing')

old_notes='<div className={styles.longText}><strong>Objetivos</strong><p>{profile?.goals || "Sin objetivos guardados."}</p><strong>Notas internas</strong><p>{profile?.teacher_notes || "Sin notas internas."}</p></div>'
new_notes='<div className={styles.longText}><strong>Objetivos</strong><p>{profile?.goals || "Sin objetivos guardados."}</p><strong>Notas internas</strong><p>{profile?.teacher_notes || "Sin notas internas."}</p><strong>Salud / a tener en cuenta</strong><p>{profile?.health_notes || "Sin indicaciones."}</p></div>'
if old_notes in detail:
    detail=detail.replace(old_notes,new_notes,1)

end_anchor='''      </div>\n    </section>\n  </div>;\n}\n'''
end_new='''      </div>\n    </section>\n    {identityEditorOpen ? <StudentIdentityEditor client={client} person={student} profile={profile} close={() => setIdentityEditorOpen(false)} saved={async () => { await refresh(); setProfileRefresh((value) => value + 1); }} /> : null}\n  </div>;\n}\n'''
if end_anchor in detail:
    detail=detail.replace(end_anchor,end_new,1)
elif 'StudentIdentityEditor client={client}' not in detail:
    raise SystemExit('student detail end anchor missing')

detail_path.write_text(detail)

# ---- marketing-view-legacy.tsx ----
marketing_path=Path('app/marketing-view-legacy.tsx')
marketing=marketing_path.read_text()
marketing=marketing.replace('Potenciales, provisionales y alumnos comparten una sola ficha.','Potenciales, provisionales y registrados comparten una sola persona.',1)
old_row='''{filtered.length ? <div className="crm-list">{filtered.map((contact) => { const profile = contact.crm_profiles?.[0], provisional = contact.student_profiles?.some((item) => item.active); return <article className="card crm-row" key={contact.id}>\n      <span className="avatar"><CircleUserRound /></span><div className="crm-row-main"><div><strong>{contact.display_name}</strong><span className={`badge stage-${contact.crm_stage}`}>{stageLabels[contact.crm_stage] ?? contact.crm_stage}</span>{provisional ? <span className="badge portal">Ficha alumno</span> : null}</div>'''
new_row='''{filtered.length ? <div className="crm-list">{filtered.map((contact) => { const profile = contact.crm_profiles?.[0], provisional = contact.student_profiles?.some((item) => item.active), lifecycle = provisional ? (contact.auth_user_id ? "Registrado" : "Provisional") : "Potencial"; return <article className="card crm-row" key={contact.id}>\n      <span className="avatar"><CircleUserRound /></span><div className="crm-row-main"><div><strong>{contact.display_name}</strong><span className={`badge stage-${contact.crm_stage}`}>{stageLabels[contact.crm_stage] ?? contact.crm_stage}</span><span className={`badge ${contact.auth_user_id ? "portal" : ""}`}>{lifecycle}</span></div>'''
if old_row in marketing:
    marketing=marketing.replace(old_row,new_row,1)
elif 'lifecycle = provisional ? (contact.auth_user_id ? "Registrado" : "Provisional") : "Potencial"' not in marketing:
    raise SystemExit('marketing lifecycle row anchor missing')
marketing_path.write_text(marketing)
