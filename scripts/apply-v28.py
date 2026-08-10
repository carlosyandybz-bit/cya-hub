from pathlib import Path
import re

app_path = Path("app/cya-app.tsx")
text = app_path.read_text()

if "function transferableIndividualCreditsForPair(" not in text:
    marker = "function ManualStartClass("
    pos = text.index(marker)
    helper = r'''function transferableIndividualCreditsForPair(item: ClassItem, credits: CreditItem[]) {
  if (item.class_type !== "pair") return [];
  const classPeople = new Set(item.class_participants.map((participant) => participant.person_id));
  return credits.filter((grant) => {
    if (grant.status !== "active" || grant.modality !== "individual" || creditBalance(grant) <= 0) return false;
    if (grant.expires_at) {
      const expiry = new Date(grant.expires_at).getTime();
      if (Number.isFinite(expiry) && expiry <= Date.now()) return false;
    }
    const members = grant.credit_grant_members.map((member) => member.person_id);
    return members.length === 1 && classPeople.has(members[0]);
  }).sort((a, b) => {
    const aExpiry = a.expires_at ? new Date(a.expires_at).getTime() : Number.POSITIVE_INFINITY;
    const bExpiry = b.expires_at ? new Date(b.expires_at).getTime() : Number.POSITIVE_INFINITY;
    const safeA = Number.isFinite(aExpiry) ? aExpiry : Number.POSITIVE_INFINITY;
    const safeB = Number.isFinite(bExpiry) ? bExpiry : Number.POSITIVE_INFINITY;
    if (safeA !== safeB) return safeA - safeB;
    return new Date(a.purchased_at).getTime() - new Date(b.purchased_at).getTime();
  });
}

'''
    text = text[:pos] + helper + text[pos:]

