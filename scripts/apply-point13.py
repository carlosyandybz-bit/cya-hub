from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing block: {label}")
    if text.count(old) != 1:
        raise SystemExit(f"ambiguous block {label}: {text.count(old)}")
    return text.replace(old, new, 1)

# Dar clase
path = Path("app/cya-app.tsx")
text = path.read_text()
text = replace_once(text,
    'import { TeachingContentCard, type TeachingCardMedia } from "./teaching-content-card";\n',
    'import { TeachingContentCard, type TeachingCardMedia } from "./teaching-content-card";\nimport { EvaluationRadar } from "./evaluation-radar";\n',
    "cya import")
old = """  const scale=terms.filter((term) => term.taxonomy==='evaluation_scale').map((term) => ({term,score:Number(term.metadata.score)})).filter(({score}) => [0,25,50,75,100].includes(score)).sort((a,b)=>a.score-b.score);\n"""
new = """  const scale=terms.filter((term) => term.taxonomy==='evaluation_scale').map((term) => ({term,score:Number(term.metadata.score)})).filter(({score}) => [0,25,50,75,100].includes(score)).sort((a,b)=>a.score-b.score);\n  const evaluationRadarItems=aptitudes.map((aptitude) => { const current=evaluations.find((evaluation) => evaluation.person_id===activePersonId && evaluation.level_term_id===evaluationLevelId && evaluation.aptitude_term_id===aptitude.id); return {id:aptitude.id,label:aptitude.label,value:current?.score ?? null}; });\n"""
text = replace_once(text, old, new, "live radar items")
old = """  async function saveEvaluation(aptitudeId:number,scoreValue:number) { if (!db || !participant || !evaluationLevelId || !item.style_term_id || !participant.role_term_id) return; setBusy(`eval-${aptitudeId}`); const result=await db.rpc('save_class_evaluation_v2',{p_class_id:item.id,p_person_id:participant.person_id,p_level_term_id:evaluationLevelId,p_aptitude_term_id:aptitudeId,p_score:scoreValue}); if (result.error) notify(result.error.message); else await loadLive(); setBusy(''); }\n"""
new = """  async function saveEvaluation(aptitudeId:number,scoreValue:number) { if (!db || !participant || !evaluationLevelId || !item.style_term_id || !participant.role_term_id) return; setBusy(`eval-${aptitudeId}`); const result=await db.rpc('save_class_evaluation_v2',{p_class_id:item.id,p_person_id:participant.person_id,p_level_term_id:evaluationLevelId,p_aptitude_term_id:aptitudeId,p_score:scoreValue}); if (result.error) notify(result.error.message); else { const row=result.data as StudentEvaluation; setEvaluations((current) => [row,...current.filter((evaluation) => evaluation.id!==row.id)]); } setBusy(''); }\n"""
text = replace_once(text, old, new, "live evaluation save")
start = text.index("      {liveTab==='evaluate' ? <section className=\"card live-card live-evaluation\">")
end = text.index("      {liveTab==='notes' ?", start)
replacement = """      {liveTab==='evaluate' ? <section className=\"card live-card live-evaluation\"><div className=\"live-card-head\"><div><p className=\"eyebrow\">Evaluación</p><h2>Evaluar ahora</h2></div><span className=\"badge\">5 niveles</span></div><div className=\"evaluation-context\"><label className=\"field\"><span>1. Nivel que estás evaluando</span><select value={evaluationLevelId ?? ''} onChange={(event) => setEvaluationLevelId(event.target.value?Number(event.target.value):null)}><option value=\"\">Selecciona nivel</option>{terms.filter((term) => term.taxonomy==='dance_level').sort((a,b)=>a.sort_order-b.sort_order).map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label><div><span>Contexto heredado</span><strong>{style?.label || 'Estilo pendiente'} · {roleTerm?.label || 'Rol pendiente'}</strong><small>El nivel se elige explícitamente; estilo y rol vienen de esta clase.</small></div></div>{!evaluationLevelId ? <div className=\"compact-empty\"><CircleUserRound/><span>Selecciona primero el nivel que quieres evaluar.</span></div> : !aptitudes.length ? <div className=\"compact-empty\"><TrendingUp/><span>No hay parámetros configurados para este nivel, estilo y rol.</span></div> : <EvaluationRadar items={evaluationRadarItems} scale={scale.map(({term,score}) => ({score,label:term.label}))} busyId={busy.startsWith('eval-')?Number(busy.slice(5)):null} onChange={(aptitudeId,scoreValue) => void saveEvaluation(aptitudeId,scoreValue)} ariaLabel={`Evaluación de ${student?.display_name || 'alumno'} · ${evaluationLevelTerm?.label || ''}`} />}</section> : null}\n"""
text = text[:start] + replacement + text[end:]
path.write_text(text)

