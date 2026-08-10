from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"anchor not found: {label}")
    return text.replace(old, new, 1)

p = Path('app/cya-app.tsx')
text = p.read_text()

classes_pattern = re.compile(r'function ClassesView\([\s\S]*?\n}\n\nfunction CreditsView\(')
classes_match = classes_pattern.search(text)
if not classes_match:
    raise SystemExit('ClassesView block not found')
new_classes = r'''function ClassesView({ classes, students, schedule, goLive, reopen }: { classes: ClassItem[]; students: Person[]; schedule: () => void; goLive: (id: number) => void; reopen: (id: number) => void }) {
  return <>
    <Header eyebrow="Agenda" title="Clases" description="Cada clase se identifica por alumno y fecha; la numeración interna queda fuera de la interfaz." action={<button className="btn" onClick={schedule}><Plus size={18} /> Programar</button>} />
    {!students.length ? <div className="empty"><UsersRound /><strong>Primero necesitas un alumno</strong><p>En cuanto añadas un alumno podrás programar su primera clase.</p></div>
    : !classes.length ? <div className="empty"><CalendarDays /><strong>Agenda vacía</strong><p>Programa la primera clase. Puede ser individual o en pareja.</p><button className="btn" onClick={schedule}><Plus size={18} /> Programar clase</button></div>
    : <div className="agenda-list">{classes.map((item) => <article className="agenda-row" key={item.id}>
        <span className="agenda-icon"><CalendarDays /></span><div><strong>{namesFor(item.class_participants.map((p) => p.person_id), students)}</strong><span>{dateLabel(item.scheduled_start_at)} · {minutesLabel(item.duration_minutes)}</span></div>
        <span className="agenda-actions"><span className={`badge ${item.status === "active" ? "portal" : ""}`}>{item.status === "scheduled" ? "Programada" : item.status === "active" ? "En clase" : item.status === "finished" ? (item.pedagogy_closed_at ? "Cerrada" : "Por cerrar") : "Cancelada"}</span>
          {item.status === "scheduled" || item.status === "active" || (item.status === "finished" && !item.pedagogy_closed_at) ? <button className="btn class-go" onClick={() => goLive(item.id)}><Play size={16} /> {item.status === "scheduled" ? "Dar clase" : "Abrir"}</button> : null}
          {item.status === "finished" && item.administrative_finished_at ? <button className="btn ghost class-reopen" onClick={() => reopen(item.id)}>Reabrir</button> : null}
        </span>
      </article>)}</div>}
  </>;
}

function CreditsView('''
text = text[:classes_match.start()] + new_classes + text[classes_match.end():]

finish_pattern = re.compile(r'function FinishClassModal\([\s\S]*?\n}\nfunction LiveSession\(')
finish_match = finish_pattern.search(text)
if not finish_match:
    raise SystemExit('FinishClassModal block not found')
