from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"anchor not found: {label}")
    return text.replace(old, new, 1)

# --- Drive server: route class videos to their own Drive folder ---
p = Path('app/google-drive-server.ts')
text = p.read_text()
text = replace_once(
    text,
    'export const DEFAULT_TEACHING_FOLDER_NAME = "CYA Hub - Enseñanza";\n',
    'export const DEFAULT_TEACHING_FOLDER_NAME = "CYA Hub - Enseñanza";\nexport const DEFAULT_CLASS_VIDEOS_FOLDER_ID = "1QqL1Wt0lNebcTO-2qtUGdgCsOF_IRiV_";\nexport type DriveUploadScope = "teaching" | "class_video";\n',
    'drive constants',
)
old = '''export async function createDriveResumableUpload(name: string, mimeType: string, size: number) {
  const token = await googleAccessToken();
  const folderId = await ensureTeachingFolder(token);
  const response = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id,name,mimeType,webViewLink`, {
'''
new = '''export async function createDriveResumableUpload(name: string, mimeType: string, size: number, scope: DriveUploadScope = "teaching") {
  const token = await googleAccessToken();
  const folderId = scope === "class_video"
    ? (process.env.GOOGLE_DRIVE_CLASS_VIDEOS_FOLDER_ID?.trim() || DEFAULT_CLASS_VIDEOS_FOLDER_ID)
    : await ensureTeachingFolder(token);
  const response = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id,name,mimeType,webViewLink`, {
'''
text = replace_once(text, old, new, 'drive upload scope')
p.write_text(text)

# --- Upload route: accept class_video scope ---
p = Path('app/api/google-drive/upload/route.ts')
text = p.read_text()
text = replace_once(
    text,
    '    if (!accessToken || !(await userCanManageTeaching(accessToken))) return NextResponse.json({ error: "No tienes permiso para subir archivos de Enseñanza." }, { status: 403 });\n\n    const name =',
    '    if (!accessToken || !(await userCanManageTeaching(accessToken))) return NextResponse.json({ error: "No tienes permiso para subir archivos." }, { status: 403 });\n    const scope = request.headers.get("x-cya-media-scope") === "class_video" ? "class_video" : "teaching";\n\n    const name =',
    'upload scope header',
)
text = replace_once(text, '    const location = await createDriveResumableUpload(name, mimeType, size);', '    const location = await createDriveResumableUpload(name, mimeType, size, scope);', 'upload scope call')
p.write_text(text)

