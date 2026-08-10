import fs from "node:fs";

const path = "app/cya-app.tsx";
let source = fs.readFileSync(path, "utf8");

function replaceRequired(from, to, label) {
  if (!source.includes(from)) throw new Error(`Missing pattern: ${label}`);
  source = source.replace(from, to);
}

function replaceBetween(startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Missing start marker: ${label}`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`Missing end marker: ${label}`);
  source = source.slice(0, start) + replacement + source.slice(end);
}

replaceRequired(
`  started_at: string | null; administrative_finished_at: string | null; pedagogy_closed_at: string | null;\n  actual_end_at: string | null; actual_duration_minutes: number | null; billed_duration_minutes: number | null;\n  duration_source: "elapsed" | "manual" | "legacy_scheduled" | null; administratively_finished_by: string | null;`,
`  started_at: string | null; administrative_finished_at: string | null; pedagogy_closed_at: string | null;\n  administratively_finished_by: string | null;`,
"class item duration fields",
);

replaceRequired(
`    duration_minutes: number; actual_duration_minutes?: number | null; billed_duration_minutes?: number | null;\n    billing_status?: string; uncovered_minutes?: number; style: string | null; attendance_status: string; role: string | null; level: string | null;`,
`    duration_minutes: number; billing_status?: string; uncovered_minutes?: number; style: string | null; attendance_status: string; role: string | null; level: string | null;`,
"student portal class duration fields",
);

replaceRequired(
`    : <div className="agenda-list">{classes.map((item) => { const shownDuration = item.status === "finished" ? item.actual_duration_minutes ?? item.duration_minutes : item.duration_minutes; return <article className="agenda-row" key={item.id}>\n        <span className="agenda-icon"><CalendarDays /></span><div><strong>{namesFor(item.class_participants.map((p) => p.person_id), students)}</strong><span>{dateLabel(item.scheduled_start_at)} · {minutesLabel(shownDuration)}{item.status === "finished" && shownDuration !== item.duration_minutes ? \` reales · prevista \${minutesLabel(item.duration_minutes)}\` : ""}</span></div>`,
`    : <div className="agenda-list">{classes.map((item) => <article className="agenda-row" key={item.id}>\n        <span className="agenda-icon"><CalendarDays /></span><div><strong>{namesFor(item.class_participants.map((p) => p.person_id), students)}</strong><span>{dateLabel(item.scheduled_start_at)} · {minutesLabel(item.duration_minutes)}</span></div>`,
"classes list planned duration",
);
replaceRequired(`      </article>; })}</div>}`, `      </article>)}</div>}`, "classes list map close");

const finishModal = `function FinishClassModal({ item, students, credits, close, finished }: { item: ClassItem; students: Person[]; credits: CreditItem[]; close: () => void; finished: () => Promise<void> }) {
  const [attendance, setAttendance] = useState<Record<number, "present" | "absent">>(() => Object.fromEntries(item.class_participants.map((p) => [p.person_id, "present"])) as Record<number, "present" | "absent">);
  const [grantIds, setGrantIds] = useState<Record<number, string>>(() => Object.fromEntries(item.class_participants.map((p) => [p.person_id, p.billing_grant_id ? String(p.billing_grant_id) : ""])));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const plannedDuration = item.duration_minutes;
  function eligibleCredits(personId: number) {
    return credits.filter((grant) => grant.status === "active" && grant.credit_grant_members.some((member) => member.person_id === personId) && creditBalance(grant) > 0);
  }
  function chooseGrant(personId: number, value: string) {
    setGrantIds((current) => {
      const next = { ...current, [personId]: value }, grant = credits.find((credit) => String(credit.id) === value);
      if (grant?.modality === "pair") item.class_participants.forEach((participant) => { if (grant.credit_grant_members.some((member) => member.person_id === participant.person_id)) next[participant.person_id] = value; });
      return next;
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!db) return;
    const personIds = item.class_participants.map((participant) => participant.person_id);
    setBusy(true); setError("");
    const result = await db.rpc("administratively_finish_class", {
      p_class_id: item.id,
      p_person_ids: personIds,
      p_attendance: personIds.map((id) => attendance[id]),
      p_grant_ids: personIds.map((id) => attendance[id] === "present" && grantIds[id] ? Number(grantIds[id]) : null),
    });
    if (result.error) { setError(result.error.message); setBusy(false); return; }
    await finished(); setBusy(false); close();
  }
  return <div className="backdrop"><section className="modal finish-modal" role="dialog" aria-modal="true">
    <header className="modal-head"><div><p className="eyebrow">Parte administrativa</p><h2>Terminar clase</h2></div><button className="icon-btn" onClick={close} aria-label="Cerrar"><X /></button></header>
    <form className="modal-body" onSubmit={submit}>
      <section className="card pad"><div className="card-head"><div><p className="eyebrow">Duración</p><h2>Duración prevista</h2></div><strong>{minutesLabel(plannedDuration)}</strong></div><p className="modal-intro">El saldo se calculará con la duración prevista de la clase.</p></section>
      <div className="finish-list">{item.class_participants.map((participant) => {
        const student = students.find((person) => person.id === participant.person_id), available = eligibleCredits(participant.person_id);
        return <section className="finish-person" key={participant.person_id}><strong>{student?.display_name || "Alumno"}</strong><div className="finish-grid">
          <label className="field"><span>Asistencia</span><select value={attendance[participant.person_id]} onChange={(e) => { const value = e.target.value as "present" | "absent"; setAttendance((current) => ({ ...current, [participant.person_id]: value })); if (value === "absent") setGrantIds((current) => ({ ...current, [participant.person_id]: "" })); }}><option value="present">Ha venido</option><option value="absent">No ha venido</option></select></label>
          <label className="field"><span>Bono</span><select value={grantIds[participant.person_id] || ""} disabled={attendance[participant.person_id] === "absent"} onChange={(e) => chooseGrant(participant.person_id, e.target.value)}><option value="">Sin bono · {minutesLabel(plannedDuration)} pendientes</option>{available.map((grant) => { const balance = creditBalance(grant), shortfall = Math.max(0, plannedDuration - balance); return <option key={grant.id} value={grant.id}>{grant.label || (grant.modality === "pair" ? "Bono pareja" : "Bono individual")} · {minutesLabel(balance)}{shortfall ? \` · faltarán \${minutesLabel(shortfall)}\` : ""}</option>; })}</select></label>
        </div>{attendance[participant.person_id] === "present" && grantIds[participant.person_id] ? (() => { const selected = credits.find((grant) => String(grant.id) === grantIds[participant.person_id]); const remaining = selected ? Math.max(0, plannedDuration - creditBalance(selected)) : plannedDuration; return remaining ? <p className="modal-intro">Se consumirá el saldo disponible y quedarán {minutesLabel(remaining)} como incidencia.</p> : null; })() : attendance[participant.person_id] === "present" ? <p className="modal-intro">La clase quedará pendiente íntegramente como incidencia hasta que la regularices o decidas aceptarla sin regularizar.</p> : null}</section>;
      })}</div>
      {error ? <p className="error">{error}</p> : null}<div className="actions"><button className="btn ghost" type="button" onClick={close}>Seguir en clase</button><button className="btn" disabled={busy}><CheckCircle2 size={17} /> {busy ? "Terminando…" : "Terminar clase"}</button></div>
    </form>
  </section></div>;
}

`;
replaceBetween("function FinishClassModal(", "function LiveSession(", finishModal, "finish class modal");

replaceRequired(`  const [clockNow, setClockNow] = useState(() => Date.now());\n`, "", "live clock state");
replaceRequired(`  useEffect(() => { if (item.status !== "active") return; const timer = window.setInterval(() => setClockNow(Date.now()), 1000); return () => clearInterval(timer); }, [item.status]);\n`, "", "live clock effect");
replaceRequired(
`  const names = namesFor(item.class_participants.map((p) => p.person_id), students), finished = item.status === "finished";\n  const shownDuration = finished ? item.actual_duration_minutes ?? item.duration_minutes : item.duration_minutes;\n  const observationStart = new Date(item.started_at ?? item.scheduled_start_at).getTime();\n  const observationRemaining = item.status === "active" ? Math.min(180, Math.max(0, 180 - Math.floor((clockNow - observationStart) / 1000))) : 0;\n  const observationActive = item.status === "active" && observationRemaining > 0;\n  const observationClock = \`${"${Math.floor(observationRemaining / 60)}"}:\${String(observationRemaining % 60).padStart(2, "0")}\`;`,
`  const names = namesFor(item.class_participants.map((p) => p.person_id), students), finished = item.status === "finished";`,
"live elapsed calculations",
);
replaceRequired(
`<small>{style?.label || "Sin estilo"} · {minutesLabel(shownDuration)}{finished && shownDuration !== item.duration_minutes ? \` reales · prevista \${minutesLabel(item.duration_minutes)}\` : ""}</small>`,
`<small>{style?.label || "Sin estilo"} · {minutesLabel(item.duration_minutes)}</small>`,
"live title duration",
);
replaceRequired(
`      <section className={\`observation-phase \${observationActive ? "active" : "complete"}\`} aria-live="polite"><span className="observation-icon"><Clock3 /></span><div><p className="eyebrow">Observación inicial</p><strong>{observationActive ? "Escucha, observa y captura lo importante" : "Primera observación completada"}</strong><span>{observationActive ? "Tienes tres minutos desde el inicio real de la clase. Usa las notas rápidas y convierte lo necesario en corrección." : "Continúa con correcciones, evaluación y la guía de hoy."}</span></div><time dateTime={\`PT\${observationRemaining}S\`}>{observationActive ? observationClock : <CheckCircle2 />}</time></section>\n`,
"",
"observation timer section",
);
replaceRequired(
`notify("Clase terminada. Duración, saldo e incidencias ya están actualizados.");`,
`notify("Clase terminada. Saldo e incidencias actualizados con la duración prevista.");`,
"finish notification",
);

replaceRequired(
`{snapshot.classes.slice(0, 8).map((item) => { const shown = item.status === "finished" ? item.actual_duration_minutes ?? item.duration_minutes : item.duration_minutes; const billingNote = item.billing_status === "accepted_uncovered" && item.uncovered_minutes ? \` · aceptado sin regularizar \${minutesLabel(item.uncovered_minutes)}\` : item.uncovered_minutes ? \` · pendiente \${minutesLabel(item.uncovered_minutes)}\` : ""; return <div key={item.id}><CalendarDays /><div><strong>{item.style || (item.class_type === "pair" ? "Clase en pareja" : "Clase individual")}</strong><span>{dateLabel(item.scheduled_start_at)} · {minutesLabel(shown)}{billingNote}</span></div><span className={\`badge \${item.status === "finished" ? "portal" : ""}\`}>{portalClassStatus(item.status)}</span></div>; })}`,
`{snapshot.classes.slice(0, 8).map((item) => { const billingNote = item.billing_status === "accepted_uncovered" && item.uncovered_minutes ? \` · aceptado sin regularizar \${minutesLabel(item.uncovered_minutes)}\` : item.uncovered_minutes ? \` · pendiente \${minutesLabel(item.uncovered_minutes)}\` : ""; return <div key={item.id}><CalendarDays /><div><strong>{item.style || (item.class_type === "pair" ? "Clase en pareja" : "Clase individual")}</strong><span>{dateLabel(item.scheduled_start_at)} · {minutesLabel(item.duration_minutes)}{billingNote}</span></div><span className={\`badge \${item.status === "finished" ? "portal" : ""}\`}>{portalClassStatus(item.status)}</span></div>; })}`,
"student portal planned duration",
);

replaceRequired(
`db.from("classes").select("id,class_type,status,scheduled_start_at,duration_minutes,notes,style_term_id,location_term_id,started_at,administrative_finished_at,pedagogy_closed_at,actual_end_at,actual_duration_minutes,billed_duration_minutes,duration_source,administratively_finished_by,class_participants(person_id,attendance_status,billing_grant_id,role_term_id,level_term_id,billed_minutes,uncovered_minutes,billing_status)")`,
`db.from("classes").select("id,class_type,status,scheduled_start_at,duration_minutes,notes,style_term_id,location_term_id,started_at,administrative_finished_at,pedagogy_closed_at,administratively_finished_by,class_participants(person_id,attendance_status,billing_grant_id,role_term_id,level_term_id,billed_minutes,uncovered_minutes,billing_status)")`,
"operations select",
);

fs.writeFileSync(path, source);
