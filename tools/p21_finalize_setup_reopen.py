from pathlib import Path
import re

APP = Path('app/cya-app.tsx')
TEST = Path('tests/p21-dar-clase.test.mjs')
DOC = Path('docs/P21_DAR_CLASE_RECONCILIACION.md')

app = APP.read_text()
tests = TEST.read_text()
doc = DOC.read_text()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    return text.replace(old, new, 1)


# P21.3 — real progressive setup, not just explanatory copy.
app = replace_once(
    app,
    '  const [danceProfiles,setDanceProfiles] = useState<DanceProfileRow[]>([]), [busy,setBusy] = useState(false), [error,setError] = useState("");',
    '  const [danceProfiles,setDanceProfiles] = useState<DanceProfileRow[]>([]), [busy,setBusy] = useState(false), [error,setError] = useState(""), [editKnown,setEditKnown] = useState(false);',
    'P21.3 add progressive setup state',
)

app = replace_once(
    app,
    '<p className="modal-intro">Después confirmarás fecha, duración, estilo, rol, nivel, lugar y bono antes de empezar a bailar.</p>',
    '<p className="modal-intro">CYA reutilizará fecha, duración y el contexto de baile que ya conozca. Después solo te pedirá lo que realmente falte.</p>',
    'P21.3 manual draft canonical reuse copy',
)