# --- Teaching media editor: reusable class videos can be attached as resources ---
p = Path('app/teaching-media-editor.tsx')
text = p.read_text()
text = replace_once(text, 'import { getRuntimeAccessToken } from "./supabase-runtime";', 'import { getRuntimeAccessToken, getRuntimeSupabaseClient } from "./supabase-runtime";', 'runtime client import')
text = replace_once(
    text,
    '''export type TeachingMediaDraft = TeachingCardMedia & {
  _key?: string;
  _local_url?: string;
};
''',
    '''export type TeachingMediaDraft = TeachingCardMedia & {
  _key?: string;
  _local_url?: string;
};

type ReusableClassVideo = {
  id: number;
  external_file_id: string;
  title: string | null;
  mime_type: string | null;
  created_at: string;
};
''',
    'class video type',
)
text = replace_once(
    text,
    'export function TeachingMediaEditor({ value, onChange, onUploadingChange }: { value: TeachingMediaDraft[]; onChange: (items: TeachingMediaDraft[]) => void; onUploadingChange?: (busy: boolean) => void }) {',
    'export function TeachingMediaEditor({ value, onChange, onUploadingChange, allowClassVideos = false }: { value: TeachingMediaDraft[]; onChange: (items: TeachingMediaDraft[]) => void; onUploadingChange?: (busy: boolean) => void; allowClassVideos?: boolean }) {',
    'teaching media signature',
)
text = replace_once(
    text,
    '  const [manualType, setManualType] = useState<"image" | "video">("video"), [manualTitle, setManualTitle] = useState(""), [manualReference, setManualReference] = useState("");\n',
    '  const [manualType, setManualType] = useState<"image" | "video">("video"), [manualTitle, setManualTitle] = useState(""), [manualReference, setManualReference] = useState("");\n  const [classVideoOpen, setClassVideoOpen] = useState(false), [classVideoLoading, setClassVideoLoading] = useState(false), [classVideos, setClassVideos] = useState<ReusableClassVideo[]>([]);\n',
    'class video state',
)
anchor = '''  function setBusy(next: number) {
    setUploading(next);
    onUploadingChange?.(next > 0);
  }
'''
insert = '''  async function toggleClassVideos() {
    if (classVideoOpen) { setClassVideoOpen(false); return; }
    setClassVideoOpen(true); setClassVideoLoading(true); setError("");
    const client = getRuntimeSupabaseClient();
    if (!client) { setError("Sesión no disponible."); setClassVideoLoading(false); return; }
    const result = await client.from("class_video_resources")
      .select("id,external_file_id,title,mime_type,created_at")
      .eq("visibility_scope", "reusable")
      .order("created_at", { ascending: false })
      .limit(100);
    if (result.error) setError(result.error.message);
    else setClassVideos((result.data ?? []) as ReusableClassVideo[]);
    setClassVideoLoading(false);
  }

  function addClassVideo(video: ReusableClassVideo) {
    if (value.some((item) => item.external_file_id === video.external_file_id)) return;
    onChange([...value, {
      _key: `class-video-${video.id}-${Date.now()}`,
      media_type: "video",
      provider: "google_drive",
      external_file_id: video.external_file_id,
      title: video.title || "Vídeo de clase",
      mime_type: video.mime_type,
      group_label: "Vídeos de clase",
      is_cover: false,
      is_preview: false,
      display_in_resources: true,
      thumbnail_external_file_id: null,
      thumbnail_mime_type: null,
      preview_start_seconds: null,
      preview_end_seconds: null,
    }]);
  }

'''+anchor
text = replace_once(text, anchor, insert, 'class video helpers')
text = replace_once(
    text,
    '      <button type="button" className={styles.secondaryButton} onClick={() => setManualOpen((current) => !current)}><Link2 /> Desde Drive</button>\n',
    '      <button type="button" className={styles.secondaryButton} onClick={() => setManualOpen((current) => !current)}><Link2 /> Desde Drive</button>\n      {allowClassVideos ? <button type="button" className={styles.secondaryButton} onClick={() => void toggleClassVideos()}><Video /> Vídeos de clase</button> : null}\n',
    'class video picker button',
)
manual_row = '    {manualOpen ? <div className={styles.manualRow}><select value={manualType} onChange={(event) => setManualType(event.target.value as "image" | "video")}><option value="video">Vídeo</option><option value="image">Foto</option></select><input value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} placeholder="Título" /><input value={manualReference} onChange={(event) => setManualReference(event.target.value)} placeholder="Enlace o ID de Drive" /><button type="button" onClick={addManual}><Plus /> Añadir</button></div> : null}\n'
class_picker = manual_row + '''    {allowClassVideos && classVideoOpen ? <div className={styles.classVideoPicker}>{classVideoLoading ? <span>Buscando vídeos…</span> : classVideos.length ? classVideos.map((video) => <button key={video.id} type="button" onClick={() => addClassVideo(video)} disabled={value.some((item) => item.external_file_id === video.external_file_id)}><Video /><span><strong>{video.title || "Vídeo de clase"}</strong><small>{new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(new Date(video.created_at))}</small></span><Plus /></button>) : <span>No hay vídeos reutilizables todavía.</span>}</div> : null}
'''
text = replace_once(text, manual_row, class_picker, 'class video picker list')
p.write_text(text)

# CSS module for picker
p = Path('app/teaching-media-editor.module.css')
css = p.read_text()
if '.classVideoPicker' not in css:
    css += '''\n.classVideoPicker{display:grid;gap:8px;padding:10px;border:1px solid var(--line);border-radius:16px;background:var(--surface)}
.classVideoPicker>span{font-size:13px;color:var(--muted)}
.classVideoPicker>button{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;min-height:48px;padding:9px 11px;border:1px solid var(--line);border-radius:14px;background:var(--surface);text-align:left}
.classVideoPicker>button>svg{width:20px;height:20px}
.classVideoPicker>button>span{display:grid;gap:2px;min-width:0}
.classVideoPicker>button strong{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.classVideoPicker>button small{font-size:11px;color:var(--muted)}
.classVideoPicker>button:disabled{opacity:.48}
'''
p.write_text(css)

