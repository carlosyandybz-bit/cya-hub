from pathlib import Path
import re

app_path=Path('app/cya-app.tsx')
test_path=Path('tests/p21-dar-clase.test.mjs')
doc_path=Path('docs/P21_DAR_CLASE_RECONCILIACION.md')
app=app_path.read_text()
test=test_path.read_text()
doc=doc_path.read_text()

def replace_once(text,old,new,label):
    count=text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    return text.replace(old,new,1)

app=replace_once(
    app,
    '  const [danceProfiles,setDanceProfiles] = useState<DanceProfileRow[]>([]), [busy,setBusy] = useState(false), [error,setError] = useState("");',
    '  const [danceProfiles,setDanceProfiles] = useState<DanceProfileRow[]>([]), [busy,setBusy] = useState(false), [error,setError] = useState(""), [editKnown,setEditKnown] = useState(false);',
    'add progressive setup state',
)

app=replace_once(
    app,
    '<p className="modal-intro">Después confirmarás fecha, duración, estilo, rol, nivel, lugar y bono antes de empezar a bailar.</p>',
    '<p className="modal-intro">CYA reutilizará fecha, duración y el contexto de baile que ya conozca. Después solo te pedirá lo que realmente falte.</p>',
    'manual draft progressive copy',
)

pattern=re.compile(r'''  const pairAvailable = item\.class_type === "pair".*?\n  </div>;\n}\n\nfunction ClassPreparationStage''',re.S)
replacement='''  const pairAvailable = item.class_type === "pair" && personIds[0] ? compatibleCreditsForClass(item,credits,personIds[0]) : [];
  const setupDuration=Number(hoursText || 0)*60+Number(minutesText || 0);
  const classMissing=!scheduledText || !styleId || setupDuration<1 || setupDuration>480;
  const missingContextIds=personIds.filter((personId) => !roles[personId] || !levels[personId]);
  const showClassFields=editKnown || classMissing;
  const selectedStyle=styles.find((term) => String(term.id)===styleId);
  const selectedGrantFor=(personId:number) => credits.find((grant) => grant.id===Number(grants[personId] || 0));
  return <div className="class-workflow-page"><header className="workflow-head"><button className="icon-btn" onClick={back} aria-label="Volver al centro de clases">‹</button><div><p className="eyebrow">1 · Datos</p><h1>{namesFor(personIds,students)}</h1><p>{classMissing || missingContextIds.length ? "Completa únicamente los datos pendientes." : "CYA ya tiene los datos necesarios para preparar esta clase."}</p></div><button className="btn ghost workflow-edit-data" onClick={() => setEditKnown((current) => !current)}>{editKnown ? "Ocultar edición" : "Editar datos"}</button></header><div className="workflow-stepbar"><span className="active">Datos</span><span>Preparar</span><span>Dar clase</span><span>Resumen</span></div>
    <section className="card pad workflow-card"><div className="card-head"><h2>Clase</h2><span>{item.class_type === "pair" ? "Pareja" : "Individual"}</span></div>{showClassFields ? <div className="fields-2"><label className="field field-wide"><span>Fecha y hora</span><input type="datetime-local" value={scheduledText} onChange={(event) => setScheduledText(event.target.value)} /></label><label className="field"><span>Horas</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={hoursText} onChange={(event) => setHoursText(event.target.value.replace(/\\D/g,""))} /></label><label className="field"><span>Minutos</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={minutesText} onChange={(event) => setMinutesText(event.target.value.replace(/\\D/g,""))} /></label><label className="field"><span>Estilo</span><select value={styleId} onChange={(event) => setStyleId(event.target.value)}><option value="">Seleccionar</option>{styles.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label><label className="field"><span>Lugar</span><input value={locationText} onChange={(event) => setLocationText(event.target.value)} placeholder="Opcional" /></label></div> : <div className="prepare-list setup-known-list"><span><strong>Fecha</strong>{dateLabel(scheduledText)}</span><span><strong>Duración</strong>{minutesLabel(setupDuration)}</span><span><strong>Estilo</strong>{selectedStyle?.label || "Pendiente"}</span>{locationText ? <span><strong>Lugar</strong>{locationText}</span> : null}</div>}{item.notes ? <p className="workflow-known-note"><strong>Programación</strong>{item.notes}</p> : null}</section>
    <section className="workflow-people">{item.class_participants.map((participant) => { const student=students.find((person) => person.id===participant.person_id), roleValue=roles[participant.person_id] || "", levelValue=levels[participant.person_id] || "", showContextFields=editKnown || !roleValue || !levelValue, roleLabelValue=roleTerms.find((term) => String(term.id)===roleValue)?.label || "Rol pendiente", levelLabelValue=levelTerms.find((term) => String(term.id)===levelValue)?.label || "Nivel pendiente", selectedGrant=selectedGrantFor(participant.person_id); return <article className="card pad workflow-card" key={participant.person_id}><div className="prepare-summary"><span className="avatar"><UserRound /></span><div><strong>{student?.display_name || "Alumno"}</strong><span>{showContextFields ? "Completa su contexto de baile" : "Contexto ya conocido"}</span></div></div>{showContextFields ? <div className="fields-2 workflow-context-fields"><label className="field"><span>Rol</span><select value={roleValue} onChange={(event) => setRoles((current) => ({...current,[participant.person_id]:event.target.value}))}><option value="">Seleccionar</option>{roleTerms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label><label className="field"><span>Nivel</span><select value={levelValue} onChange={(event) => setLevels((current) => ({...current,[participant.person_id]:event.target.value}))}><option value="">Seleccionar</option>{levelTerms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label></div> : <div className="prepare-info setup-known-context"><strong>Contexto</strong><p>{roleLabelValue} · {levelLabelValue}</p></div>}{item.class_type === "individual" ? editKnown ? <label className="field workflow-credit"><span>Bono previsto</span><select value={grants[participant.person_id] || ""} onChange={(event) => setGrant(participant.person_id,event.target.value)}><option value="">Decidir al terminar</option>{compatibleCreditsForClass(item,credits,participant.person_id).map((grant) => <option key={grant.id} value={grant.id}>{grant.label || "Bono individual"} · {minutesLabel(creditBalance(grant))}</option>)}</select></label> : <div className="prepare-info setup-known-credit"><strong>Bono previsto</strong><p>{selectedGrant ? `${selectedGrant.label || "Bono individual"} · ${minutesLabel(creditBalance(selectedGrant))}` : "Se decidirá al terminar"}</p></div> : null}</article>; })}</section>
    {item.class_type === "pair" ? <section className="card pad workflow-card"><div className="card-head"><h2>Bono previsto</h2><span>Opcional</span></div>{editKnown ? <label className="field"><span>Bono de pareja</span><select value={grants[personIds[0]] || ""} onChange={(event) => setGrant(personIds[0],event.target.value)}><option value="">Decidir al terminar</option>{pairAvailable.map((grant) => <option key={grant.id} value={grant.id}>{grant.label || "Bono de pareja"} · {minutesLabel(creditBalance(grant))}</option>)}</select></label> : <div className="prepare-info setup-known-credit"><strong>Bono de pareja</strong><p>{selectedGrantFor(personIds[0]) ? `${selectedGrantFor(personIds[0])?.label || "Bono de pareja"} · ${minutesLabel(creditBalance(selectedGrantFor(personIds[0])!))}` : "Se decidirá al terminar"}</p></div>}</section> : null}
    {error ? <p className="error">{error}</p> : null}<div className="workflow-footer"><button className="btn ghost" onClick={back}>Volver</button><button className="btn" onClick={() => void save()} disabled={busy}>{busy ? "Guardando…" : <>{classMissing || missingContextIds.length ? "Completar y preparar" : "Todo listo · Preparar clase"} <ArrowRight /></>}</button></div>
  </div>;
}

function ClassPreparationStage'''
app,count=pattern.subn(replacement,app,count=1)
if count != 1:
    raise SystemExit(f'progressive setup render: expected 1 match, got {count}')