setup_pattern = re.compile(
    r'''  const pairAvailable = item\.class_type === "pair" && personIds\[0\] \? compatibleCreditsForClass\(item,credits,personIds\[0\]\) : \[\];.*?\n  </div>;\n}\n\nfunction ClassPreparationStage''',
    re.S,
)
setup_replacement = '''  const pairAvailable = item.class_type === "pair" && personIds[0] ? compatibleCreditsForClass(item,credits,personIds[0]) : [];
  const setupDuration=Number(hoursText || 0)*60+Number(minutesText || 0);
  const classMissing=!scheduledText || !styleId || setupDuration<1 || setupDuration>480;
  const missingContextIds=personIds.filter((personId) => !roles[personId] || !levels[personId]);
  const showClassFields=editKnown || classMissing;
  const selectedStyle=styles.find((term) => String(term.id)===styleId);
  const selectedGrantFor=(personId:number) => credits.find((grant) => grant.id===Number(grants[personId] || 0));
  const pairSelectedGrant=personIds[0] ? selectedGrantFor(personIds[0]) : undefined;
  return <div className="class-workflow-page"><header className="workflow-head"><button className="icon-btn" onClick={back} aria-label="Volver al centro de clases">‹</button><div><p className="eyebrow">1 · Datos</p><h1>{namesFor(personIds,students)}</h1><p>{classMissing || missingContextIds.length ? "Completa únicamente los datos pendientes." : "CYA ya tiene los datos necesarios para preparar esta clase."}</p></div><button className="btn ghost workflow-edit-data" onClick={() => setEditKnown((current) => !current)}>{editKnown ? "Ocultar edición" : "Editar datos"}</button></header><div className="workflow-stepbar"><span className="active">Datos</span><span>Preparar</span><span>Dar clase</span><span>Resumen</span></div>
    <section className="card pad workflow-card"><div className="card-head"><h2>Clase</h2><span>{item.class_type === "pair" ? "Pareja" : "Individual"}</span></div>{showClassFields ? <div className="fields-2"><label className="field field-wide"><span>Fecha y hora</span><input type="datetime-local" value={scheduledText} onChange={(event) => setScheduledText(event.target.value)} /></label><label className="field"><span>Horas</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={hoursText} onChange={(event) => setHoursText(event.target.value.replace(/\\D/g,""))} /></label><label className="field"><span>Minutos</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={minutesText} onChange={(event) => setMinutesText(event.target.value.replace(/\\D/g,""))} /></label><label className="field"><span>Estilo</span><select value={styleId} onChange={(event) => setStyleId(event.target.value)}><option value="">Seleccionar</option>{styles.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label><label className="field"><span>Lugar</span><input value={locationText} onChange={(event) => setLocationText(event.target.value)} placeholder="Opcional" /></label></div> : <div className="prepare-list setup-known-list"><span><strong>Fecha</strong>{dateLabel(scheduledText)}</span><span><strong>Duración</strong>{minutesLabel(setupDuration)}</span><span><strong>Estilo</strong>{selectedStyle?.label || "Pendiente"}</span>{locationText ? <span><strong>Lugar</strong>{locationText}</span> : null}</div>}{item.notes ? <p className="workflow-known-note"><strong>Programación</strong>{item.notes}</p> : null}</section>
    <section className="workflow-people">{item.class_participants.map((participant) => { const student=students.find((person) => person.id===participant.person_id), roleValue=roles[participant.person_id] || "", levelValue=levels[participant.person_id] || "", showContextFields=editKnown || !roleValue || !levelValue, roleLabelValue=roleTerms.find((term) => String(term.id)===roleValue)?.label || "Rol pendiente", levelLabelValue=levelTerms.find((term) => String(term.id)===levelValue)?.label || "Nivel pendiente", selectedGrant=selectedGrantFor(participant.person_id); return <article className="card pad workflow-card" key={participant.person_id}><div className="prepare-summary"><span className="avatar"><UserRound /></span><div><strong>{student?.display_name || "Alumno"}</strong><span>{showContextFields ? "Completa su contexto de baile" : "Contexto ya conocido"}</span></div></div>{showContextFields ? <div className="fields-2 workflow-context-fields"><label className="field"><span>Rol</span><select value={roleValue} onChange={(event) => setRoles((current) => ({...current,[participant.person_id]:event.target.value}))}><option value="">Seleccionar</option>{roleTerms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label><label className="field"><span>Nivel</span><select value={levelValue} onChange={(event) => setLevels((current) => ({...current,[participant.person_id]:event.target.value}))}><option value="">Seleccionar</option>{levelTerms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label></div> : <div className="prepare-info setup-known-context"><strong>Contexto</strong><p>{roleLabelValue} · {levelLabelValue}</p></div>}{item.class_type === "individual" ? editKnown ? <label className="field workflow-credit"><span>Bono previsto</span><select value={grants[participant.person_id] || ""} onChange={(event) => setGrant(participant.person_id,event.target.value)}><option value="">Decidir al terminar</option>{compatibleCreditsForClass(item,credits,participant.person_id).map((grant) => <option key={grant.id} value={grant.id}>{grant.label || "Bono individual"} · {minutesLabel(creditBalance(grant))}</option>)}</select></label> : <div className="prepare-info setup-known-credit"><strong>Bono previsto</strong><p>{selectedGrant ? `${selectedGrant.label || "Bono individual"} · ${minutesLabel(creditBalance(selectedGrant))}` : "Se decidirá al terminar"}</p></div> : null}</article>; })}</section>
    {item.class_type === "pair" ? <section className="card pad workflow-card"><div className="card-head"><h2>Bono previsto</h2><span>Opcional</span></div>{editKnown ? <label className="field"><span>Bono de pareja</span><select value={grants[personIds[0]] || ""} onChange={(event) => setGrant(personIds[0],event.target.value)}><option value="">Decidir al terminar</option>{pairAvailable.map((grant) => <option key={grant.id} value={grant.id}>{grant.label || "Bono de pareja"} · {minutesLabel(creditBalance(grant))}</option>)}</select></label> : <div className="prepare-info setup-known-credit"><strong>Bono de pareja</strong><p>{pairSelectedGrant ? `${pairSelectedGrant.label || "Bono de pareja"} · ${minutesLabel(creditBalance(pairSelectedGrant))}` : "Se decidirá al terminar"}</p></div>}</section> : null}
    {error ? <p className="error">{error}</p> : null}<div className="workflow-footer"><button className="btn ghost" onClick={back}>Volver</button><button className="btn" onClick={() => void save()} disabled={busy}>{busy ? "Guardando…" : <>{classMissing || missingContextIds.length ? "Completar y preparar" : "Todo listo · Preparar clase"} <ArrowRight /></>}</button></div>
  </div>;
}

function ClassPreparationStage'''
app, setup_count = setup_pattern.subn(lambda _match: setup_replacement, app, count=1)
if setup_count != 1:
    raise SystemExit(f'P21.3 progressive setup render: expected 1 match, got {setup_count}')