# --- Main app: partial payments, class video upload, private student videos ---
p = Path('app/cya-app.tsx')
text = p.read_text()
text = replace_once(text, 'import { TeachingContentCard, type TeachingCardMedia } from "./teaching-content-card";\n', 'import { TeachingContentCard, type TeachingCardMedia } from "./teaching-content-card";\nimport { SecureDriveAsset } from "./drive-media";\n', 'drive asset import')
text = replace_once(
    text,
    'type ClassNote = { id: number; class_id: number; person_id: number | null; body: string; created_at: string };\n',
    'type ClassNote = { id: number; class_id: number; person_id: number | null; body: string; created_at: string };\ntype ClassPrivateVideo = { id: number; class_id: number; person_id: number; external_file_id: string; title: string | null; mime_type: string | null; created_at: string };\n',
    'class video type main',
)

new_finish = r'''function FinishClassModal({ item, students, credits, library, close, finished }: { item: ClassItem; students: Person[]; credits: CreditItem[]; library: TeachingContent[]; close: () => void; finished: () => Promise<void> }) {
  const [localCredits, setLocalCredits] = useState<CreditItem[]>([]);
  const allCredits = useMemo(() => [...localCredits, ...credits], [localCredits, credits]);
  const [grantIds, setGrantIds] = useState<Record<number, string>>(() => defaultGrantSelection(item, credits));
  const [manualDuration, setManualDuration] = useState(item.duration_minutes);
  const [billingMode, setBillingMode] = useState<"none" | "quick" | "direct" | "transfer">("none");
  const [quickHours, setQuickHours] = useState(5), [quickMinutes, setQuickMinutes] = useState(0), [quickPrice, setQuickPrice] = useState("");
  const initialTransferSources = transferableIndividualCreditsForPair(item, credits);
  const [transferSourceId, setTransferSourceId] = useState(() => initialTransferSources[0] ? String(initialTransferSources[0].id) : "");
  const [transferFee, setTransferFee] = useState("0");
  const [supplements, setSupplements] = useState<Array<{ id: number; concept: string; amount: string }>>([]);
  const [nextSupplementId, setNextSupplementId] = useState(1);
  const [quickCreatedChargeCents, setQuickCreatedChargeCents] = useState(0), [quickCreatedGrantId, setQuickCreatedGrantId] = useState<number | null>(null);
  const [paymentMode, setPaymentMode] = useState<"full" | "half" | "custom" | "none">("full"), [customPayment, setCustomPayment] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null), [videoTitle, setVideoTitle] = useState("");
  const [videoMode, setVideoMode] = useState<"private" | "reusable">("private"), [videoPersonId, setVideoPersonId] = useState(() => item.class_participants[0]?.person_id ?? 0), [videoContentId, setVideoContentId] = useState("");
  const [videoSaved, setVideoSaved] = useState(false);
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
  const reusableVideoContents = library.filter((content) => content.active && ["correction","explanation","sequence"].includes(content.content_type));

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
  function addSupplement() { setSupplements((current) => [...current, { id: nextSupplementId, concept: "", amount: "" }]); setNextSupplementId((current) => current + 1); }
  function updateSupplement(id: number, patch: Partial<{ concept: string; amount: string }>) { setSupplements((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row)); }
  function removeSupplement(id: number) { setSupplements((current) => current.filter((row) => row.id !== id)); }

  async function createQuickBonus() {
    if (!db) return;
    const duration = Math.max(0, quickHours) * 60 + Math.max(0, Math.min(59, quickMinutes));
    const price = moneyCents(quickPrice);
    if (duration <= 0) return setError("Indica la duración del bono.");
    if (price === null) return setError("Indica el importe del bono.");
    setQuickBusy(true); setError("");
    const result = await db.rpc("create_credit_grant", {
      p_student_ids: classPersonIds, p_modality: item.class_type, p_minutes: duration,
      p_price_cents: price, p_label: "Bono rápido", p_payment_status: "pending",
    });
    if (result.error) { setError(result.error.message); setQuickBusy(false); return; }
    const row = (result.data ?? {}) as Partial<CreditItem> & { id?: number };
    const id = Number(row.id || 0);
    if (!id) { setError("No se pudo seleccionar el bono creado."); setQuickBusy(false); return; }
    const created: CreditItem = {
      id, modality: item.class_type, label: row.label ?? "Bono rápido", total_minutes: duration,
      price_cents: price, payment_status: "pending", status: row.status ?? "active",
      purchased_at: row.purchased_at ?? new Date().toISOString(), expires_at: row.expires_at ?? null,
      credit_grant_members: classPersonIds.map((person_id) => ({ person_id })), credit_movements: [{ delta_minutes: duration }],
    };
    setLocalCredits((current) => [created, ...current]);
    setQuickCreatedChargeCents(price); setQuickCreatedGrantId(id);
    selectCreatedGrant(id); setQuickBusy(false);
  }
  function openDirectPayment() { clearGrantSelection(); setBillingMode("direct"); setQuickPrice(""); setError(""); }
  function openPairTransfer() {
    clearGrantSelection(); const preferred = transferSources[0]; if (preferred) setTransferSourceId(String(preferred.id));
    setBillingMode("transfer"); setTransferFee("0"); setError("");
  }

  const supplementTotalCents = supplements.reduce((sum, row) => sum + (moneyCents(row.amount) ?? 0), 0);
  const directPriceCents = billingMode === "direct" ? (moneyCents(quickPrice) ?? 0) : 0;
  const transferFeeCents = billingMode === "transfer" ? (moneyCents(transferFee) ?? 0) : 0;
  const totalEconomicCents = quickCreatedChargeCents + directPriceCents + transferFeeCents + supplementTotalCents;
  const customPaidCents = moneyCents(customPayment);
  const paidNowCents = totalEconomicCents <= 0 ? 0 : paymentMode === "full" ? totalEconomicCents : paymentMode === "half" ? Math.round(totalEconomicCents / 2) : paymentMode === "none" ? 0 : (customPaidCents ?? 0);
  const pendingPaymentCents = Math.max(0, totalEconomicCents - paidNowCents);

  async function saveClassVideo() {
    if (!db || !videoFile || videoSaved) return true;
    if (videoMode === "private" && !videoPersonId) { setError("Selecciona quién recibirá el vídeo."); return false; }
    const sessionResult = await db.auth.getSession();
    const token = sessionResult.data.session?.access_token;
    if (!token) { setError("Tu sesión ha caducado."); return false; }
    const response = await fetch("/api/google-drive/upload", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": videoFile.type || "video/mp4",
        "x-cya-file-name": encodeURIComponent(videoFile.name),
        "x-cya-file-size": String(videoFile.size),
        "x-cya-media-scope": "class_video",
      },
      body: videoFile,
    });
    const payload = await response.json().catch(() => null) as { id?: string; mimeType?: string; error?: string } | null;
    if (!response.ok || !payload?.id) { setError(payload?.error || "No se pudo subir el vídeo a Drive."); return false; }
    const title = videoTitle.trim() || videoFile.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Vídeo de clase";
    const registered = await db.rpc("register_class_video_resource", {
      p_class_id: item.id,
      p_person_id: videoMode === "private" ? videoPersonId : null,
      p_visibility_scope: videoMode === "private" ? "private_student" : "reusable",
      p_external_file_id: payload.id,
      p_title: title,
      p_mime_type: payload.mimeType || videoFile.type || "video/mp4",
      p_size_bytes: videoFile.size,
      p_content_id: videoMode === "reusable" && videoContentId ? Number(videoContentId) : null,
    });
    if (registered.error) { setError(registered.error.message); return false; }
    setVideoSaved(true); return true;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!db) return;
    if (manualDuration <= 0 || manualDuration > 480) return setError("La duración debe estar entre 1 minuto y 8 horas.");
    const directPrice = moneyCents(quickPrice);
    if (billingMode === "direct" && directPrice === null) return setError("Indica el importe de la clase suelta.");
    if (billingMode === "quick") return setError("Crea el bono rápido o cancela esa opción antes de terminar la clase.");
    const pairTransferFee = moneyCents(transferFee);
    if (billingMode === "transfer" && (!transferSourceId || pairTransferFee === null)) return setError("Selecciona el bono individual y el coste adicional.");
    if (billingMode === "transfer" && !transferSources.some((grant) => String(grant.id) === transferSourceId)) return setError("El bono individual seleccionado ya no está disponible.");
    if (paymentMode === "custom" && (customPaidCents === null || customPaidCents > totalEconomicCents)) return setError("Indica un pago válido que no supere el total.");
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
    if (!(await saveClassVideo())) { setBusy(false); return; }
    const result = await db.rpc("administratively_finish_class_v5", {
      p_class_id: item.id,
      p_person_ids: personIds,
      p_grant_ids: billingMode === "direct" || billingMode === "transfer" ? personIds.map(() => null) : personIds.map((id) => grantIds[id] ? Number(grantIds[id]) : null),
      p_duration_minutes: manualDuration,
      p_direct_payment_price_cents: billingMode === "direct" ? directPrice : null,
      p_pair_transfer_source_grant_id: billingMode === "transfer" ? Number(transferSourceId) : null,
      p_pair_transfer_fee_cents: billingMode === "transfer" ? (pairTransferFee ?? 0) : 0,
      p_supplements: supplementPayload,
      p_paid_now_cents: paidNowCents,
      p_quick_created_grant_id: quickCreatedGrantId,
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
        return <section className="finish-person" key={participant.person_id}><strong>{student?.display_name || "Alumno"}</strong><div className="finish-grid"><label className="field"><span>Bono</span><select value={grantIds[participant.person_id] || ""} disabled={billingMode === "direct" || billingMode === "transfer"} onChange={(event) => chooseGrant(participant.person_id, event.target.value)}><option value="">Sin bono</option>{available.map((grant) => { const balance = creditBalance(grant), shortfall = Math.max(0, manualDuration - balance); return <option key={grant.id} value={grant.id}>{grant.label || (grant.modality === "pair" ? "Bono pareja" : "Bono individual")} · {minutesLabel(balance)}{expiryLabel(grant)}{shortfall ? ` · faltarán ${minutesLabel(shortfall)}` : ""}</option>; })}</select></label></div>{grantIds[participant.person_id] ? (() => { const selected = allCredits.find((grant) => String(grant.id) === grantIds[participant.person_id]); const remaining = selected ? Math.max(0, manualDuration - creditBalance(selected)) : manualDuration; return remaining ? <p className="modal-intro">Se consumirá el saldo disponible y quedarán {minutesLabel(remaining)} como incidencia.</p> : null; })() : null}</section>;
      })}</div>

      {!hasSelectedGrant && billingMode === "none" ? <section className="card pad"><div className="card-head"><div><p className="eyebrow">Cobro</p><h2>Sin bono compatible</h2></div></div><div className="actions"><button className="btn ghost" type="button" onClick={() => { setBillingMode("quick"); setQuickPrice(""); setError(""); }}><Plus size={17} /> Crear bono rápido</button>{item.class_type === "pair" && transferSources.length ? <button className="btn ghost" type="button" onClick={openPairTransfer}><WalletCards size={17} /> Transferir saldo individual</button> : null}<button className="btn" type="button" onClick={openDirectPayment}><WalletCards size={17} /> Pagar clase suelta</button></div></section> : null}

      {billingMode === "quick" ? <section className="card pad"><div className="card-head"><div><p className="eyebrow">Bono rápido</p><h2>{item.class_type === "pair" ? "Bono de pareja" : "Bono individual"}</h2></div></div><div className="fields-2"><label className="field"><span>Horas</span><input type="number" min="0" max="1000" value={quickHours} onChange={(event) => setQuickHours(Number(event.target.value || 0))} /></label><label className="field"><span>Minutos</span><input type="number" min="0" max="59" value={quickMinutes} onChange={(event) => setQuickMinutes(Number(event.target.value || 0))} /></label><label className="field field-wide"><span>Importe (€)</span><input type="number" min="0" step="0.01" value={quickPrice} onChange={(event) => setQuickPrice(event.target.value)} /></label></div><p className="modal-intro">El pago se decide en el resumen final.</p><div className="actions"><button className="btn ghost" type="button" onClick={() => { setBillingMode("none"); setError(""); }}>Cancelar</button><button className="btn" type="button" disabled={quickBusy} onClick={() => void createQuickBonus()}><Plus size={17} /> {quickBusy ? "Creando…" : "Crear y usar"}</button></div></section> : null}

      {billingMode === "direct" ? <section className="card pad"><div className="card-head"><div><p className="eyebrow">Clase suelta</p><h2>{minutesLabel(manualDuration)}</h2></div><span className="badge">Clase suelta</span></div><label className="field"><span>Importe (€)</span><input type="number" min="0" step="0.01" value={quickPrice} onChange={(event) => setQuickPrice(event.target.value)} /></label><div className="actions"><button className="btn ghost" type="button" onClick={() => { setBillingMode("none"); setError(""); }}>Cancelar</button></div></section> : null}

      {billingMode === "transfer" ? <section className="card pad"><div className="card-head"><div><p className="eyebrow">Pareja</p><h2>Transferir saldo individual</h2></div><span className="badge">{minutesLabel(transferMinutes)}</span></div><div className="fields-2"><label className="field field-wide"><span>Bono individual</span><select value={transferSourceId} onChange={(event) => setTransferSourceId(event.target.value)}>{transferSources.map((grant) => <option key={grant.id} value={grant.id}>{ownerLabel(grant)} · {grant.label || "Bono individual"} · {minutesLabel(creditBalance(grant))}{expiryLabel(grant)}</option>)}</select></label><label className="field"><span>Coste adicional (€)</span><input type="number" min="0" step="0.01" value={transferFee} onChange={(event) => setTransferFee(event.target.value)} /></label></div>{transferSource ? <p className="modal-intro">Se moverán {minutesLabel(transferMinutes)} del bono individual a un bono de pareja para esta clase.{transferShortfall ? ` Quedarán ${minutesLabel(transferShortfall)} pendientes.` : ""}</p> : null}<div className="actions"><button className="btn ghost" type="button" onClick={() => { setBillingMode("none"); setError(""); }}>Cancelar</button></div></section> : null}

      <section className="card pad"><div className="card-head"><div><p className="eyebrow">Extras</p><h2>Suplementos</h2></div><button className="btn ghost" type="button" onClick={addSupplement}><Plus size={17} /> Añadir</button></div>{supplements.length ? <div className="finish-list">{supplements.map((supplement) => <div className="fields-2" key={supplement.id}><label className="field"><span>Concepto</span><input value={supplement.concept} onChange={(event) => updateSupplement(supplement.id, { concept: event.target.value })} placeholder="Parking, desplazamiento…" /></label><label className="field"><span>Importe (€)</span><input type="number" min="0" step="0.01" value={supplement.amount} onChange={(event) => updateSupplement(supplement.id, { amount: event.target.value })} /></label><div className="actions"><button className="btn ghost" type="button" onClick={() => removeSupplement(supplement.id)}><X size={16} /> Eliminar</button></div></div>)}</div> : <p className="modal-intro">Sin suplementos.</p>}</section>

      <section className="card pad"><div className="card-head"><div><p className="eyebrow">Vídeo</p><h2>Vídeo explicativo</h2></div>{videoSaved ? <span className="badge portal">Guardado</span> : null}</div><label className="field"><span>Seleccionar vídeo</span><input type="file" accept="video/*" disabled={busy || videoSaved} onChange={(event) => { const file = event.target.files?.[0] ?? null; setVideoFile(file); setVideoTitle(file ? file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ") : ""); setVideoSaved(false); }} /></label>{videoFile ? <><div className="segmented"><button type="button" className={videoMode === "private" ? "active" : ""} disabled={videoSaved} onClick={() => { setVideoMode("private"); setVideoContentId(""); }}>Solo para alumno</button><button type="button" className={videoMode === "reusable" ? "active" : ""} disabled={videoSaved} onClick={() => setVideoMode("reusable")}>Reutilizable</button></div><div className="fields-2"><label className="field field-wide"><span>Título</span><input value={videoTitle} disabled={videoSaved} onChange={(event) => setVideoTitle(event.target.value)} /></label>{videoMode === "private" && item.class_type === "pair" ? <label className="field field-wide"><span>Alumno</span><select value={videoPersonId} disabled={videoSaved} onChange={(event) => setVideoPersonId(Number(event.target.value))}>{item.class_participants.map((participant) => <option key={participant.person_id} value={participant.person_id}>{students.find((person) => person.id === participant.person_id)?.display_name || "Alumno"}</option>)}</select></label> : null}{videoMode === "reusable" ? <label className="field field-wide"><span>Añadir ahora a contenido</span><select value={videoContentId} disabled={videoSaved} onChange={(event) => setVideoContentId(event.target.value)}><option value="">Dejar disponible para después</option>{reusableVideoContents.map((content) => <option key={content.id} value={content.id}>{teachingKindLabels[content.content_type]} · {content.title}</option>)}</select></label> : null}</div><p className="modal-intro">{videoMode === "private" ? `Solo estará disponible para ${students.find((person) => person.id === videoPersonId)?.display_name || "este alumno"}.` : "Podrás reutilizarlo como recurso de correcciones, explicaciones o secuencias."}</p></> : <p className="modal-intro">Opcional.</p>}</section>

      <section className="card pad"><div className="card-head"><div><p className="eyebrow">Resumen</p><h2>Cierre</h2></div></div><p className="modal-intro"><strong>Duración:</strong> {minutesLabel(manualDuration)}</p>{selectedGrant ? <p className="modal-intro"><strong>Bono:</strong> {selectedGrant.label || (selectedGrant.modality === "pair" ? "Bono de pareja" : "Bono individual")} · se consumirán hasta {minutesLabel(Math.min(manualDuration, creditBalance(selectedGrant)))}</p> : null}{billingMode === "direct" ? <p className="modal-intro"><strong>Clase suelta:</strong> {euroLabel(directPriceCents)}</p> : null}{billingMode === "transfer" && transferSource ? <p className="modal-intro"><strong>Conversión:</strong> {minutesLabel(transferMinutes)} desde {ownerLabel(transferSource)} · {euroLabel(transferFeeCents)}</p> : null}{supplementTotalCents ? <p className="modal-intro"><strong>Suplementos:</strong> {euroLabel(supplementTotalCents)}</p> : null}{quickCreatedChargeCents ? <p className="modal-intro"><strong>Bono creado ahora:</strong> {euroLabel(quickCreatedChargeCents)}</p> : null}<div className="card-head"><h2>Total de este cierre</h2><strong>{euroLabel(totalEconomicCents)}</strong></div></section>

      {totalEconomicCents > 0 ? <section className="card pad"><div className="card-head"><div><p className="eyebrow">Pago</p><h2>Pago recibido ahora</h2></div><strong>{euroLabel(paidNowCents)}</strong></div><div className="fields-2"><button className={paymentMode === "full" ? "btn" : "btn ghost"} type="button" onClick={() => setPaymentMode("full")}>Todo · {euroLabel(totalEconomicCents)}</button><button className={paymentMode === "half" ? "btn" : "btn ghost"} type="button" onClick={() => setPaymentMode("half")}>Mitad · {euroLabel(Math.round(totalEconomicCents / 2))}</button><button className={paymentMode === "custom" ? "btn" : "btn ghost"} type="button" onClick={() => setPaymentMode("custom")}>Otra cantidad</button><button className={paymentMode === "none" ? "btn" : "btn ghost"} type="button" onClick={() => setPaymentMode("none")}>Nada ahora</button></div>{paymentMode === "custom" ? <label className="field"><span>Importe recibido (€)</span><input type="number" min="0" max={(totalEconomicCents / 100).toFixed(2)} step="0.01" value={customPayment} onChange={(event) => setCustomPayment(event.target.value)} /></label> : null}<div className="card-head"><span>Pagado ahora</span><strong>{euroLabel(paidNowCents)}</strong></div><div className="card-head"><span>Pendiente</span><strong>{euroLabel(pendingPaymentCents)}</strong></div></section> : null}

      {!hasSelectedGrant && billingMode === "none" ? <p className="modal-intro">Si terminas sin bono, la duración quedará pendiente como incidencia.</p> : null}
      {error ? <p className="error">{error}</p> : null}<div className="actions"><button className="btn ghost" type="button" onClick={close}>Seguir en clase</button><button className="btn" disabled={busy || manualDuration <= 0 || billingMode === "quick"}><CheckCircle2 size={17} /> {busy ? "Terminando…" : "Terminar clase"}</button></div>
    </form>
  </section></div>;
}'''
pattern = re.compile(r'function FinishClassModal\([\s\S]*?\n}\nfunction LiveSession\(')
match = pattern.search(text)
if not match:
    raise SystemExit('FinishClassModal block not found')