new_finish = r'''function FinishClassModal({ item, students, credits, library, close, finished }: { item: ClassItem; students: Person[]; credits: CreditItem[]; library: TeachingContent[]; close: () => void; finished: () => Promise<void> }) {
  type FinancialItemLite = { id: number; item_type: string; concept: string; amount_cents: number; minutes: number | null; source_grant_id: number | null; target_grant_id: number | null };
  type SupplementRow = { id: number; concept: string; amount: string; expanded: boolean };
  type VideoDraft = { id: string; file: File; title: string; mode: "private" | "reusable"; audience: string; contentId: string; saved: boolean };
  const [localCredits, setLocalCredits] = useState<CreditItem[]>([]);
  const allCredits = useMemo(() => {
    const merged = new Map<number, CreditItem>();
    credits.forEach((grant) => merged.set(grant.id, grant));
    localCredits.forEach((grant) => merged.set(grant.id, grant));
    return [...merged.values()];
  }, [localCredits, credits]);
  const [grantIds, setGrantIds] = useState<Record<number, string>>(() => defaultGrantSelection(item, credits));
  const [durationHoursText, setDurationHoursText] = useState(String(Math.floor(item.duration_minutes / 60)));
  const [durationMinutesText, setDurationMinutesText] = useState(String(item.duration_minutes % 60));
  const [billingMode, setBillingMode] = useState<"none" | "quick" | "direct">("none");
  const [quickHoursText, setQuickHoursText] = useState("5"), [quickMinutesText, setQuickMinutesText] = useState("0"), [quickPrice, setQuickPrice] = useState("");
  const initialTransferSources = transferableIndividualCreditsForPair(item, credits);
  const [transferOpen, setTransferOpen] = useState(false), [transferSourceId, setTransferSourceId] = useState(() => initialTransferSources[0] ? String(initialTransferSources[0].id) : "");
  const [transferMinutesText, setTransferMinutesText] = useState(""), [transferFee, setTransferFee] = useState("0"), [transferBusy, setTransferBusy] = useState(false);
  const [financialItems, setFinancialItems] = useState<FinancialItemLite[]>([]);
  const [supplements, setSupplements] = useState<SupplementRow[]>([]), [nextSupplementId, setNextSupplementId] = useState(1);
  const [regularizationAmounts, setRegularizationAmounts] = useState<Record<string, string>>({});
  const [quickCreatedChargeCents, setQuickCreatedChargeCents] = useState(0), [quickCreatedGrantId, setQuickCreatedGrantId] = useState<number | null>(null);
  const [paymentMode, setPaymentMode] = useState<"full" | "half" | "custom" | "none">("full"), [customPayment, setCustomPayment] = useState("");
  const [videos, setVideos] = useState<VideoDraft[]>([]);
  const [quickBusy, setQuickBusy] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const plannedDuration = item.duration_minutes;
  const durationHours = Math.max(0, Math.min(8, Number(durationHoursText || 0)));
  const durationMinutes = Math.max(0, Math.min(59, Number(durationMinutesText || 0)));
  const manualDuration = durationHours * 60 + durationMinutes;
  const classPersonIds = item.class_participants.map((participant) => participant.person_id);
  const hasSelectedGrant = item.class_participants.every((participant) => Boolean(grantIds[participant.person_id]));
  const transferSources = useMemo(() => transferableIndividualCreditsForPair(item, allCredits), [item, allCredits]);
  const transferSource = transferSources.find((grant) => String(grant.id) === transferSourceId) ?? null;
  const selectedGrantId = Object.values(grantIds).find(Boolean) ?? "";
  const selectedGrant = allCredits.find((grant) => String(grant.id) === selectedGrantId) ?? null;
  const reusableVideoContents = library.filter((content) => content.active && ["correction","explanation","sequence"].includes(content.content_type));

  function numericText(value: string, max: number) {
    const clean = value.replace(/\D/g, "");
    if (!clean) return "";
    return String(Math.min(max, Number(clean)));
  }
  function moneyCents(value: string) {
    if (!value.trim()) return null;
    const numeric = Number(value.replace(",", "."));
    return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric * 100) : null;
  }
  function euroLabel(cents: number) { return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100); }
  function eligibleCredits(personId: number) { return compatibleCreditsForClass(item, allCredits, personId); }
  function chooseGrant(personId: number, value: string) {
    setBillingMode("none"); setError("");
    setGrantIds((current) => {
      const next = { ...current };
      if (item.class_type === "pair") item.class_participants.forEach((participant) => { next[participant.person_id] = value; });
      else next[personId] = value;
      return next;
    });
  }
  function clearGrantSelection() { setGrantIds(Object.fromEntries(item.class_participants.map((participant) => [participant.person_id, ""])) as Record<number, string>); }
  function selectCreatedGrant(id: number) {
    setGrantIds((current) => {
      const next = { ...current };
      item.class_participants.forEach((participant) => { next[participant.person_id] = String(id); });
      return next;
    });
    setBillingMode("none");
  }
  function expiryLabel(grant: CreditItem) {
    if (!grant.expires_at) return "";
    return ` · caduca ${new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(new Date(grant.expires_at))}`;
  }
  function ownerLabel(grant: CreditItem) {
    const personId = grant.credit_grant_members[0]?.person_id;
    return students.find((person) => person.id === personId)?.display_name || "Alumno";
  }
  const loadFinancialItems = useCallback(async () => {
    if (!db) return;
    const result = await db.from("class_financial_items").select("id,item_type,concept,amount_cents,minutes,source_grant_id,target_grant_id").eq("class_id", item.id).order("id");
    if (!result.error) setFinancialItems((result.data ?? []) as FinancialItemLite[]);
  }, [item.id]);
  useEffect(() => { void loadFinancialItems(); }, [loadFinancialItems]);

  function addSupplement() { setSupplements((current) => [...current, { id: nextSupplementId, concept: "", amount: "", expanded: true }]); setNextSupplementId((current) => current + 1); }
  function updateSupplement(id: number, patch: Partial<SupplementRow>) { setSupplements((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row)); }
  function saveSupplement(id: number) {
    const row = supplements.find((item) => item.id === id); if (!row) return;
    const amount = moneyCents(row.amount);
    if (!row.concept.trim()) return setError("Indica el concepto del suplemento.");
    if (amount === null || amount <= 0) return setError("Indica un importe válido para el suplemento.");
    setError(""); updateSupplement(id, { expanded: false });
  }
  function removeSupplement(id: number) {
    if (!window.confirm("¿Eliminar este suplemento?")) return;
    setSupplements((current) => current.filter((row) => row.id !== id));
  }

  async function createQuickBonus() {
    if (!db) return;
    const duration = Math.max(0, Number(quickHoursText || 0)) * 60 + Math.max(0, Math.min(59, Number(quickMinutesText || 0)));
    const price = moneyCents(quickPrice);
    if (duration <= 0) return setError("Indica la duración del bono.");
    if (price === null) return setError("Indica el importe del bono.");
    setQuickBusy(true); setError("");
    const result = await db.rpc("create_credit_grant", { p_student_ids: classPersonIds, p_modality: item.class_type, p_minutes: duration, p_price_cents: price, p_label: "Bono rápido", p_payment_status: "pending" });
    if (result.error) { setError(result.error.message); setQuickBusy(false); return; }
    const row = (result.data ?? {}) as Partial<CreditItem> & { id?: number };
    const id = Number(row.id || 0);
    if (!id) { setError("No se pudo seleccionar el bono creado."); setQuickBusy(false); return; }
    const created: CreditItem = { id, modality: item.class_type, label: row.label ?? "Bono rápido", total_minutes: duration, price_cents: price, payment_status: "pending", status: row.status ?? "active", purchased_at: row.purchased_at ?? new Date().toISOString(), expires_at: row.expires_at ?? null, credit_grant_members: classPersonIds.map((person_id) => ({ person_id })), credit_movements: [{ delta_minutes: duration }] };
    setLocalCredits((current) => [created, ...current.filter((grant) => grant.id !== id)]);
    setQuickCreatedChargeCents(price); setQuickCreatedGrantId(id); selectCreatedGrant(id); setQuickBusy(false);
  }
  function openDirectPayment() { clearGrantSelection(); setBillingMode("direct"); setQuickPrice(""); setError(""); }
  function openTransfer() {
    const preferred = transferSources[0];
    if (!preferred) return setError("No hay saldo individual disponible para transferir.");
    setTransferSourceId(String(preferred.id));
    setTransferMinutesText(String(Math.min(manualDuration || item.duration_minutes, creditBalance(preferred))));
    setTransferFee("0"); setTransferOpen(true); setError("");
  }
  async function createPairTransfer() {
    if (!db || !transferSource) return;
    const minutes = Number(transferMinutesText || 0), fee = moneyCents(transferFee);
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > creditBalance(transferSource)) return setError("Indica unos minutos válidos dentro del saldo disponible.");
    if (fee === null) return setError("Indica el coste adicional de la transferencia.");
    setTransferBusy(true); setError("");
    const result = await db.rpc("transfer_individual_credit_to_pair", { p_class_id: item.id, p_source_grant_id: transferSource.id, p_minutes: minutes, p_fee_cents: fee });
    if (result.error) { setError(result.error.message); setTransferBusy(false); return; }
    const row = (result.data ?? {}) as Partial<CreditItem> & { id?: number };
    const targetId = Number(row.id || 0);
    if (!targetId) { setError("No se pudo crear el saldo de pareja."); setTransferBusy(false); return; }
    const updatedSource: CreditItem = { ...transferSource, status: creditBalance(transferSource) - minutes <= 0 ? "exhausted" : transferSource.status, credit_movements: [...transferSource.credit_movements, { delta_minutes: -minutes }] };
    const target: CreditItem = { id: targetId, modality: "pair", label: row.label ?? "Transferencia a pareja", total_minutes: minutes, price_cents: 0, payment_status: "paid", status: "active", purchased_at: row.purchased_at ?? new Date().toISOString(), expires_at: row.expires_at ?? transferSource.expires_at, credit_grant_members: classPersonIds.map((person_id) => ({ person_id })), credit_movements: [{ delta_minutes: minutes }] };
    setLocalCredits((current) => [target, updatedSource, ...current.filter((grant) => grant.id !== targetId && grant.id !== transferSource.id)]);
    selectCreatedGrant(targetId); await loadFinancialItems(); setTransferOpen(false); setTransferBusy(false);
  }

  const shortfallRows = useMemo(() => {
    const rows: Array<{ key: string; grant: CreditItem; personIds: number[]; shortfall: number }> = [];
    if (item.class_type === "pair") {
      const grant = allCredits.find((candidate) => String(candidate.id) === selectedGrantId);
      if (grant) { const shortfall = Math.max(0, manualDuration - creditBalance(grant)); if (shortfall) rows.push({ key: `grant-${grant.id}`, grant, personIds: classPersonIds, shortfall }); }
      return rows;
    }
    item.class_participants.forEach((participant) => {
      const id = grantIds[participant.person_id], grant = allCredits.find((candidate) => String(candidate.id) === id);
      if (!grant) return;
      const shortfall = Math.max(0, manualDuration - creditBalance(grant));
      if (shortfall) rows.push({ key: `grant-${grant.id}`, grant, personIds: [participant.person_id], shortfall });
    });
    return rows;
  }, [item, allCredits, selectedGrantId, grantIds, manualDuration, classPersonIds]);

  const supplementTotalCents = supplements.reduce((sum, row) => sum + (moneyCents(row.amount) ?? 0), 0);
  const directPriceCents = billingMode === "direct" ? (moneyCents(quickPrice) ?? 0) : 0;
  const transferTotalCents = financialItems.filter((row) => row.item_type === "pair_transfer").reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
  const regularizationTotalCents = shortfallRows.reduce((sum, row) => Object.prototype.hasOwnProperty.call(regularizationAmounts, row.key) ? sum + (moneyCents(regularizationAmounts[row.key]) ?? 0) : sum, 0);
  const totalEconomicCents = quickCreatedChargeCents + directPriceCents + transferTotalCents + supplementTotalCents + regularizationTotalCents;
  const customPaidCents = moneyCents(customPayment);
  const paidNowCents = totalEconomicCents <= 0 ? 0 : paymentMode === "full" ? totalEconomicCents : paymentMode === "half" ? Math.round(totalEconomicCents / 2) : paymentMode === "none" ? 0 : (customPaidCents ?? 0);
  const pendingPaymentCents = Math.max(0, totalEconomicCents - paidNowCents);

  function addVideoFiles(files: FileList | null) {
    if (!files?.length) return;
    const additions = Array.from(files).map((file, index): VideoDraft => ({
      id: `${Date.now()}-${index}-${file.name}`,
      file,
      title: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
      mode: "private",
      audience: item.class_type === "pair" ? "both" : String(classPersonIds[0] ?? ""),
      contentId: "",
      saved: false,
    }));
    setVideos((current) => [...current, ...additions]);
  }
  function updateVideo(id: string, patch: Partial<VideoDraft>) { setVideos((current) => current.map((video) => video.id === id ? { ...video, ...patch } : video)); }
  function removeVideo(id: string) {
    const row = videos.find((video) => video.id === id); if (!row || row.saved) return;
    if (!window.confirm("¿Quitar este vídeo del cierre?")) return;
    setVideos((current) => current.filter((video) => video.id !== id));
  }
  async function saveClassVideos() {
    if (!db) return videos.length === 0;
    const sessionResult = await db.auth.getSession(), token = sessionResult.data.session?.access_token;
    if (!token) { setError("Tu sesión ha caducado."); return false; }
    for (const video of videos) {
      if (video.saved) continue;
      const response = await fetch("/api/google-drive/upload", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": video.file.type || "video/mp4", "x-cya-file-name": encodeURIComponent(video.file.name), "x-cya-file-size": String(video.file.size), "x-cya-media-scope": "class_video" }, body: video.file });
      const payload = await response.json().catch(() => null) as { id?: string; mimeType?: string; error?: string } | null;
      if (!response.ok || !payload?.id) { setError(payload?.error || `No se pudo subir ${video.file.name} a Drive.`); return false; }
      const title = video.title.trim() || video.file.name.replace(/\.[^.]+$/, "") || "Vídeo de clase";
      const recipients = video.mode === "private" ? (video.audience === "both" ? classPersonIds : [Number(video.audience)]) : [0];
      for (const personId of recipients) {
        const registered = await db.rpc("register_class_video_resource", { p_class_id: item.id, p_person_id: video.mode === "private" ? personId : null, p_visibility_scope: video.mode === "private" ? "private_student" : "reusable", p_external_file_id: payload.id, p_title: title, p_mime_type: payload.mimeType || video.file.type || "video/mp4", p_size_bytes: video.file.size, p_content_id: video.mode === "reusable" && video.contentId ? Number(video.contentId) : null });
        if (registered.error) { setError(registered.error.message); return false; }
      }
      updateVideo(video.id, { saved: true });
    }
    return true;
  }

  function renderRegularization(grant: CreditItem, personIds: number[]) {
    const row = shortfallRows.find((candidate) => candidate.grant.id === grant.id);
    if (!row) return null;
    const enabled = Object.prototype.hasOwnProperty.call(regularizationAmounts, row.key);
    return <div className="regularization-box"><div><strong>Faltan {minutesLabel(row.shortfall)}</strong><span>Puedes dejarlos pendientes o regularizarlos ahora.</span></div>{enabled ? <div className="regularization-edit"><label className="field"><span>Importe de {minutesLabel(row.shortfall)} (€)</span><input inputMode="decimal" type="text" value={regularizationAmounts[row.key]} onChange={(event) => setRegularizationAmounts((current) => ({ ...current, [row.key]: event.target.value.replace(/[^0-9,.]/g, "") }))} placeholder="0,00" /></label><button className="btn ghost" type="button" onClick={() => setRegularizationAmounts((current) => { const next = { ...current }; delete next[row.key]; return next; })}>Dejar pendiente</button></div> : <button className="btn ghost" type="button" onClick={() => setRegularizationAmounts((current) => ({ ...current, [row.key]: "" }))}><WalletCards size={16} /> Regularizar {minutesLabel(row.shortfall)} ahora</button>}</div>;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!db) return;
    if (manualDuration <= 0 || manualDuration > 480) return setError("La duración debe estar entre 1 minuto y 8 horas.");
    const directPrice = moneyCents(quickPrice);
    if (billingMode === "direct" && directPrice === null) return setError("Indica el importe de la clase suelta.");
    if (billingMode === "quick") return setError("Crea el bono rápido o cancela esa opción antes de terminar la clase.");
    if (paymentMode === "custom" && (customPaidCents === null || customPaidCents > totalEconomicCents)) return setError("Indica un pago válido que no supere el total.");
    const supplementPayload: Array<{ concept: string; amount_cents: number }> = [];
    for (const row of supplements) {
      const concept = row.concept.trim(), amount = moneyCents(row.amount);
      if (!concept && !row.amount.trim()) continue;
      if (!concept) return setError("Indica el concepto de cada suplemento.");
      if (amount === null || amount <= 0) return setError(`Indica un importe válido para ${concept}.`);
      supplementPayload.push({ concept, amount_cents: amount });
    }
    const regularizationPayload: Array<{ source_grant_id: number; minutes: number; amount_cents: number }> = [];
    for (const row of shortfallRows) {
      if (!Object.prototype.hasOwnProperty.call(regularizationAmounts, row.key)) continue;
      const amount = moneyCents(regularizationAmounts[row.key]);
      if (amount === null) return setError(`Indica el importe para regularizar ${minutesLabel(row.shortfall)}.`);
      regularizationPayload.push({ source_grant_id: row.grant.id, minutes: row.shortfall, amount_cents: amount });
    }
    const personIds = item.class_participants.map((participant) => participant.person_id);
    setBusy(true); setError("");
    if (!(await saveClassVideos())) { setBusy(false); return; }
    const result = await db.rpc("administratively_finish_class_v6", {
      p_class_id: item.id,
      p_person_ids: personIds,
      p_grant_ids: billingMode === "direct" ? personIds.map(() => null) : personIds.map((id) => grantIds[id] ? Number(grantIds[id]) : null),
      p_duration_minutes: manualDuration,
      p_direct_payment_price_cents: billingMode === "direct" ? directPrice : null,
      p_supplements: supplementPayload,
      p_regularizations: regularizationPayload,
      p_paid_now_cents: paidNowCents,
      p_quick_created_grant_id: quickCreatedGrantId,
    });
    if (result.error) { setError(result.error.message); setBusy(false); return; }
    await finished(); setBusy(false); close();
  }

  const pairAvailable = item.class_type === "pair" && classPersonIds[0] ? eligibleCredits(classPersonIds[0]) : [];
  return <div className="backdrop"><section className="modal finish-modal" role="dialog" aria-modal="true">
    <header className="modal-head"><div><p className="eyebrow">Parte administrativa</p><h2>Terminar clase</h2></div><button className="icon-btn" onClick={close} aria-label="Cerrar"><X /></button></header>
    <form className="modal-body" onSubmit={submit}>
      <section className="card pad"><div className="card-head"><div><p className="eyebrow">Duración</p><h2>Duración de la clase</h2></div><span className="badge">Programada · {minutesLabel(plannedDuration)}</span></div><div className="fields-2"><label className="field"><span>Horas</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={durationHoursText} onChange={(event) => setDurationHoursText(numericText(event.target.value, 8))} /></label><label className="field"><span>Minutos</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={durationMinutesText} onChange={(event) => setDurationMinutesText(numericText(event.target.value, 59))} /></label></div><p className="modal-intro">{manualDuration === plannedDuration ? `Se usarán ${minutesLabel(manualDuration)}.` : `Se usarán ${minutesLabel(manualDuration)} en saldo, incidencias e historial.`}</p></section>

      {item.class_type === "pair" ? <section className="finish-person finish-pair-credit"><strong>{namesFor(classPersonIds, students)}</strong><label className="field"><span>Bono de pareja</span><select value={selectedGrantId} disabled={billingMode === "direct"} onChange={(event) => chooseGrant(classPersonIds[0], event.target.value)}><option value="">Sin bono</option>{pairAvailable.map((grant) => { const balance = creditBalance(grant), shortfall = Math.max(0, manualDuration - balance); return <option key={grant.id} value={grant.id}>{grant.label || "Bono de pareja"} · {minutesLabel(balance)}{expiryLabel(grant)}{shortfall ? ` · faltarán ${minutesLabel(shortfall)}` : ""}</option>; })}</select></label>{selectedGrant ? renderRegularization(selectedGrant, classPersonIds) : null}</section> : <div className="finish-list">{item.class_participants.map((participant) => {
        const student = students.find((person) => person.id === participant.person_id), available = eligibleCredits(participant.person_id), selected = allCredits.find((grant) => String(grant.id) === grantIds[participant.person_id]);
        return <section className="finish-person" key={participant.person_id}><strong>{student?.display_name || "Alumno"}</strong><label className="field"><span>Bono</span><select value={grantIds[participant.person_id] || ""} disabled={billingMode === "direct"} onChange={(event) => chooseGrant(participant.person_id, event.target.value)}><option value="">Sin bono</option>{available.map((grant) => { const balance = creditBalance(grant), shortfall = Math.max(0, manualDuration - balance); return <option key={grant.id} value={grant.id}>{grant.label || "Bono individual"} · {minutesLabel(balance)}{expiryLabel(grant)}{shortfall ? ` · faltarán ${minutesLabel(shortfall)}` : ""}</option>; })}</select></label>{selected ? renderRegularization(selected, [participant.person_id]) : null}</section>;
      })}</div>}

      {item.class_type === "pair" ? <section className="card pad"><div className="card-head"><div><p className="eyebrow">Pareja</p><h2>Transferir saldo individual</h2></div><button className="btn ghost" type="button" disabled={!transferSources.length || transferBusy} onClick={openTransfer}><WalletCards size={17} /> Transferir saldo</button></div>{transferTotalCents ? <p className="modal-intro">Coste de transferencias realizadas para esta clase: <strong>{euroLabel(transferTotalCents)}</strong>.</p> : <p className="modal-intro">Puedes convertir los minutos que quieras antes de cerrar y usar después el nuevo bono de pareja.</p>}{transferOpen && transferSource ? <div className="transfer-preclose"><label className="field"><span>Bono individual</span><select value={transferSourceId} onChange={(event) => { const value = event.target.value; setTransferSourceId(value); const source = transferSources.find((grant) => String(grant.id) === value); if (source) setTransferMinutesText(String(Math.min(manualDuration || item.duration_minutes, creditBalance(source)))); }}>{transferSources.map((grant) => <option key={grant.id} value={grant.id}>{ownerLabel(grant)} · {grant.label || "Bono individual"} · {minutesLabel(creditBalance(grant))}{expiryLabel(grant)}</option>)}</select></label><div className="fields-2"><label className="field"><span>Minutos a transferir</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={transferMinutesText} onChange={(event) => setTransferMinutesText(numericText(event.target.value, Math.min(480, creditBalance(transferSource))))} /></label><label className="field"><span>Coste adicional (€)</span><input type="text" inputMode="decimal" value={transferFee} onChange={(event) => setTransferFee(event.target.value.replace(/[^0-9,.]/g, ""))} /></label></div><div className="actions"><button className="btn ghost" type="button" onClick={() => setTransferOpen(false)}>Cancelar</button><button className="btn" type="button" disabled={transferBusy || !transferMinutesText} onClick={() => void createPairTransfer()}>{transferBusy ? "Transfiriendo…" : "Hacer transferencia"}</button></div></div> : null}</section> : null}

      {!hasSelectedGrant && billingMode === "none" ? <section className="card pad"><div className="card-head"><div><p className="eyebrow">Cobro</p><h2>Sin bono compatible</h2></div></div><div className="actions"><button className="btn ghost" type="button" onClick={() => { setBillingMode("quick"); setQuickPrice(""); setError(""); }}><Plus size={17} /> Crear bono rápido</button><button className="btn" type="button" onClick={openDirectPayment}><WalletCards size={17} /> Pagar clase suelta</button></div></section> : null}

      {billingMode === "quick" ? <section className="card pad"><div className="card-head"><div><p className="eyebrow">Bono rápido</p><h2>{item.class_type === "pair" ? "Bono de pareja" : "Bono individual"}</h2></div></div><div className="fields-2"><label className="field"><span>Horas</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={quickHoursText} onChange={(event) => setQuickHoursText(numericText(event.target.value, 1000))} /></label><label className="field"><span>Minutos</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={quickMinutesText} onChange={(event) => setQuickMinutesText(numericText(event.target.value, 59))} /></label><label className="field field-wide"><span>Importe (€)</span><input type="text" inputMode="decimal" value={quickPrice} onChange={(event) => setQuickPrice(event.target.value.replace(/[^0-9,.]/g, ""))} /></label></div><p className="modal-intro">El pago se decide en el resumen final.</p><div className="actions"><button className="btn ghost" type="button" onClick={() => { setBillingMode("none"); setError(""); }}>Cancelar</button><button className="btn" type="button" disabled={quickBusy} onClick={() => void createQuickBonus()}><Plus size={17} /> {quickBusy ? "Creando…" : "Crear y usar"}</button></div></section> : null}
      {billingMode === "direct" ? <section className="card pad"><div className="card-head"><div><p className="eyebrow">Clase suelta</p><h2>{minutesLabel(manualDuration)}</h2></div><span className="badge">Clase suelta</span></div><label className="field"><span>Importe (€)</span><input type="text" inputMode="decimal" value={quickPrice} onChange={(event) => setQuickPrice(event.target.value.replace(/[^0-9,.]/g, ""))} /></label><div className="actions"><button className="btn ghost" type="button" onClick={() => { setBillingMode("none"); setError(""); }}>Cancelar</button></div></section> : null}

      <section className="card pad"><div className="card-head"><div><p className="eyebrow">Extras</p><h2>Suplementos</h2></div><button className="btn ghost" type="button" onClick={addSupplement}><Plus size={17} /> Añadir</button></div>{supplements.length ? <div className="supplement-list">{supplements.map((supplement) => supplement.expanded ? <div className="supplement-editor" key={supplement.id}><div className="fields-2"><label className="field"><span>Concepto</span><input value={supplement.concept} onChange={(event) => updateSupplement(supplement.id, { concept: event.target.value })} placeholder="Parking, desplazamiento…" autoFocus /></label><label className="field"><span>Importe (€)</span><input type="text" inputMode="decimal" value={supplement.amount} onChange={(event) => updateSupplement(supplement.id, { amount: event.target.value.replace(/[^0-9,.]/g, "") })} placeholder="0,00" /></label></div><div className="actions"><button className="btn ghost" type="button" onClick={() => removeSupplement(supplement.id)}>Eliminar</button><button className="btn" type="button" onClick={() => saveSupplement(supplement.id)}>Guardar</button></div></div> : <div className="supplement-compact" key={supplement.id}><button type="button" onClick={() => updateSupplement(supplement.id, { expanded: true })}><span>{supplement.concept}</span><strong>{euroLabel(moneyCents(supplement.amount) ?? 0)}</strong></button><button className="icon-btn" type="button" aria-label="Eliminar suplemento" onClick={() => removeSupplement(supplement.id)}><X /></button></div>)}</div> : <p className="modal-intro">Sin suplementos.</p>}</section>

      <section className="card pad"><div className="card-head"><div><p className="eyebrow">Vídeos</p><h2>Vídeos explicativos</h2></div><label className="btn ghost video-add"><Plus size={17} /> Añadir<input type="file" accept="video/*" multiple disabled={busy} onChange={(event) => { addVideoFiles(event.target.files); event.currentTarget.value = ""; }} /></label></div>{videos.length ? <div className="class-video-drafts">{videos.map((video) => <article className="class-video-draft" key={video.id}><div className="class-video-draft-head"><div><strong>{video.file.name}</strong><span>{video.saved ? "Guardado" : "Pendiente de subir"}</span></div>{!video.saved ? <button className="icon-btn" type="button" aria-label="Quitar vídeo" onClick={() => removeVideo(video.id)}><X /></button> : null}</div><label className="field"><span>Título</span><input value={video.title} disabled={video.saved} onChange={(event) => updateVideo(video.id, { title: event.target.value })} /></label><div className="segmented"><button type="button" className={video.mode === "private" ? "active" : ""} disabled={video.saved} onClick={() => updateVideo(video.id, { mode: "private", contentId: "" })}>Para alumno</button><button type="button" className={video.mode === "reusable" ? "active" : ""} disabled={video.saved} onClick={() => updateVideo(video.id, { mode: "reusable" })}>Reutilizable</button></div>{video.mode === "private" && item.class_type === "pair" ? <label className="field"><span>Disponible para</span><select value={video.audience} disabled={video.saved} onChange={(event) => updateVideo(video.id, { audience: event.target.value })}><option value="both">Ambos</option>{classPersonIds.map((personId) => <option key={personId} value={personId}>{students.find((person) => person.id === personId)?.display_name || "Alumno"}</option>)}</select></label> : null}{video.mode === "reusable" ? <label className="field"><span>Añadir ahora a contenido</span><select value={video.contentId} disabled={video.saved} onChange={(event) => updateVideo(video.id, { contentId: event.target.value })}><option value="">Dejar disponible para después</option>{reusableVideoContents.map((content) => <option key={content.id} value={content.id}>{teachingKindLabels[content.content_type]} · {content.title}</option>)}</select></label> : null}</article>)}</div> : <p className="modal-intro">Opcional. Puedes añadir varios vídeos.</p>}</section>

      <section className="card pad"><div className="card-head"><div><p className="eyebrow">Resumen</p><h2>Cierre</h2></div></div><p className="modal-intro"><strong>Duración:</strong> {minutesLabel(manualDuration)}</p>{selectedGrant ? <p className="modal-intro"><strong>Bono:</strong> {selectedGrant.label || (selectedGrant.modality === "pair" ? "Bono de pareja" : "Bono individual")} · se consumirán hasta {minutesLabel(Math.min(manualDuration, creditBalance(selectedGrant)))}</p> : null}{billingMode === "direct" ? <p className="modal-intro"><strong>Clase suelta:</strong> {euroLabel(directPriceCents)}</p> : null}{transferTotalCents ? <p className="modal-intro"><strong>Transferencias:</strong> {euroLabel(transferTotalCents)}</p> : null}{regularizationTotalCents ? <p className="modal-intro"><strong>Regularización:</strong> {euroLabel(regularizationTotalCents)}</p> : null}{supplementTotalCents ? <p className="modal-intro"><strong>Suplementos:</strong> {euroLabel(supplementTotalCents)}</p> : null}{quickCreatedChargeCents ? <p className="modal-intro"><strong>Bono creado ahora:</strong> {euroLabel(quickCreatedChargeCents)}</p> : null}<div className="card-head"><h2>Total de este cierre</h2><strong>{euroLabel(totalEconomicCents)}</strong></div></section>
      {totalEconomicCents > 0 ? <section className="card pad"><div className="card-head"><div><p className="eyebrow">Pago</p><h2>Pago recibido ahora</h2></div><strong>{euroLabel(paidNowCents)}</strong></div><div className="fields-2"><button className={paymentMode === "full" ? "btn" : "btn ghost"} type="button" onClick={() => setPaymentMode("full")}>Todo · {euroLabel(totalEconomicCents)}</button><button className={paymentMode === "half" ? "btn" : "btn ghost"} type="button" onClick={() => setPaymentMode("half")}>Mitad · {euroLabel(Math.round(totalEconomicCents / 2))}</button><button className={paymentMode === "custom" ? "btn" : "btn ghost"} type="button" onClick={() => setPaymentMode("custom")}>Otra cantidad</button><button className={paymentMode === "none" ? "btn" : "btn ghost"} type="button" onClick={() => setPaymentMode("none")}>Nada ahora</button></div>{paymentMode === "custom" ? <label className="field"><span>Importe recibido (€)</span><input type="text" inputMode="decimal" value={customPayment} onChange={(event) => setCustomPayment(event.target.value.replace(/[^0-9,.]/g, ""))} /></label> : null}<div className="card-head"><span>Pagado ahora</span><strong>{euroLabel(paidNowCents)}</strong></div><div className="card-head"><span>Pendiente</span><strong>{euroLabel(pendingPaymentCents)}</strong></div></section> : null}
      {!hasSelectedGrant && billingMode === "none" ? <p className="modal-intro">Si terminas sin bono, la duración quedará pendiente como incidencia.</p> : null}
      {error ? <p className="error">{error}</p> : null}<div className="actions"><button className="btn ghost" type="button" onClick={close}>Seguir en clase</button><button className="btn" disabled={busy || manualDuration <= 0 || billingMode === "quick"}><CheckCircle2 size={17} /> {busy ? "Terminando…" : "Terminar clase"}</button></div>
    </form>
  </section></div>;
}
function LiveSession('''
text = text[:finish_match.start()] + new_finish + text[finish_match.end():]