# P21.4 — destructive reopen requires two contextual confirmations.
old_reopen = '''  async function reopenClass(id: number) {
    if (!db || !window.confirm("¿Reabrir esta clase? Se deshará su cierre administrativo, incluidos consumos, regularizaciones, transferencias, suplementos y pagos registrados en ese cierre.")) return;
    const result = await db.rpc("reopen_administratively_finished_class", { p_class_id: id });
    if (result.error) { setToast(result.error.message); return; }
    await loadOperations();
    setToast("Clase reabierta. Puedes corregirla y volver a terminarla.");
    goLive(id);
  }
'''
new_reopen = '''  async function reopenClass(id: number) {
    if (!db) return;
    const targetClass=classes.find((item) => item.id===id);
    const targetLabel=targetClass ? `${dateLabel(targetClass.scheduled_start_at)} · ${namesFor(targetClass.class_participants.map((participant) => participant.person_id),students)}` : `clase ${id}`;
    if (!window.confirm(`¿Reabrir ${targetLabel}? Se deshará su cierre administrativo, incluidos consumos, regularizaciones, transferencias, suplementos y pagos registrados en ese cierre.`)) return;
    if (!window.confirm(`Confirmación final: reabrir ${targetLabel} revertirá los movimientos financieros de ese cierre. Tendrás que terminar la clase de nuevo.`)) return;
    const result = await db.rpc("reopen_administratively_finished_class", { p_class_id: id });
    if (result.error) { setToast(result.error.message); return; }
    await loadOperations();
    setToast("Clase reabierta. Puedes corregirla y volver a terminarla.");
    goLive(id);
  }
'''
app = replace_once(app, old_reopen, new_reopen, 'P21.4 contextual double reopen confirmation')

# Persist robust regressions only once.
if "P21.3 setup progressively hides known values" not in tests:
    tests += '''\n\ntest('P21.3 setup progressively hides known values and asks only for missing context', () => {\n  const setup = sliceBetween(app, 'function ClassSetupStage(', 'function ClassPreparationStage(');\n  assert.match(setup, /editKnown/);\n  assert.match(setup, /const showClassFields=editKnown \\|\\| classMissing/);\n  assert.match(setup, /showContextFields=editKnown \\|\\| !roleValue \\|\\| !levelValue/);\n  assert.match(setup, /CYA ya tiene los datos necesarios para preparar esta clase/);\n  assert.match(setup, /Completa únicamente los datos pendientes/);\n  assert.match(setup, /Todo listo · Preparar clase/);\n  assert.match(setup, /Se decidirá al terminar/);\n});\n\ntest('P21.3 manual class draft explains canonical reuse instead of re-asking everything', () => {\n  const draft = sliceBetween(app, 'function ManualClassDraft(', 'function ClassSetupStage(');\n  assert.match(draft, /CYA reutilizará fecha, duración y el contexto de baile que ya conozca/);\n  assert.doesNotMatch(draft, /Después confirmarás fecha, duración, estilo, rol, nivel, lugar y bono/);\n});\n\ntest('P21.4 reopening a class requires two contextual confirmations before the RPC', () => {\n  const reopen = sliceBetween(app, 'async function reopenClass(id: number) {', 'function goTarget(');\n  assert.equal((reopen.match(/window\\.confirm/g) || []).length, 2);\n  assert.match(reopen, /targetLabel/);\n  assert.match(reopen, /consumos, regularizaciones, transferencias, suplementos y pagos/);\n  assert.match(reopen, /Confirmación final: reabrir/);\n  const secondConfirmation = reopen.indexOf('Confirmación final: reabrir');\n  const rpc = reopen.indexOf('reopen_administratively_finished_class');\n  assert.ok(secondConfirmation > 0 && rpc > secondConfirmation);\n});\n'''

if '## 9. P21.3 — setup progresivo real G7' not in doc:
    doc += '''\n\n## 9. P21.3 — setup progresivo real G7\n\n- fecha, duración y estilo conocidos se muestran compactos y no como preguntas obligatorias;\n- rol y nivel solo muestran selector si falta alguno, salvo que el profesor pulse `Editar datos`;\n- el bono previsto sigue siendo opcional y puede decidirse al terminar;\n- la creación manual explica que CYA reutilizará el contexto canónico ya conocido;\n- `Editar datos` permite cambiar voluntariamente cualquier valor heredado.\n\n## 10. P21.4 — protección de reapertura G6\n\n- la reapertura conserva la RPC transaccional existente;\n- antes de ejecutarla exige dos confirmaciones;\n- ambas incluyen fecha/alumnado de la clase para evitar confirmar la clase equivocada;\n- la segunda advierte explícitamente que se revierten los movimientos financieros del cierre.\n'''

APP.write_text(app)
TEST.write_text(tests)
DOC.write_text(doc)
print('P21.3 + P21.4 finalization applied safely')