text = text[:match.start()] + new_finish + '\nfunction LiveSession(' + text[match.end():]

text = replace_once(
    text,
    '<TeachingMediaEditor value={media} onChange={setMedia} onUploadingChange={setMediaUploading} />',
    '<TeachingMediaEditor value={media} onChange={setMedia} onUploadingChange={setMediaUploading} allowClassVideos={["correction","explanation","sequence"].includes(type)} />',
    'teaching class videos prop',
)
text = replace_once(
    text,
    '<span>{finished ? "Puedes terminar notas, evaluación y correcciones antes del cierre pedagógico." : "Asistencia y bono se confirman juntos para no dejar medias operaciones."}</span>',
    '<span>{finished ? "Puedes terminar notas, evaluación y correcciones antes del cierre pedagógico." : "Duración, bono y cobro se confirman juntos antes de cerrar."}</span>',
    'live bottom text',
)
text = replace_once(
    text,
    '{finishOpen ? <FinishClassModal item={item} students={students} credits={credits} close={() => setFinishOpen(false)} finished={async () => { await refresh(); await loadLive(); notify("Clase terminada. Saldo e incidencias actualizados con la duración prevista."); }} /> : null}',
    '{finishOpen ? <FinishClassModal item={item} students={students} credits={credits} library={library} close={() => setFinishOpen(false)} finished={async () => { await refresh(); await loadLive(); notify("Clase terminada. Saldo, cobro e incidencias actualizados."); }} /> : null}',
    'finish modal call',
)