# Ficha alumno
path = Path("app/student-detail.tsx")
text = path.read_text()
text = replace_once(text,
    'import { TeachingContentCard, type TeachingCardMedia } from "./teaching-content-card";\n',
    'import { TeachingContentCard, type TeachingCardMedia } from "./teaching-content-card";\nimport { EvaluationRadar } from "./evaluation-radar";\n',
    "detail import")
start = text.index("function StudentRadar(")
end = text.index("\nexport function StudentMasterDetail", start)
text = text[:start] + text[end+1:]
old = """  const radarItems = [...latestByAptitude.values()].map((item) => ({ label: termLabel(item.aptitude_term_id, terms), value: item.score }));\n  const averageScore = radarItems.length ? Math.round(radarItems.reduce((sum, item) => sum + item.value, 0) / radarItems.length) : null;\n"""
new = """  const radarItems = [...latestByAptitude.values()].map((item) => ({ id:item.aptitude_term_id,label:termLabel(item.aptitude_term_id,terms),value:item.score as number|null }));\n  const averageScore = radarItems.length ? Math.round(radarItems.reduce((sum, item) => sum + Number(item.value || 0), 0) / radarItems.length) : null;\n"""
text = replace_once(text, old, new, "detail radar items")
old = """<div className={styles.evaluationParameterList}>{evaluationAptitudes.map((aptitude) => <article key={aptitude.id}><div><strong>{aptitude.label}</strong><span>{evaluationScores[aptitude.id]===undefined?'Sin evaluar':`${evaluationScores[aptitude.id]}/100`}</span></div><div className={styles.evaluationScale}>{evaluationScale.map(({term,score}) => <button key={term.id} className={evaluationScores[aptitude.id]===score?styles.evaluationSelected:''} title={term.label} disabled={evaluationBusy===`score-${aptitude.id}`} onClick={() => void saveEvaluationCapture(aptitude.id,score)}><b>{score}</b><small>{term.label}</small></button>)}</div></article>)}</div>"""
new = """<EvaluationRadar items={evaluationAptitudes.map((aptitude) => ({id:aptitude.id,label:aptitude.label,value:evaluationScores[aptitude.id] ?? null}))} scale={evaluationScale.map(({term,score}) => ({score,label:term.label}))} busyId={evaluationBusy.startsWith('score-')?Number(evaluationBusy.slice(6)):null} onChange={(aptitudeId,score) => void saveEvaluationCapture(aptitudeId,score)} ariaLabel={`Evaluación de ${student.display_name}`} />"""
text = replace_once(text, old, new, "manual interactive radar")
old = """{radarItems.length ? <StudentRadar items={radarItems} /> : <div className={styles.empty}><TrendingUp /><span>Todavía no hay evaluaciones.</span></div>}"""
new = """{radarItems.length ? <EvaluationRadar items={radarItems} scale={evaluationScale.map(({term,score}) => ({score,label:term.label}))} readonly ariaLabel={`Última evaluación de ${student.display_name}`} /> : <div className={styles.empty}><TrendingUp /><span>Todavía no hay evaluaciones.</span></div>}"""
text = replace_once(text, old, new, "readonly shared radar")
path.write_text(text)