new_finish = r'''function FinishClassModal({ item, students, credits, close, finished }: { item: ClassItem; students: Person[]; credits: CreditItem[]; close: () => void; finished: () => Promise<void> }) {
  const [localCredits, setLocalCredits] = useState<CreditItem[]>([]);
  const allCredits = useMemo(() => [...localCredits, ...credits], [localCredits, credits]);
  const [grantIds, setGrantIds] = useState<Record<number, string>>(() => defaultGrantSelection(item, credits));
  const [manualDuration, setManualDuration] = useState(item.duration_minutes);
  const [billingMode, setBillingMode] = useState<"none" | "quick" | "direct" | "transfer">("none");
  const [quickHours, setQuickHours] = useState(5), [quickMinutes, setQuickMinutes] = useState(0), [quickPrice, setQuickPrice] = useState("");
  const [quickPaymentStatus, setQuickPaymentStatus] = useState<"paid" | "pending">("paid");
  const initialTransferSources = transferableIndividualCreditsForPair(item, credits);
  const [transferSourceId, setTransferSourceId] = useState(() => initialTransferSources[0] ? String(initialTransferSources[0].id) : "");
  const [transferFee, setTransferFee] = useState("0");
  const [supplements, setSupplements] = useState<Array<{ id: number; concept: string; amount: string }>>([]);
  const [nextSupplementId, setNextSupplementId] = useState(1);
  const [quickCreatedChargeCents, setQuickCreatedChargeCents] = useState(0);
  const [quickBusy, setQuickBusy] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const plannedDuration = item.duration_minutes;
  const durationHours = Math.floor(manualDuration / 60), durationMinutes = manualDuration % 60;
  const classPersonIds = item.class_participants.map((participant) => participant.person_id);
  const hasSelectedGrant = item.class_participants.every((participant) => Boolean(grantIds[participant.person_id]));
  const transferSources = useMemo(() => transferableIndividualCreditsForPair(item, allCredits), [item, allCredits]);
  const transferSource = transferSources.find((grant) => String(grant.id) === transferSourceId) ?? null;
  const transferAvailable = transferSource ? creditBalance(transferSource) : 0;
  const transferMinutes = Math.min(Math.max(0, manualDuration), Math.max(0, transferAvailable));
  const transferShortfall = Math.max(0, manualDuration - transferMinutes);
  const selectedGrantId = Object.values(grantIds).find(Boolean) ?? "";
  const selectedGrant = allCredits.find((grant) => String(grant.id) === selectedGrantId) ?? null;

  function setDurationParts(hours: number, minutes: number) {
    setManualDuration(Math.max(0, Math.min(480, Math.max(0, hours) * 60 + Math.max(0, Math.min(59, minutes)))));
  }
  function moneyCents(value: string) {
    if (!value.trim()) return null;
    const numeric = Number(value.replace(",", "."));
    return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric * 100) : null;
  }
  function euroLabel(cents: number) {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
  }
  function eligibleCredits(personId: number) {
    return compatibleCreditsForClass(item, allCredits, personId);
  }
  function chooseGrant(personId: number, value: string) {
    setBillingMode("none"); setError("");
    setGrantIds((current) => {
      const next = { ...current };
      if (item.class_type === "pair") item.class_participants.forEach((participant) => { next[participant.person_id] = value; });
      else next[personId] = value;
      return next;
    });
  }
  function clearGrantSelection() {
    setGrantIds(Object.fromEntries(item.class_participants.map((participant) => [participant.person_id, ""])) as Record<number, string>);
  }
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
  function addSupplement() {
    setSupplements((current) => [...current, { id: nextSupplementId, concept: "", amount: "" }]);
    setNextSupplementId((current) => current + 1);
  }
  function updateSupplement(id: number, patch: Partial<{ concept: string; amount: string }>) {
    setSupplements((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }
  function removeSupplement(id: number) {
    setSupplements((current) => current.filter((item) => item.id !== id));
  }
  async function createQuickBonus() {
    if (!db) return;
    const duration = Math.max(0, quickHours) * 60 + Math.max(0, Math.min(59, quickMinutes));
    const price = moneyCents(quickPrice);
    if (duration <= 0) return setError("Indica la duración del bono.");
    if (price === null) return setError("Indica el importe del bono.");
    setQuickBusy(true); setError("");
    const result = await db.rpc("create_credit_grant", {
      p_student_ids: classPersonIds, p_modality: item.class_type, p_minutes: duration,
      p_price_cents: price, p_label: "Bono rápido", p_payment_status: quickPaymentStatus,
    });
    if (result.error) { setError(result.error.message); setQuickBusy(false); return; }
    const row = (result.data ?? {}) as Partial<CreditItem> & { id?: number };
    const id = Number(row.id || 0);
    if (!id) { setError("No se pudo seleccionar el bono creado."); setQuickBusy(false); return; }
    const created: CreditItem = {
      id, modality: item.class_type, label: row.label ?? "Bono rápido", total_minutes: duration,
      price_cents: price, payment_status: quickPaymentStatus, status: row.status ?? "active",
      purchased_at: row.purchased_at ?? new Date().toISOString(), expires_at: row.expires_at ?? null,
      credit_grant_members: classPersonIds.map((person_id) => ({ person_id })), credit_movements: [{ delta_minutes: duration }],
    };
    setLocalCredits((current) => [created, ...current]);
    setQuickCreatedChargeCents((current) => current + price);
    selectCreatedGrant(id); setQuickBusy(false);
  }
  function openDirectPayment() {
    clearGrantSelection(); setBillingMode("direct"); setQuickPrice(""); setError("");
  }
  function openPairTransfer() {
    clearGrantSelection();
    const preferred = transferSources[0];
    if (preferred) setTransferSourceId(String(preferred.id));
    setBillingMode("transfer"); setTransferFee("0"); setError("");
  }

  const supplementTotalCents = supplements.reduce((sum, row) => sum + (moneyCents(row.amount) ?? 0), 0);
  const directPriceCents = billingMode === "direct" ? (moneyCents(quickPrice) ?? 0) : 0;
  const transferFeeCents = billingMode === "transfer" ? (moneyCents(transferFee) ?? 0) : 0;
  const totalEconomicCents = quickCreatedChargeCents + directPriceCents + transferFeeCents + supplementTotalCents;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!db) return;
    if (manualDuration <= 0 || manualDuration > 480) return setError("La duración debe estar entre 1 minuto y 8 horas.");
    const directPrice = moneyCents(quickPrice);
    if (billingMode === "direct" && directPrice === null) return setError("Indica el importe de la clase suelta.");
    if (billingMode === "quick") return setError("Crea el bono rápido o cancela esa opción antes de terminar la clase.");
    const pairTransferFee = moneyCents(transferFee);
    if (billingMode === "transfer" && (!transferSourceId || pairTransferFee === null)) return setError("Selecciona el bono individual y el coste adicional.");
    if (billingMode === "transfer" && !transferSources.some((grant) => String(grant.id) === transferSourceId)) return setError("El bono individual seleccionado ya no está disponible.");
    const supplementPayload: Array<{ concept: string; amount_cents: number }> = [];
    for (const row of supplements) {
      const concept = row.concept.trim(), amount = moneyCents(row.amount);
      if (!concept && !row.amount.trim()) continue;
      if (!concept) return setError("Indica el concepto de cada suplemento.");
      if (amount === null || amount <= 0) return setError(`Indica un importe válido para ${concept}.`);
      supplementPayload.push({ concept, amount_cents: amount });
    }
    const personIds = item.class_participants.map((participant) => participant.person_id);
    setBusy(true); setError("");
    const result = await db.rpc("administratively_finish_class_v4", {
      p_class_id: item.id,
      p_person_ids: personIds,
      p_grant_ids: billingMode === "direct" || billingMode === "transfer" ? personIds.map(() => null) : personIds.map((id) => grantIds[id] ? Number(grantIds[id]) : null),
      p_duration_minutes: manualDuration,
      p_direct_payment_price_cents: billingMode === "direct" ? directPrice : null,
      p_pair_transfer_source_grant_id: billingMode === "transfer" ? Number(transferSourceId) : null,
      p_pair_transfer_fee_cents: billingMode === "transfer" ? (pairTransferFee ?? 0) : 0,
      p_supplements: supplementPayload,
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
          <label className="field"><span>Bono</span><select value={grantIds[participant.person_id] || ""} disabled={billingMode === "direct"} onChange={(event) => chooseGrant(participant.person_id, event.target.value)}><option value="">Sin bono</option>{available.map((grant) => { const balance = creditBalance(grant), shortfall = Math.max(0, manualDuration - balance); return <option key={grant.id} value={grant.id}>{grant.label || (grant.modality === "pair" ? "Bono pareja" : "Bono individual")} · {minutesLabel(balance)}{expiryLabel(grant)}{shortfall ? ` · faltarán ${minutesLabel(shortfall)}` : ""}</option>; })}</select></label>
        </div>{grantIds[participant.person_id] ? (() => { const selected = allCredits.find((grant) => String(grant.id) === grantIds[participant.person_id]); const remaining = selected ? Math.max(0, manualDuration - creditBalance(selected)) : manualDuration; return remaining ? <p className="modal-intro">Se consumirá el saldo disponible y quedarán {minutesLabel(remaining)} como incidencia.</p> : null; })() : null}</section>;
      })}</div>

      {!hasSelectedGrant && billingMode === "none" ? <section className="card pad"><div className="card-head"><div><p className="eyebrow">Cobro</p><h2>Sin bono compatible</h2></div></div><div className="actions"><button className="btn ghost" type="button" onClick={() => { setBillingMode("quick"); setQuickPrice(""); setError(""); }}><Plus size={17} /> Crear bono rápido</button>{item.class_type === "pair" && transferSources.length ? <button className="btn ghost" type="button" onClick={openPairTransfer}><WalletCards size={17} /> Transferir saldo individual</button> : null}<button className="btn" type="button" onClick={openDirectPayment}><WalletCards size={17} /> Pagar clase suelta</button></div></section> : null}

      {billingMode === "quick" ? <section className="card pad"><div className="card-head"><div><p className="eyebrow">Bono rápido</p><h2>{item.class_type === "pair" ? "Bono de pareja" : "Bono individual"}</h2></div></div><div className="fields-2"><label className="field"><span>Horas</span><input type="number" min="0" max="1000" value={quickHours} onChange={(event) => setQuickHours(Number(event.target.value || 0))} /></label><label className="field"><span>Minutos</span><input type="number" min="0" max="59" value={quickMinutes} onChange={(event) => setQuickMinutes(Number(event.target.value || 0))} /></label><label className="field"><span>Importe (€)</span><input type="number" min="0" step="0.01" value={quickPrice} onChange={(event) => setQuickPrice(event.target.value)} /></label><label className="field"><span>Pago</span><select value={quickPaymentStatus} onChange={(event) => setQuickPaymentStatus(event.target.value as "paid" | "pending")}><option value="paid">Pagado</option><option value="pending">Pendiente</option></select></label></div><div className="actions"><button className="btn ghost" type="button" onClick={() => { setBillingMode("none"); setError(""); }}>Cancelar</button><button className="btn" type="button" disabled={quickBusy} onClick={() => void createQuickBonus()}><Plus size={17} /> {quickBusy ? "Creando…" : "Crear y usar"}</button></div></section> : null}

      {billingMode === "direct" ? <section className="card pad"><div className="card-head"><div><p className="eyebrow">Clase suelta</p><h2>{minutesLabel(manualDuration)}</h2></div><span className="badge">Pagado</span></div><label className="field"><span>Importe (€)</span><input type="number" min="0" step="0.01" value={quickPrice} onChange={(event) => setQuickPrice(event.target.value)} /></label><div className="actions"><button className="btn ghost" type="button" onClick={() => { setBillingMode("none"); setError(""); }}>Cancelar</button></div></section> : null}

      {billingMode === "transfer" ? <section className="card pad"><div className="card-head"><div><p className="eyebrow">Pareja</p><h2>Transferir saldo individual</h2></div><span className="badge">{minutesLabel(transferMinutes)}</span></div><div className="fields-2"><label className="field field-wide"><span>Bono individual</span><select value={transferSourceId} onChange={(event) => setTransferSourceId(event.target.value)}>{transferSources.map((grant) => <option key={grant.id} value={grant.id}>{ownerLabel(grant)} · {grant.label || "Bono individual"} · {minutesLabel(creditBalance(grant))}{expiryLabel(grant)}</option>)}</select></label><label className="field"><span>Coste adicional (€)</span><input type="number" min="0" step="0.01" value={transferFee} onChange={(event) => setTransferFee(event.target.value)} /></label></div>{transferSource ? <p className="modal-intro">Se moverán {minutesLabel(transferMinutes)} del bono individual a un bono de pareja para esta clase.{transferShortfall ? ` Quedarán ${minutesLabel(transferShortfall)} pendientes.` : ""}</p> : null}<div className="actions"><button className="btn ghost" type="button" onClick={() => { setBillingMode("none"); setError(""); }}>Cancelar</button></div></section> : null}

      <section className="card pad"><div className="card-head"><div><p className="eyebrow">Extras</p><h2>Suplementos</h2></div><button className="btn ghost" type="button" onClick={addSupplement}><Plus size={17} /> Añadir</button></div>{supplements.length ? <div className="finish-list">{supplements.map((supplement) => <div className="fields-2" key={supplement.id}><label className="field"><span>Concepto</span><input value={supplement.concept} onChange={(event) => updateSupplement(supplement.id, { concept: event.target.value })} placeholder="Parking, desplazamiento…" /></label><label className="field"><span>Importe (€)</span><input type="number" min="0" step="0.01" value={supplement.amount} onChange={(event) => updateSupplement(supplement.id, { amount: event.target.value })} /></label><div className="actions"><button className="btn ghost" type="button" onClick={() => removeSupplement(supplement.id)}><X size={16} /> Eliminar</button></div></div>)}</div> : <p className="modal-intro">Sin suplementos.</p>}</section>

      <section className="card pad"><div className="card-head"><div><p className="eyebrow">Resumen</p><h2>Cierre</h2></div></div><p className="modal-intro"><strong>Duración:</strong> {minutesLabel(manualDuration)}</p>{selectedGrant ? <p className="modal-intro"><strong>Bono:</strong> {selectedGrant.label || (selectedGrant.modality === "pair" ? "Bono de pareja" : "Bono individual")} · se consumirán hasta {minutesLabel(Math.min(manualDuration, creditBalance(selectedGrant)))}</p> : null}{billingMode === "direct" ? <p className="modal-intro"><strong>Clase suelta:</strong> {euroLabel(directPriceCents)}</p> : null}{billingMode === "transfer" && transferSource ? <p className="modal-intro"><strong>Conversión:</strong> {minutesLabel(transferMinutes)} desde {ownerLabel(transferSource)} · {euroLabel(transferFeeCents)}</p> : null}{supplementTotalCents ? <p className="modal-intro"><strong>Suplementos:</strong> {euroLabel(supplementTotalCents)}</p> : null}{quickCreatedChargeCents ? <p className="modal-intro"><strong>Bono creado ahora:</strong> {euroLabel(quickCreatedChargeCents)}</p> : null}<div className="card-head"><h2>Total económico registrado ahora</h2><strong>{euroLabel(totalEconomicCents)}</strong></div></section>

      {!hasSelectedGrant && billingMode === "none" ? <p className="modal-intro">Si terminas sin bono, la duración quedará pendiente como incidencia.</p> : null}
      {error ? <p className="error">{error}</p> : null}<div className="actions"><button className="btn ghost" type="button" onClick={close}>Seguir en clase</button><button className="btn" disabled={busy || manualDuration <= 0 || billingMode === "quick"}><CheckCircle2 size={17} /> {busy ? "Terminando…" : "Terminar clase"}</button></div>
    </form>
  </section></div>;
}'''