text = replace_once(
    text,
    '  function goLive(id?: number) { navigateView("live", { liveClassId: id ?? liveClassId }); }\n',
    '''  function goLive(id?: number) { navigateView("live", { liveClassId: id ?? liveClassId }); }\n  async function reopenClass(id: number) {\n    if (!db || !window.confirm("¿Reabrir esta clase? Se deshará su cierre administrativo, incluidos consumos, regularizaciones, transferencias, suplementos y pagos registrados en ese cierre.")) return;\n    const result = await db.rpc("reopen_administratively_finished_class", { p_class_id: id });\n    if (result.error) { setToast(result.error.message); return; }\n    await loadOperations();\n    setToast("Clase reabierta. Puedes corregirla y volver a terminarla.");\n    goLive(id);\n  }\n''',
    'reopen function',
)
text = replace_once(
    text,
    '{view === "classes" ? <ClassesView classes={classes} students={students} schedule={() => openSchedule(null)} goLive={goLive} /> : null}',
    '{view === "classes" ? <ClassesView classes={classes} students={students} schedule={() => openSchedule(null)} goLive={goLive} reopen={(id) => void reopenClass(id)} /> : null}',
    'ClassesView invocation',
)
p.write_text(text)

p = Path('app/globals.css')
css = p.read_text()
marker = '/* v30 · cierre administrativo final */'
if marker not in css:
    css += r'''

/* v30 · cierre administrativo final */
.finish-pair-credit{display:grid;gap:12px}.finish-pair-credit>strong{font-size:16px}.regularization-box{display:grid;gap:9px;margin-top:10px;padding:11px;border:1px solid #ddd5ff;border-radius:13px;background:#f8f6ff}.regularization-box>div:first-child strong,.regularization-box>div:first-child span{display:block}.regularization-box>div:first-child strong{font-size:13px;color:#4f3aca}.regularization-box>div:first-child span{margin-top:3px;color:var(--muted);font-size:12px}.regularization-edit{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:8px}.transfer-preclose{display:grid;gap:10px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}.supplement-list{display:grid;gap:9px}.supplement-editor{display:grid;gap:9px;padding:11px;border:1px solid var(--line);border-radius:13px;background:#fbfafd}.supplement-compact{display:grid;grid-template-columns:minmax(0,1fr) 42px;align-items:center;gap:6px;padding:5px 7px 5px 12px;border:1px solid var(--line);border-radius:12px;background:#fff}.supplement-compact>button:first-child{min-width:0;min-height:42px;display:flex;align-items:center;justify-content:space-between;gap:10px;border:0;background:transparent;color:var(--ink);text-align:left}.supplement-compact span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:680}.supplement-compact strong{white-space:nowrap;color:#5d45dd}.video-add{position:relative;overflow:hidden}.video-add input{position:absolute;inset:0;opacity:0;cursor:pointer}.class-video-drafts{display:grid;gap:10px}.class-video-draft{display:grid;gap:10px;padding:11px;border:1px solid var(--line);border-radius:14px;background:#fbfafd}.class-video-draft-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.class-video-draft-head>div{min-width:0}.class-video-draft-head strong,.class-video-draft-head span{display:block}.class-video-draft-head strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.class-video-draft-head span{margin-top:3px;color:var(--muted);font-size:11px}.class-reopen{min-height:38px;padding:0 11px}
@media(max-width:620px){.regularization-edit{grid-template-columns:1fr}.regularization-edit .btn{width:100%}.finish-pair-credit{padding:14px}.transfer-preclose .actions{grid-template-columns:1fr 1fr}.supplement-editor .actions{grid-template-columns:1fr 1fr}.class-video-draft{padding:10px}.class-video-draft .field input,.class-video-draft .field select,.regularization-box input,.transfer-preclose input{font-size:16px}.agenda-actions{flex-wrap:wrap;justify-content:flex-end}.class-reopen{min-height:40px}}
'''
p.write_text(css)
