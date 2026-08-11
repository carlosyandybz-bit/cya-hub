from pathlib import Path
import re


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing pattern: {label}")
    return text.replace(old, new, 1)

# Fix shared evaluation engine compile-time details.
p=Path('app/evaluation-engine.tsx'); s=p.read_text()
s=s.replace('type Requirement={person_id:number;style_term_id:number;role_term_id:number;level_term_id:number;mode:"diagnostic"|"review";confirmed:boolean};','type Requirement={person_id:number;style_term_id:number;role_term_id:number;level_term_id:number;mode:"diagnostic"|"review";confirmed:boolean;class_id?:number};')
s=s.replace('classId:number;styleId:number','classId:number|null;styleId:number')
s=s.replace(' readOnly />',' readonly />')
s=s.replace('p_class_id:requirement.class_id}', 'p_class_id:requirement.class_id??null}')
s=s.replace('p_class_id:requirement.class_id,p_person_id', 'p_class_id:requirement.class_id!,p_person_id')
p.write_text(s)

# CYA class workflow.
p=Path('app/cya-app.tsx'); s=p.read_text()
s=replace_once(s,'import { EvaluationRadar } from "./evaluation-radar";','import { EvaluationRadar } from "./evaluation-radar";\nimport { ClassEvaluationClose, InitialEvaluationQuiz } from "./evaluation-engine";','cya evaluation import')
state_anchor='  const [measurementMode,setMeasurementMode]=useState<"frequency"|"importance"|"both"|"none">("both"), [frequency,setFrequency]=useState(50), [importance,setImportance]=useState(50), [busy,setBusy]=useState(""), [syncError,setSyncError]=useState(""), [finishOpen,setFinishOpen]=useState(false), [evaluationLevelId,setEvaluationLevelId]=useState<number|null>(firstParticipant?.level_term_id ?? null);'
if state_anchor not in s:
    # tolerate compact formatting from prior commit
    state_anchor=re.search(r'  const \[measurementMode.*?evaluationLevelId.*?;\n',s).group(0).rstrip('\n') if re.search(r'  const \[measurementMode.*?evaluationLevelId.*?;\n',s) else ''