pattern = re.compile(r'function FinishClassModal\(.*?\nfunction LiveSession\(', re.S)
match = pattern.search(text)
if not match:
    raise SystemExit("FinishClassModal block not found")
text = text[:match.start()] + new_finish + "\nfunction LiveSession(" + text[match.end():]
app_path.write_text(text)

migration = r'''-- CYA Hub v28
-- Administrative class close: no attendance prompt, supplements and individual-to-pair balance transfer.

create table if not exists public.class_financial_items (
  id bigint generated by default as identity primary key,
  class_id bigint not null references public.classes(id) on delete cascade,
  item_type text not null check (item_type in ('supplement','pair_transfer')),
  concept text not null check (char_length(btrim(concept)) between 1 and 120),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  minutes integer check (minutes is null or minutes > 0),
  person_id bigint references public.people(id) on delete set null,
  source_grant_id bigint references public.credit_grants(id) on delete set null,
  target_grant_id bigint references public.credit_grants(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists class_financial_items_class_idx on public.class_financial_items(class_id, created_at);
create index if not exists class_financial_items_source_grant_idx on public.class_financial_items(source_grant_id) where source_grant_id is not null;
create index if not exists class_financial_items_target_grant_idx on public.class_financial_items(target_grant_id) where target_grant_id is not null;

alter table public.class_financial_items enable row level security;
drop policy if exists class_financial_items_staff_all on public.class_financial_items;
create policy class_financial_items_staff_all on public.class_financial_items
for all using ((select private.is_staff())) with check ((select private.is_staff()));

create or replace function public.administratively_finish_class_v4(
  p_class_id bigint,
  p_person_ids bigint[],
  p_grant_ids bigint[] default null,
  p_duration_minutes integer default null,
  p_direct_payment_price_cents integer default null,
  p_pair_transfer_source_grant_id bigint default null,
  p_pair_transfer_fee_cents integer default 0,
  p_supplements jsonb default '[]'::jsonb
)
returns public.classes
language plpgsql
set search_path=''
as $$
declare
  v_class public.classes;
  v_result public.classes;
  v_class_people bigint[];
  v_expected integer;
  v_effective_grants bigint[];
  v_attendance text[];
  v_duration integer;
  v_source public.credit_grants;
  v_source_people bigint[];
  v_source_person bigint;
  v_source_balance integer;
  v_transfer_minutes integer;
  v_target public.credit_grants;
  v_extra jsonb;
  v_extra_concept text;
  v_extra_amount integer;
  v_supplement_total integer:=0;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para terminar clases.' using errcode='42501';
  end if;

  select * into v_class from public.classes where id=p_class_id for update;
  if not found then raise exception 'La clase no existe.' using errcode='P0002'; end if;
  if v_class.status='finished' and v_class.administrative_finished_at is not null then return v_class; end if;
  if v_class.status<>'active' then raise exception 'Solo se puede terminar una clase activa.' using errcode='22023'; end if;

  select coalesce(array_agg(person_id order by person_id),'{}'::bigint[]) into v_class_people
    from public.class_participants where class_id=p_class_id;
  v_expected:=cardinality(v_class_people);
  if cardinality(coalesce(p_person_ids,'{}'::bigint[]))<>v_expected
     or (select count(distinct x) from unnest(coalesce(p_person_ids,'{}'::bigint[])) x)<>v_expected
     or (select count(*) from unnest(coalesce(p_person_ids,'{}'::bigint[])) x where x=any(v_class_people))<>v_expected then
    raise exception 'La lista de alumnos no coincide con la clase.' using errcode='22023';
  end if;

  v_effective_grants:=coalesce(p_grant_ids,array_fill(null::bigint,array[v_expected]));
  if cardinality(v_effective_grants)<>v_expected then
    raise exception 'La selección de bonos no coincide con la clase.' using errcode='22023';
  end if;
  v_duration:=coalesce(p_duration_minutes,v_class.duration_minutes);
  if v_duration is null or v_duration<=0 or v_duration>480 then
    raise exception 'La duración debe estar entre 1 y 480 minutos.' using errcode='22023';
  end if;

  if p_supplements is null then p_supplements:='[]'::jsonb; end if;
  if jsonb_typeof(p_supplements)<>'array' then raise exception 'Los suplementos no son válidos.' using errcode='22023'; end if;
  if jsonb_array_length(p_supplements)>20 then raise exception 'No se pueden añadir más de 20 suplementos por clase.' using errcode='22023'; end if;

  if p_direct_payment_price_cents is not null and p_pair_transfer_source_grant_id is not null then
    raise exception 'Elige pago de clase suelta o transferencia de saldo, no ambos.' using errcode='22023';
  end if;
  if (p_direct_payment_price_cents is not null or p_pair_transfer_source_grant_id is not null)
     and exists(select 1 from unnest(v_effective_grants) g where g is not null) then
    raise exception 'No se puede combinar un bono seleccionado con esta forma de cobro.' using errcode='22023';
  end if;
  if p_pair_transfer_source_grant_id is null and coalesce(p_pair_transfer_fee_cents,0)<>0 then
    raise exception 'El coste de conversión requiere una transferencia de saldo.' using errcode='22023';
  end if;

  if p_pair_transfer_source_grant_id is not null then
    if v_class.class_type<>'pair' then raise exception 'Solo una clase en pareja puede recibir saldo individual.' using errcode='22023'; end if;
    if coalesce(p_pair_transfer_fee_cents,0)<0 then raise exception 'El coste adicional no puede ser negativo.' using errcode='22023'; end if;

    select * into v_source from public.credit_grants
      where id=p_pair_transfer_source_grant_id and modality='individual' and status='active'
        and (expires_at is null or expires_at>now())
      for update;
    if not found then raise exception 'El bono individual seleccionado no está activo o ha caducado.' using errcode='22023'; end if;

    select coalesce(array_agg(person_id order by person_id),'{}'::bigint[]) into v_source_people
      from public.credit_grant_members where grant_id=v_source.id;
    if cardinality(v_source_people)<>1 or not (v_source_people[1]=any(v_class_people)) then
      raise exception 'El bono individual no pertenece a uno de los alumnos de esta clase.' using errcode='22023';
    end if;
    v_source_person:=v_source_people[1];
    select coalesce(sum(delta_minutes),0)::integer into v_source_balance from public.credit_movements where grant_id=v_source.id;
    if v_source_balance<=0 then raise exception 'El bono individual no tiene saldo disponible.' using errcode='22023'; end if;

    v_transfer_minutes:=least(v_source_balance,v_duration);
    select * into v_target from public.create_credit_grant(
      v_class_people,'pair',v_transfer_minutes,0,'Transferencia a pareja','paid'
    );
    insert into public.credit_movements(grant_id,person_id,class_id,movement_type,delta_minutes,note,created_by)
    values(v_source.id,v_source_person,p_class_id,'adjustment',-v_transfer_minutes,
      'Transferencia a bono de pareja '||v_target.id::text,(select auth.uid()));
    if v_source_balance-v_transfer_minutes<=0 then
      update public.credit_grants set status='exhausted',updated_at=now() where id=v_source.id;
    end if;
    v_effective_grants:=array_fill(v_target.id,array[v_expected]);

    insert into public.class_financial_items(class_id,item_type,concept,amount_cents,minutes,person_id,source_grant_id,target_grant_id,created_by)
    values(p_class_id,'pair_transfer','Conversión de saldo individual a pareja',coalesce(p_pair_transfer_fee_cents,0),v_transfer_minutes,v_source_person,v_source.id,v_target.id,(select auth.uid()));
  end if;

  v_attendance:=array_fill('present'::text,array[v_expected]);
  v_result:=public.administratively_finish_class_v3(
    p_class_id,
    p_person_ids,
    v_attendance,
    v_effective_grants,
    v_duration,
    p_direct_payment_price_cents
  );

  for v_extra in select value from jsonb_array_elements(p_supplements) as s(value) loop
    if jsonb_typeof(v_extra)<>'object' then raise exception 'Suplemento no válido.' using errcode='22023'; end if;
    v_extra_concept:=btrim(coalesce(v_extra->>'concept',''));
    if char_length(v_extra_concept)<1 or char_length(v_extra_concept)>120 then raise exception 'El concepto del suplemento no es válido.' using errcode='22023'; end if;
    if coalesce(v_extra->>'amount_cents','') !~ '^[0-9]+$' then raise exception 'El importe del suplemento no es válido.' using errcode='22023'; end if;
    v_extra_amount:=(v_extra->>'amount_cents')::integer;
    if v_extra_amount<=0 or v_extra_amount>10000000 then raise exception 'El importe del suplemento no es válido.' using errcode='22023'; end if;
    insert into public.class_financial_items(class_id,item_type,concept,amount_cents,created_by)
    values(p_class_id,'supplement',v_extra_concept,v_extra_amount,(select auth.uid()));
    v_supplement_total:=v_supplement_total+v_extra_amount;
  end loop;

  insert into public.audit_events(event_type,entity_type,entity_id,summary,detail,actor_user_id)
  values('class_financial_close','class',p_class_id::text,'Cierre económico de clase',
    jsonb_build_object(
      'duration_minutes',v_duration,
      'supplement_total_cents',v_supplement_total,
      'pair_transfer_source_grant_id',p_pair_transfer_source_grant_id,
      'pair_transfer_minutes',v_transfer_minutes,
      'pair_transfer_fee_cents',case when p_pair_transfer_source_grant_id is null then 0 else coalesce(p_pair_transfer_fee_cents,0) end,
      'direct_payment_price_cents',p_direct_payment_price_cents
    ),(select auth.uid()));

  return v_result;
end;
$$;
'''
Path("supabase/v28-class-close-extras.sql").write_text(migration)