# Student portal private class videos
text = replace_once(
    text,
    '  const [snapshot, setSnapshot] = useState<StudentPortalSnapshot | null>(null), [error, setError] = useState("");\n',
    '  const [snapshot, setSnapshot] = useState<StudentPortalSnapshot | null>(null), [error, setError] = useState("");\n  const [privateVideos, setPrivateVideos] = useState<ClassPrivateVideo[]>([]);\n',
    'student video state',
)
old_load = '''    const result = await db.rpc("student_portal_snapshot");
    if (result.error) { setError(result.error.message); return; }
    setSnapshot(result.data as StudentPortalSnapshot);
'''
new_load = '''    const result = await db.rpc("student_portal_snapshot");
    if (result.error) { setError(result.error.message); return; }
    const nextSnapshot = result.data as StudentPortalSnapshot;
    const videoResult = await db.from("class_video_resources")
      .select("id,class_id,person_id,external_file_id,title,mime_type,created_at")
      .eq("visibility_scope", "private_student")
      .eq("person_id", nextSnapshot.profile.id)
      .order("created_at", { ascending: false });
    if (!videoResult.error) setPrivateVideos((videoResult.data ?? []) as ClassPrivateVideo[]);
    setSnapshot(nextSnapshot);
'''
text = replace_once(text, old_load, new_load, 'student video load')
formation_card_end = '      />)}</div> : <div className="compact-empty"><BookOpen /><span>Cuando te asignemos contenido aparecerá aquí.</span></div>}</article>\n'
video_card = formation_card_end + '      {privateVideos.length ? <article className="card portal-card"><div className="card-head"><h2>Vídeos de mis clases</h2><span>{privateVideos.length}</span></div><div className="portal-video-list">{privateVideos.map((video) => <div className="portal-video-item" key={video.id}><SecureDriveAsset fileId={video.external_file_id} mediaType="video" title={video.title || "Vídeo de clase"} controls className="portal-video-media" /><div><strong>{video.title || "Vídeo de clase"}</strong><span>{new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(new Date(video.created_at))}</span></div></div>)}</div></article> : null}\n'
text = replace_once(text, formation_card_end, video_card, 'student private video card')
p.write_text(text)

# Global CSS for student video cards
p = Path('app/globals.css')
css = p.read_text()
if '.portal-video-list' not in css:
    css += '''\n.portal-video-list{display:grid;gap:14px}
.portal-video-item{display:grid;gap:8px}
.portal-video-item>div:last-child{display:flex;align-items:center;justify-content:space-between;gap:10px}
.portal-video-item>div:last-child strong{font-size:14px}
.portal-video-item>div:last-child span{font-size:12px;color:var(--muted)}
.portal-video-media{width:100%;aspect-ratio:16/9;border-radius:16px;overflow:hidden;background:var(--surface-soft)}
.portal-video-media video{width:100%;height:100%;object-fit:contain}
'''
p.write_text(css)

# Update regression expectations for v5
for filename in ['tests/class-close-extras.test.mjs','tests/no-real-time-class-duration.test.mjs','tests/compatible-credit-selection.test.mjs']:
    p = Path(filename)
    t = p.read_text().replace('administratively_finish_class_v4', 'administratively_finish_class_v5')
    if filename.endswith('class-close-extras.test.mjs'):
        t = t.replace('Total económico registrado ahora', 'Total de este cierre')
    p.write_text(t)