if not state_anchor: raise SystemExit('missing live state anchor')
s=s.replace(state_anchor,state_anchor+'\n  const [needsInitialEvaluation,setNeedsInitialEvaluation]=useState(false);',1)
participant_anchor="  const participant=item.class_participants.find((p) => p.person_id===activePersonId) ?? item.class_participants[0], student=students.find((person) => person.id===activePersonId), style=terms.find((term) => term.id===item.style_term_id), roleTerm=terms.find((term) => term.id===participant?.role_term_id), levelTerm=terms.find((term) => term.id===participant?.level_term_id);"
participant_extra=participant_anchor+'''\n  useEffect(() => {\n    if (!db || !participant || !item.style_term_id || !participant.role_term_id) { setNeedsInitialEvaluation(false); return; }\n    let alive=true;\n    void db.from("evaluation_sessions").select("id").eq("person_id",participant.person_id).eq("style_term_id",item.style_term_id).eq("role_term_id",participant.role_term_id).eq("status","completed").limit(1).then(async (result) => {\n      if (!alive || result.error) return;\n      if ((result.data ?? []).length) { setNeedsInitialEvaluation(false); return; }\n      if (levelTerm?.term_key==="desde_cero") {\n        const initialized=await db?.rpc("initialize_zero_evaluation",{p_person_id:participant.person_id,p_style_term_id:item.style_term_id,p_role_term_id:participant.role_term_id,p_class_id:item.id});\n        if (alive) setNeedsInitialEvaluation(Boolean(initialized?.error));\n        return;\n      }\n      if (alive) setNeedsInitialEvaluation(true);\n    });\n    return () => { alive=false; };\n  },[activePersonId,item.id,item.style_term_id,participant?.person_id,participant?.role_term_id,levelTerm?.term_key]);'''
s=replace_once(s,participant_anchor,participant_extra,'participant eval check')
old_nav='<button className={liveTab===\'evaluate\'?\'active\':\'\'} onClick={() => setLiveTab(\'evaluate\')}><TrendingUp/> Evaluar</button>'
s=replace_once(s,old_nav,"{needsInitialEvaluation ? <button className={liveTab==='evaluate'?'active':''} onClick={() => setLiveTab('evaluate')}><TrendingUp/> Evaluar</button> : null}",'conditional evaluate tab')
pat=re.compile(r"\{liveTab==='evaluate' \? <section className=\"card live-card live-evaluation\">.*?</section> : null\}",re.S)
replacement="{liveTab==='evaluate' && needsInitialEvaluation && db && participant && item.style_term_id && participant.role_term_id ? <InitialEvaluationQuiz client={db} personId={participant.person_id} classId={item.id} styleId={item.style_term_id} roleId={participant.role_term_id} terms={terms} onCompleted={() => { setNeedsInitialEvaluation(false); setLiveTab('work'); void loadLive(); }} /> : null}"
s,n=pat.subn(replacement,s,count=1)
if n!=1: raise SystemExit('missing old live evaluation block')
old_sig='function ClassFinalSummary({ item, students, library, refresh, notify, done, back }: { item: ClassItem; students: Person[]; library: TeachingContent[]; refresh: () => Promise<void>; notify: (message:string) => void; done: () => void; back: () => void }) {'
new_sig='function ClassFinalSummary({ item, students, library, terms, refresh, notify, done, back }: { item: ClassItem; students: Person[]; library: TeachingContent[]; terms: CatalogTerm[]; refresh: () => Promise<void>; notify: (message:string) => void; done: () => void; back: () => void }) {'
s=replace_once(s,old_sig,new_sig,'final summary signature')
messages='<section className="card pad workflow-card"><div className="card-head"><h2>Mensajes</h2></div>'
s=replace_once(s,messages,'{db ? <section className="card pad workflow-card"><ClassEvaluationClose client={db} classId={item.id} terms={terms} /></section> : null}\n    '+messages,'final evaluation review')
# Add terms prop to ClassFinalSummary invocation.
def add_terms(m):
    tag=m.group(0)
    return tag if ' terms={' in tag else tag[:-2]+' terms={terms} />'
s,n=re.subn(r'<ClassFinalSummary\b[^>]*?/>',add_terms,s,count=1)
if n!=1: raise SystemExit('ClassFinalSummary invocation not found')
p.write_text(s)

# Administration editor.
p=Path('app/admin-view.tsx'); s=p.read_text()
s=replace_once(s,'import { AdminDataTransfer } from "./admin-data-transfer";','import { AdminDataTransfer } from "./admin-data-transfer";\nimport { EvaluationAdminEditor } from "./evaluation-admin";','admin eval import')
old='return <section className="admin-stack"><header className="admin-section-head"><div><h2>Configuración pedagógica</h2><p>Estilos, roles, niveles, aptitudes y categorías compartidos por toda la aplicación.</p></div></header><div className="admin-taxonomy-grid">'
new='return <section className="admin-stack"><header className="admin-section-head"><div><h2>Configuración pedagógica</h2><p>Estilos, roles, niveles, aptitudes y categorías compartidos por toda la aplicación.</p></div></header><EvaluationAdminEditor client={client} notify={notify} /><div className="admin-taxonomy-grid">'
s=replace_once(s,old,new,'admin teaching editor')
p.write_text(s)

