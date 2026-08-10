from pathlib import Path

path = Path('app/cya-app.tsx')
text = path.read_text()

def once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    text = text.replace(old, new, 1)

once(
'''  const [quickType, setQuickType] = useState<"correction" | "explanation" | "exercise" | "sequence">("correction"), [quickTitle, setQuickTitle] = useState("");''',
'''  const [quickType, setQuickType] = useState<"explanation" | "exercise" | "sequence">("explanation"), [quickTitle, setQuickTitle] = useState("");''',
'quick type'
)

once(
'''  const personAssignments = assignments.filter((assignment) => assignment.person_id === activePersonId);''',
'''  const personAssignments = assignments
    .filter((assignment) => assignment.person_id === activePersonId)
    .filter((assignment, index, rows) => rows.findIndex((candidate) => candidate.content_id === assignment.content_id) === index);''',
'dedupe person assignments'
)

old_branch = '''    if (quickType === "correction") {
      const result = await db.rpc("create_class_correction", {
        p_class_id: item.id,
        p_person_id: participant.person_id,
        p_title: quickTitle.trim(),
        p_measurement_mode: "both",
        p_frequency: 50,
        p_importance: 50,
      });
      if (result.error) notify(result.error.message);
      else { setQuickTitle(""); await loadLive(); await refresh(); notify("Corrección rápida añadida al alumno."); }
      setBusy("");
      return;
    }
'''
once(old_branch, '', 'duplicate quick correction branch')

once(
'''<select value={quickType} onChange={(event) => setQuickType(event.target.value as typeof quickType)}><option value="correction">Corrección</option><option value="explanation">Explicación</option><option value="exercise">Ejercicio</option><option value="sequence">Secuencia</option></select>''',
'''<select value={quickType} onChange={(event) => setQuickType(event.target.value as typeof quickType)}><option value="explanation">Explicación</option><option value="exercise">Ejercicio</option><option value="sequence">Secuencia</option></select>''',
'quick create options'
)

once(
'''<small>{quickType === "correction" ? "Se añade al alumno con medición inicial 50/50." : "Queda en Incompletas, vinculada al contexto actual, para terminarla después."}</small>''',
'''<small>Queda en Incompletas, vinculada al contexto actual, para terminarla después.</small>''',
'quick create helper'
)

once(
'''<section className="student-context card"><div className="student-context-main"><span className="avatar"><CircleUserRound /></span><div><p className="eyebrow">Alumno</p><h2>{student?.display_name || "Alumno"}</h2><p>{student?.auth_user_id ? "Con acceso al portal" : "Provisional · trabaja igual que cualquier alumno"}</p></div></div>''',
'''<section className="student-context card"><div className="student-context-main"><span className="avatar"><CircleUserRound /></span><div><p className="eyebrow">Alumno</p><h2>{student?.display_name || "Alumno"}</h2></div></div>''',
'student context status noise'
)

once(
'''            subtitle={`${correctionStateLabel(assignment.assignment_status)}${assignment.current_frequency !== null ? ` · Frec. ${assignment.current_frequency}` : ""}${assignment.current_importance !== null ? ` · Importancia ${assignment.current_importance}` : ""}`}''',
'''            subtitle={[assignment.current_frequency !== null ? `Frec. ${assignment.current_frequency}` : "", assignment.current_importance !== null ? `Importancia ${assignment.current_importance}` : ""].filter(Boolean).join(" · ") || null}''',
'duplicate correction status'
)

old_bottom = '''      <section className={`live-bottom ${finished ? "finished" : ""}`}><div><strong>{finished ? "Parte administrativa lista" : "Cuando acabéis de bailar…"}</strong><span>{finished ? "Puedes terminar notas, evaluación y correcciones antes del cierre pedagógico." : "Duración, bono y cobro se confirman juntos antes de cerrar."}</span></div>{finished ? <button className="btn" onClick={closePedagogy} disabled={busy === "close"}><CheckCircle2 size={18} /> Cerrar clase</button> : <button className="btn" onClick={() => setFinishOpen(true)}>Terminar clase</button>}</section>
'''
once(old_bottom, '', 'duplicate bottom close action')

path.write_text(text)
print('Point 9 live dedup patch applied')