test += '''\n\ntest('P21.3 setup only asks for missing data and keeps known values compact', () => {\n  const setup = sliceBetween(app, 'function ClassSetupStage(', 'function ClassPreparationStage(');\n  assert.match(setup, /editKnown/);\n  assert.match(setup, /CYA ya tiene los datos necesarios/);\n  assert.match(setup, /Completa únicamente los datos pendientes/);\n  assert.match(setup, /showContextFields=editKnown \|\| !roleValue \|\| !levelValue/);\n  assert.match(setup, /Todo listo · Preparar clase/);\n  assert.match(setup, /Se decidirá al terminar/);\n});\n\ntest('P21.3 manual class creation promises canonical reuse instead of re-asking everything', () => {\n  const draft = sliceBetween(app, 'function ManualClassDraft(', 'function ClassSetupStage(');\n  assert.match(draft, /CYA reutilizará fecha, duración y el contexto de baile que ya conozca/);\n  assert.doesNotMatch(draft, /Después confirmarás fecha, duración, estilo, rol, nivel, lugar y bono/);\n});\n'''

doc += '''\n\n## 9. P21.3 — setup progresivo G7\n\n- fecha, duración, estilo, rol y nivel heredados ya no se presentan como preguntas si están completos;\n- los datos conocidos se muestran en un resumen compacto;\n- solo los huecos obligatorios abren controles automáticamente;\n- `Editar datos` permite modificar voluntariamente todo el contexto;\n- el bono es una previsión opcional y puede decidirse al terminar;\n- la clase manual explica que CYA reutilizará datos conocidos en vez de pedirlos otra vez.\n'''

app_path.write_text(app)
test_path.write_text(test)
doc_path.write_text(doc)
print('P21.3 progressive setup applied')