# Student master detail: manual/pre-class diagnostic uses the same questionnaire, not numeric buttons.
p=Path('app/student-detail.tsx'); s=p.read_text()
s=replace_once(s,'import { EvaluationRadar } from "./evaluation-radar";','import { EvaluationRadar } from "./evaluation-radar";\nimport { InitialEvaluationQuiz } from "./evaluation-engine";','student eval import')
pat=re.compile(r'  function renderEvaluation\(\) \{.*?\n  \}\n\n  function renderClasses',re.S)
new_render='''  function renderEvaluation() {\n    const selectedProfile=danceProfiles.find((item) => item.id===evaluationProfileId) ?? danceProfiles.find((item) => item.is_primary) ?? danceProfiles[0] ?? null;\n    const selectedLevel=evaluationLevelId ?? selectedProfile?.level_term_id ?? null;\n    const contextRows=evaluations.filter((item) => item.style_term_id===selectedProfile?.style_term_id && item.role_term_id===selectedProfile?.role_term_id && item.level_term_id===selectedLevel);\n    const latest=new Map<number,Evaluation>(); contextRows.forEach((item) => { if(!latest.has(item.aptitude_term_id)) latest.set(item.aptitude_term_id,item); });\n    const currentRadar=[...latest.values()].map((item) => ({id:item.aptitude_term_id,label:termLabel(item.aptitude_term_id,terms),value:item.score as number|null}));\n    return <div className={styles.evalStack}>\n      <section className={styles.sectionCard}><div className={styles.sectionHead}><div><span>Contexto</span><h3>Evaluación del alumno</h3></div><button onClick={() => setEvaluationDraftOpen(!evaluationDraftOpen)}>{evaluationDraftOpen?'Cerrar':'Nueva evaluación'}</button></div><div className={styles.evaluationCapture}><label><span>Estilo y rol</span><select value={evaluationProfileId ?? ''} onChange={(event) => { const id=Number(event.target.value); setEvaluationProfileId(id); const profile=danceProfiles.find(x=>x.id===id); setEvaluationLevelId(profile?.level_term_id??null); }}><option value="">Seleccionar</option>{danceProfiles.map((item) => <option key={item.id} value={item.id}>{termLabel(item.style_term_id,terms)} · {termLabel(item.role_term_id,terms)}</option>)}</select></label><label><span>Nivel</span><select value={selectedLevel??''} onChange={(event) => setEvaluationLevelId(Number(event.target.value))}><option value="">Seleccionar</option>{terms.filter(t=>t.taxonomy==='dance_level').sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)).map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label></div>{evaluationDraftOpen&&selectedProfile&&selectedLevel?<InitialEvaluationQuiz client={client} personId={student.id} classId={null} styleId={selectedProfile.style_term_id} roleId={selectedProfile.role_term_id} terms={terms} onCompleted={() => setEvaluationDraftOpen(false)} />:null}</section>\n      <div className={styles.evalGrid}><section className={styles.sectionCard}><div className={styles.sectionHead}><div><span>Estado real</span><h3>{selectedProfile?`${termLabel(selectedProfile.style_term_id,terms)} · ${termLabel(selectedLevel,terms)}`:'Selecciona contexto'}</h3></div></div>{currentRadar.length?<EvaluationRadar items={currentRadar} scale={[]} readonly ariaLabel={`Evaluación actual de ${student.display_name}`} />:<div className={styles.empty}><TrendingUp/><span>Sin evaluación en este contexto.</span></div>}</section><section className={styles.sectionCard}><div className={styles.sectionHead}><div><span>Historial</span><h3>Evaluaciones registradas</h3></div><b>{contextRows.length}</b></div>{contextRows.length?<div className={styles.historyList}>{contextRows.slice(0,30).map(item=><div key={item.id}><div><strong>{termLabel(item.aptitude_term_id,terms)}</strong><span>{dateLabel(item.created_at)} · {termLabel(item.level_term_id,terms)}</span>{item.note?<small>{item.note}</small>:null}</div><b>{item.score}</b></div>)}</div>:<div className={styles.empty}><TrendingUp/><span>Sin historial para este contexto.</span></div>}</section></div>\n    </div>;\n  }\n\n  function renderClasses'''
s,n=pat.subn(new_render,s,count=1)
if n!=1: raise SystemExit('renderEvaluation block not found')
p.write_text(s)