test = r'''import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("app/cya-app.tsx", "utf8");
const sql = fs.readFileSync("supabase/v28-class-close-extras.sql", "utf8");
const start = app.indexOf("function FinishClassModal(");
const end = app.indexOf("\nfunction LiveSession(", start);
const finish = app.slice(start, end);

test("class close no longer asks for attendance", () => {
  assert.ok(finish);
  assert.doesNotMatch(finish, /Asistencia|Ha venido|No ha venido/);
  assert.doesNotMatch(finish, /p_attendance/);
  assert.match(finish, /administratively_finish_class_v4/);
  assert.match(sql, /administratively_finish_class_v4/);
  assert.doesNotMatch(sql.match(/administratively_finish_class_v4\([\s\S]*?\)\nreturns/)?.[0] ?? "", /p_attendance/);
  assert.match(sql, /array_fill\('present'::text/);
});

test("multiple supplements are editable, removable and persisted as structured rows", () => {
  assert.match(finish, /Suplementos/);
  assert.match(finish, /Añadir/);
  assert.match(finish, /Parking, desplazamiento/);
  assert.match(finish, /removeSupplement/);
  assert.match(finish, /p_supplements: supplementPayload/);
  assert.match(sql, /class_financial_items/);
  assert.match(sql, /item_type in \('supplement','pair_transfer'\)/);
  assert.match(sql, /jsonb_array_elements\(p_supplements\)/);
});

test("pair classes can transfer individual credit with an extra fee and full traceability", () => {
  assert.match(app, /transferableIndividualCreditsForPair/);
  assert.match(finish, /Transferir saldo individual/);
  assert.match(finish, /Coste adicional/);
  assert.match(finish, /p_pair_transfer_source_grant_id/);
  assert.match(finish, /p_pair_transfer_fee_cents/);
  assert.match(sql, /modality='individual'/);
  assert.match(sql, /v_transfer_minutes:=least\(v_source_balance,v_duration\)/);
  assert.match(sql, /'adjustment',-v_transfer_minutes/);
  assert.match(sql, /'pair',v_transfer_minutes,0,'Transferencia a pareja','paid'/);
  assert.match(sql, /source_grant_id,target_grant_id/);
});

test("final summary includes duration, payment path, extras and current economic total", () => {
  assert.match(finish, /Total económico registrado ahora/);
  assert.match(finish, /supplementTotalCents/);
  assert.match(finish, /transferFeeCents/);
  assert.match(finish, /directPriceCents/);
  assert.match(finish, /quickCreatedChargeCents/);
});
'''
Path("tests/class-close-extras.test.mjs").write_text(test)

for test_path in [Path("tests/no-real-time-class-duration.test.mjs"), Path("tests/compatible-credit-selection.test.mjs")]:
    current = test_path.read_text()
    current = current.replace("administratively_finish_class_v3", "administratively_finish_class_v4")
    if test_path.name == "no-real-time-class-duration.test.mjs":
        current = current.replace("p_actual_duration_minutes: manualDuration", "p_duration_minutes: manualDuration")
    test_path.write_text(current)
