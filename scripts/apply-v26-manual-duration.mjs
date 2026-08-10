import fs from "node:fs";

const path = "app/cya-app.tsx";
const source = fs.readFileSync(path, "utf8");
const start = source.indexOf("function FinishClassModal(");
const end = source.indexOf("\nfunction LiveSession(", start);
if (start < 0 || end < 0) throw new Error("FinishClassModal block not found");

const replacement = `function FinishClassModal({ item, students, credits, close, finished }: { item: ClassItem; students: Person[]; credits: CreditItem[]; close: () => void; finished: () => Promise<void> }) {
  const [attendance, setAttendance] = useState<Record<number, "present" | "absent">>(() => Object.fromEntries(item.class_participants.map((p) => [p.person_id, "present"])) as Record<number, "present" | "absent">);
  const [grantIds, setGrantIds] = useState<Record<number, string>>(() => Object.fromEntries(item.class_participants.map((p) => [p.person_id, p.billing_grant_id ? String(p.billing_grant_id) : ""])));
  const [manualDuration, setManualDuration] = useState(item.duration_minutes);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const plannedDuration = item.duration_minutes;
  const durationHours = Math.floor(manualDuration / 60), durationMinutes = manualDuration % 60;
  function setDurationParts(hours: number, minutes: number) {
    setManualDuration(Math.max(0, Math.min(480, Math.max(0, hours) * 60 + Math.max(0, Math.min(59, minutes)))));
  }
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
    if (manualDuration <= 0 || manualDuration > 480) return setError("La duración debe estar entre 1 minuto y 8 horas.");
    const personIds = item.class_participants.map((participant) => participant.person_id);
    setBusy(true); setError("");
    const result = await db.rpc("administratively_finish_class_v2", {
      p_class_id: item.id,
      p_person_ids: personIds,
      p_attendance: personIds.map((id) => attendance[id]),
      p_grant_ids: personIds.map((id) => attendance[id] === "present" && grantIds[id] ? Number(grantIds[id]) : null),
      p_actual_duration_minutes: manualDuration,
    });
    if (result.error) { setError(result.error.message); setBusy(false); return; }
    await finished(); setBusy(false); close();
  }
  return <div className="backdrop"><section className="modal finish-modal" role="dialog" aria-modal="true">
    <header className="modal-head"><div><p className="eyebrow">Parte administrativa</p><h2>Terminar clase</h2></div><button className="icon-btn" onClick={close} aria-label="Cerrar"><X /></button></header>
    <form className="modal-body" onSubmit={submit}>
      <section className="card pad"><div className="card-head"><div><p className="eyebrow">Duración</p><h2>Duración de la clase</h2></div><span className="badge">Programada · {minutesLabel(plannedDuration)}</span></div><div className="fields-2"><label className="field"><span>Horas</span><input type="number" min="0" max="8" value={durationHours} onChange={(event) => setDurationParts(Number(event.target.value || 0), durationMinutes)} /></label><label className="field"><span>Minutos</span><input type="number" min="0" max="59" value={durationMinutes} onChange={(event) => setDurationParts(durationHours, Number(event.target.value || 0))} /></label></div><p className="modal-intro">{manualDuration === plannedDuration ? `Se usarán ${minutesLabel(manualDuration)}.` : `Se usarán ${minutesLabel(manualDuration)} en saldo, incidencias e historial.`}</p></section>
      <div className="finish-list">{item.class_participants.map((participant) => {
        const student = students.find((person) => person.id === participant.person_id), available = eligibleCredits(participant.person_id);
        return <section className="finish-person" key={participant.person_id}><strong>{student?.display_name || "Alumno"}</strong><div className="finish-grid">
          <label className="field"><span>Asistencia</span><select value={attendance[participant.person_id]} onChange={(e) => { const value = e.target.value as "present" | "absent"; setAttendance((current) => ({ ...current, [participant.person_id]: value })); if (value === "absent") setGrantIds((current) => ({ ...current, [participant.person_id]: "" })); }}><option value="present">Ha venido</option><option value="absent">No ha venido</option></select></label>
          <label className="field"><span>Bono</span><select value={grantIds[participant.person_id] || ""} disabled={attendance[participant.person_id] === "absent"} onChange={(e) => chooseGrant(participant.person_id, e.target.value)}><option value="">Sin bono · {minutesLabel(manualDuration)} pendientes</option>{available.map((grant) => { const balance = creditBalance(grant), shortfall = Math.max(0, manualDuration - balance); return <option key={grant.id} value={grant.id}>{grant.label || (grant.modality === "pair" ? "Bono pareja" : "Bono individual")} · {minutesLabel(balance)}{shortfall ? ` · faltarán ${minutesLabel(shortfall)}` : ""}</option>; })}</select></label>
        </div>{attendance[participant.person_id] === "present" && grantIds[participant.person_id] ? (() => { const selected = credits.find((grant) => String(grant.id) === grantIds[participant.person_id]); const remaining = selected ? Math.max(0, manualDuration - creditBalance(selected)) : manualDuration; return remaining ? <p className="modal-intro">Se consumirá el saldo disponible y quedarán {minutesLabel(remaining)} como incidencia.</p> : null; })() : attendance[participant.person_id] === "present" ? <p className="modal-intro">La clase quedará pendiente íntegramente como incidencia hasta que la regularices o decidas aceptarla sin regularizar.</p> : null}</section>;
      })}</div>
      {error ? <p className="error">{error}</p> : null}<div className="actions"><button className="btn ghost" type="button" onClick={close}>Seguir en clase</button><button className="btn" disabled={busy || manualDuration <= 0}><CheckCircle2 size={17} /> {busy ? "Terminando…" : "Terminar clase"}</button></div>
    </form>
  </section></div>;
}`;

fs.writeFileSync(path, source.slice(0, start) + replacement + source.slice(end));
