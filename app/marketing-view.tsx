"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BarChart3, CalendarDays, CheckCircle2, CircleUserRound, ExternalLink, FolderOpen,
  Image as ImageIcon, Mail, Megaphone, MessageCircle, NotebookPen, Pencil, Plus, Search,
  ShieldCheck, TrendingUp, UsersRound, Video, WalletCards, X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

export type DriveMedia = {
  id: number; media_type: "image" | "video"; provider: string; external_file_id: string; title: string | null;
};

export type CrmContact = {
  id: number; auth_user_id: string | null; display_name: string; first_name: string | null; last_name: string | null;
  email: string | null; phone: string | null; country_code: string | null; crm_stage: string; source: string | null;
  notes: string | null; created_at: string;
  student_profiles: Array<{ person_id: number; active: boolean }>;
  crm_profiles: Array<{ contact_date: string; inquiry: string | null; reserved: boolean; rate_id: number | null; quoted_amount_cents: number | null; contact_permission: string }>;
};

export type MarketingRate = {
  id: number; name: string; rate_type: string; duration_minutes: number | null; price_cents: number; currency: string;
  description: string | null; active: boolean; sort_order: number;
};

export type MarketingContent = {
  id: number; title: string; channel: string; content_type: string; status: string; body: string | null;
  planned_for: string | null; published_at: string | null; updated_at: string;
  marketing_content_media: DriveMedia[];
};

export type MarketingEvent = {
  id: number; title: string; status: string; starts_at: string; ends_at: string | null; location: string | null;
  description: string | null; capacity: number | null; price_cents: number | null; registration_url: string | null;
};

export type MarketingCampaign = {
  id: number; title: string; channel: string; objective: string | null; audience_scope: string; status: string;
  message: string | null; event_id: number | null; budget_cents: number | null; scheduled_at: string | null;
  starts_at: string | null; ends_at: string | null; updated_at: string;
  marketing_campaign_media: DriveMedia[];
};

export type CampaignMetric = {
  id: number; campaign_id: number; metric_date: string; spend_cents: number; impressions: number; reach: number;
  clicks: number; inquiries: number; bookings: number; revenue_cents: number;
};

export type CommunicationRecipient = {
  id: number; campaign_id: number; person_id: number; channel: "whatsapp" | "email"; destination: string | null;
  message_snapshot: string; media_snapshot: DriveMedia[]; status: "ready" | "sent" | "skipped" | "failed";
  blocked_reason: string | null; prepared_at: string; sent_at: string | null; updated_at: string;
  person: { display_name: string; country_code: string | null } | null;
  campaign: { title: string } | null;
};
type DispatchValidation = {
  allowed: boolean; reason: string | null; channel: "whatsapp" | "email" | null; destination: string | null;
  message_snapshot: string | null; campaign_title: string | null;
};

type Tab = "crm" | "content" | "campaigns" | "messages" | "events" | "rates" | "stats";

const stageLabels: Record<string, string> = {
  new: "Nuevo", contacted: "Contactado", interested: "Interesado", booked: "Reservó", student: "Alumno", lost: "No continúa",
};
const channelLabels: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", whatsapp: "WhatsApp", email: "Email", website: "Web", other: "Otro",
};
const socialChannels = [["instagram","Instagram"],["facebook","Facebook"]] as const;
const campaignChannels = [["whatsapp","WhatsApp"],["email","Email"],["instagram","Instagram"],["facebook","Facebook"]] as const;
const contentTypeLabels: Record<string, string> = {
  post: "Post", story: "Story", reel: "Reel", ad: "Anuncio", email: "Email", message: "Mensaje", other: "Otro",
};
const contentStatusLabels: Record<string, string> = { idea: "Idea", planned: "Planificado", ready: "Listo", published: "Publicado", archived: "Archivado" };
const campaignStatusLabels: Record<string, string> = { draft: "Borrador", scheduled: "Programada", active: "Activa", completed: "Finalizada", cancelled: "Cancelada" };
const eventStatusLabels: Record<string, string> = { planned: "Preparando", open: "Abierto", completed: "Finalizado", cancelled: "Cancelado" };
const rateTypeLabels: Record<string, string> = { individual: "Individual", pair: "Pareja", event: "Evento", other: "Otra" };
const communicationStatusLabels: Record<CommunicationRecipient["status"], string> = { ready: "Listo", sent: "Enviado", skipped: "Revisar", failed: "Error" };
const DRIVE_MARKETING_FOLDER_URL = "https://drive.google.com/drive/folders/15yyQh7wV730e3ynm_Qv3YrSS9Aeofx-3";

function euros(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function shortDate(value: string | null) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function driveId(value: string) {
  const trimmed = value.trim();
  const pathMatch = trimmed.match(/\/d\/([^/?#]+)/);
  const queryMatch = trimmed.match(/[?&]id=([^&#]+)/);
  return decodeURIComponent(pathMatch?.[1] ?? queryMatch?.[1] ?? trimmed);
}

function driveFileUrl(fileId: string) {
  return `https://drive.google.com/open?id=${encodeURIComponent(fileId)}`;
}

function newDriveMedia(form: FormData) {
  const references = form.getAll("media_reference").map((value) => String(value).trim());
  const types = form.getAll("media_type").map((value) => String(value));
  const titles = form.getAll("media_title").map((value) => String(value).trim());
  return references.flatMap((reference,index) => reference ? [{
    external_file_id: driveId(reference),
    media_type: types[index] === "video" ? "video" as const : "image" as const,
    title: titles[index] || null,
  }] : []);
}

function messageLink(dispatch: DispatchValidation) {
  if (!dispatch.destination || !dispatch.message_snapshot || !dispatch.channel) return "#";
  if (dispatch.channel === "whatsapp") return `https://wa.me/${dispatch.destination}?text=${encodeURIComponent(dispatch.message_snapshot)}`;
  return `mailto:${encodeURIComponent(dispatch.destination)}?subject=${encodeURIComponent(dispatch.campaign_title ?? "Carlos & Andy")}&body=${encodeURIComponent(dispatch.message_snapshot)}`;
}

function DriveMediaFields({ existing = [] }: { existing?: DriveMedia[] }) {
  const [rows,setRows] = useState([0]);
  return <details className="progressive-fields drive-fields"><summary>Añadir fotos o vídeos desde Drive</summary><div className="drive-fields-body">
    <div className="drive-folder-row"><div><strong>Carpeta de campañas</strong><span>Los archivos siguen siendo privados en vuestro Drive.</span></div><a className="btn ghost" href={DRIVE_MARKETING_FOLDER_URL} target="_blank" rel="noreferrer"><FolderOpen/> Abrir Drive</a></div>
    {existing.length ? <div className="existing-media"><span>Ya añadidos</span><div>{existing.map((media) => <a key={media.id} href={driveFileUrl(media.external_file_id)} target="_blank" rel="noreferrer">{media.media_type === "video" ? <Video/> : <ImageIcon/>}<span>{media.title || (media.media_type === "video" ? "Vídeo" : "Foto")}</span><ExternalLink/></a>)}</div></div> : null}
    <div className="drive-media-rows">{rows.map((row,index) => <div className="drive-media-row" key={row}><label className="field"><span>Tipo</span><select name="media_type"><option value="image">Foto</option><option value="video">Vídeo</option></select></label><label className="field"><span>Nombre</span><input name="media_title" placeholder="Opcional"/></label><label className="field drive-reference"><span>Enlace o ID de Drive</span><input name="media_reference" placeholder="Pega el enlace del archivo"/></label>{rows.length > 1 ? <button type="button" className="icon-btn drive-remove" onClick={() => setRows((current) => current.filter((value) => value !== row))} aria-label={`Quitar archivo ${index + 1}`}><X/></button> : null}</div>)}</div>
    <button type="button" className="text-button add-media-row" onClick={() => setRows((current) => [...current,Math.max(...current) + 1])}><Plus/> Añadir otro archivo</button>
  </div></details>;
}

function Header({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <header className="marketing-section-head"><div><h2>{title}</h2><p>{description}</p></div>{action}</header>;
}

function Empty({ icon: Icon, title, text, action }: { icon: typeof UsersRound; title: string; text: string; action?: React.ReactNode }) {
  return <div className="empty marketing-empty"><Icon /><strong>{title}</strong><p>{text}</p>{action}</div>;
}

function ContactEditor({ db, contact, rates, close, saved }: { db: SupabaseClient; contact: CrmContact | null; rates: MarketingRate[]; close: () => void; saved: (message: string) => Promise<void> }) {
  const profile = contact?.crm_profiles?.[0];
  const [busy,setBusy] = useState(false), [error,setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const first = String(form.get("first_name") || "").trim();
    if (!first) return setError("Escribe el nombre del contacto.");
    setBusy(true); setError("");
    const result = await db.rpc("save_crm_contact", {
      p_person_id: contact?.id ?? null, p_first_name: first, p_last_name: String(form.get("last_name") || "").trim() || null,
      p_email: String(form.get("email") || "").trim() || null, p_phone: String(form.get("phone") || "").trim() || null,
      p_country_code: String(form.get("country_code") || "").trim() || null, p_crm_stage: String(form.get("crm_stage") || "new"),
      p_source: String(form.get("source") || "").trim() || null, p_contact_date: String(form.get("contact_date") || "") || null,
      p_inquiry: String(form.get("inquiry") || "").trim() || null, p_reserved: String(form.get("reserved") || "no") === "yes",
      p_rate_id: Number(form.get("rate_id") || 0) || null, p_quoted_amount_cents: form.get("quoted_amount") === "" ? null : Math.round(Number(form.get("quoted_amount") || 0) * 100),
      p_notes: String(form.get("notes") || "").trim() || null, p_contact_permission: String(form.get("contact_permission") || "unknown"),
    });
    if (result.error) { setError(result.error.message); setBusy(false); return; }
    await saved(contact ? "Contacto actualizado." : "Contacto creado."); setBusy(false); close();
  }
  return <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><section className="modal crm-modal" role="dialog" aria-modal="true">
    <header className="modal-head"><div><p className="eyebrow">CRM</p><h2>{contact ? "Editar contacto" : "Nuevo contacto"}</h2></div><button className="icon-btn" onClick={close} aria-label="Cerrar"><X /></button></header>
    <form className="modal-body" onSubmit={submit}>
      <div className="fields-2">
        <label className="field"><span>Nombre *</span><input name="first_name" required autoFocus defaultValue={contact?.first_name ?? contact?.display_name ?? ""} /></label>
        <label className="field"><span>Apellidos</span><input name="last_name" defaultValue={contact?.last_name ?? ""} /></label>
        <label className="field"><span>Teléfono</span><input name="phone" type="tel" defaultValue={contact?.phone ?? ""} /></label>
        <label className="field"><span>País</span><input name="country_code" maxLength={2} placeholder="ES" defaultValue={contact?.country_code ?? ""} /></label>
        <label className="field field-wide"><span>Email</span><input name="email" type="email" defaultValue={contact?.email ?? ""} /></label>
      </div>
      <details className="progressive-fields" open={Boolean(contact)}><summary>Añadir información comercial</summary><div className="fields-2">
        <label className="field"><span>Fecha</span><input name="contact_date" type="date" defaultValue={profile?.contact_date ?? new Date().toISOString().slice(0,10)} /></label>
        <label className="field"><span>Estado</span><select name="crm_stage" defaultValue={contact?.crm_stage ?? "new"}>{Object.entries(stageLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field field-wide"><span>¿Cómo nos conoció?</span><input name="source" defaultValue={contact?.source ?? ""} placeholder="Instagram, recomendación, evento…" /></label>
        <label className="field field-wide"><span>¿Qué quería?</span><input name="inquiry" defaultValue={profile?.inquiry ?? ""} placeholder="Clase privada, pareja, evento…" /></label>
        <label className="field"><span>¿Reservó?</span><select name="reserved" defaultValue={profile?.reserved ? "yes" : "no"}><option value="no">No</option><option value="yes">Sí</option></select></label>
        <label className="field"><span>Tarifa</span><select name="rate_id" defaultValue={profile?.rate_id ?? ""}><option value="">Sin asignar</option>{rates.filter((rate) => rate.active || rate.id === profile?.rate_id).map((rate) => <option key={rate.id} value={rate.id}>{rate.name} · {euros(rate.price_cents)}</option>)}</select></label>
        <label className="field"><span>Importe (€)</span><input name="quoted_amount" type="number" min="0" step="0.01" defaultValue={profile?.quoted_amount_cents != null ? profile.quoted_amount_cents / 100 : ""} /></label>
        <label className="field"><span>Comunicaciones</span><select name="contact_permission" defaultValue={profile?.contact_permission ?? "unknown"}><option value="unknown">Sin indicar</option><option value="allowed">Permitidas</option><option value="blocked">No contactar</option></select></label>
        <label className="field field-wide"><span>Observaciones</span><textarea name="notes" rows={3} defaultValue={contact?.notes ?? ""} /></label>
      </div></details>
      {error ? <p className="error">{error}</p> : null}<div className="actions"><button type="button" className="btn ghost" onClick={close}>Cancelar</button><button className="btn" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button></div>
    </form>
  </section></div>;
}

function CrmView({ db, contacts, rates, refresh, notify }: { db: SupabaseClient; contacts: CrmContact[]; rates: MarketingRate[]; refresh: () => Promise<void>; notify: (message: string) => void }) {
  const [query,setQuery] = useState(""), [stage,setStage] = useState("all"), [editing,setEditing] = useState<CrmContact|null>(null), [creating,setCreating] = useState(false), [busyId,setBusyId] = useState<number|null>(null);
  const filtered = useMemo(() => contacts.filter((contact) => stage === "all" || contact.crm_stage === stage).filter((contact) => {
    const q = query.trim().toLocaleLowerCase("es"); if (!q) return true;
    return [contact.display_name,contact.phone,contact.email,contact.source,contact.crm_profiles?.[0]?.inquiry].some((value) => String(value || "").toLocaleLowerCase("es").includes(q));
  }), [contacts,query,stage]);
  async function enable(contact: CrmContact) {
    setBusyId(contact.id); const result = await db.rpc("enable_provisional_student", { p_person_id: contact.id });
    if (result.error) notify(result.error.message); else { await refresh(); notify(`${contact.display_name} ya tiene ficha provisional sin perder sus datos.`); }
    setBusyId(null);
  }
  const saved = async (message: string) => { await refresh(); notify(message); };
  return <>
    <Header title="CRM" description="Potenciales, provisionales y alumnos comparten una sola ficha." action={<button className="btn" onClick={() => setCreating(true)}><Plus size={17} /> Nuevo contacto</button>} />
    <div className="crm-pipeline"><button className={stage === "all" ? "active" : ""} onClick={() => setStage("all")}><span>Todos</span><strong>{contacts.length}</strong></button>{Object.entries(stageLabels).map(([value,label]) => <button key={value} className={stage === value ? "active" : ""} onClick={() => setStage(value)}><span>{label}</span><strong>{contacts.filter((c) => c.crm_stage === value).length}</strong></button>)}</div>
    <label className="search"><Search /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar nombre, teléfono, origen o interés" /></label>
    {filtered.length ? <div className="crm-list">{filtered.map((contact) => { const profile = contact.crm_profiles?.[0], provisional = contact.student_profiles?.some((item) => item.active); return <article className="card crm-row" key={contact.id}>
      <span className="avatar"><CircleUserRound /></span><div className="crm-row-main"><div><strong>{contact.display_name}</strong><span className={`badge stage-${contact.crm_stage}`}>{stageLabels[contact.crm_stage] ?? contact.crm_stage}</span>{provisional ? <span className="badge portal">Ficha alumno</span> : null}</div><p>{contact.phone || contact.email || "Sin contacto"}{contact.source ? ` · ${contact.source}` : ""}</p>{profile?.inquiry ? <small>{profile.inquiry}</small> : null}</div>
      <div className="crm-row-actions">{!provisional ? <button className="btn ghost" disabled={busyId === contact.id} onClick={() => enable(contact)}>{busyId === contact.id ? "Habilitando…" : "Habilitar provisional"}</button> : null}<button className="icon-btn" onClick={() => setEditing(contact)} aria-label={`Editar ${contact.display_name}`}><Pencil /></button></div>
    </article>; })}</div> : <Empty icon={UsersRound} title={contacts.length ? "No hay coincidencias" : "CRM vacío"} text={contacts.length ? "Prueba otro filtro o búsqueda." : "Añade el primer contacto. Solo pediremos lo imprescindible al principio."} action={!contacts.length ? <button className="btn" onClick={() => setCreating(true)}><Plus size={17} /> Nuevo contacto</button> : undefined} />}
    {creating ? <ContactEditor db={db} contact={null} rates={rates} close={() => setCreating(false)} saved={saved} /> : null}
    {editing ? <ContactEditor key={editing.id} db={db} contact={editing} rates={rates} close={() => setEditing(null)} saved={saved} /> : null}
  </>;
}

function ContentEditor({ db, item, close, saved }: { db: SupabaseClient; item: MarketingContent | null; close: () => void; saved: (message: string) => Promise<void> }) {
  const [busy,setBusy] = useState(false), [error,setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError("");
    const result = await db.rpc("save_marketing_content_with_media", { p_content_id: item?.id ?? null, p_title: String(form.get("title") || "").trim(), p_channel: String(form.get("channel") || "instagram"), p_content_type: String(form.get("content_type") || "post"), p_status: String(form.get("status") || "idea"), p_body: String(form.get("body") || "").trim() || null, p_planned_for: form.get("planned_for") ? new Date(String(form.get("planned_for"))).toISOString() : null, p_media: newDriveMedia(form) });
    if (result.error) { setError(result.error.message); setBusy(false); return; }
    await saved(item ? "Contenido actualizado." : "Contenido creado."); setBusy(false); close();
  }
  return <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><section className="modal" role="dialog" aria-modal="true"><header className="modal-head"><div><p className="eyebrow">Contenido</p><h2>{item ? "Editar pieza" : "Nueva pieza"}</h2></div><button className="icon-btn" onClick={close}><X /></button></header><form className="modal-body" onSubmit={submit}><div className="fields-2">
    <label className="field field-wide"><span>Título *</span><input name="title" required autoFocus defaultValue={item?.title ?? ""} /></label>
    <label className="field"><span>Canal</span><select name="channel" defaultValue={item?.channel ?? "instagram"}>{socialChannels.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    <label className="field"><span>Formato</span><select name="content_type" defaultValue={item?.content_type ?? "post"}>{Object.entries(contentTypeLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    <label className="field"><span>Estado</span><select name="status" defaultValue={item?.status ?? "idea"}>{Object.entries(contentStatusLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    <label className="field"><span>Planificado para</span><input name="planned_for" type="datetime-local" defaultValue={localDateTime(item?.planned_for ?? null)} /></label>
    <label className="field field-wide"><span>Texto / idea</span><textarea name="body" rows={4} defaultValue={item?.body ?? ""} /></label>
  </div><DriveMediaFields existing={item?.marketing_content_media ?? []}/>
  {error ? <p className="error">{error}</p> : null}<div className="actions"><button type="button" className="btn ghost" onClick={close}>Cancelar</button><button className="btn" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button></div></form></section></div>;
}

function ContentView({ db, items, refresh, notify }: { db: SupabaseClient; items: MarketingContent[]; refresh: () => Promise<void>; notify: (message: string) => void }) {
  const [creating,setCreating] = useState(false), [editing,setEditing] = useState<MarketingContent|null>(null);
  const saved = async (message: string) => { await refresh(); notify(message); };
  return <><Header title="Contenido" description="Ideas, publicaciones y mensajes en una sola planificación." action={<button className="btn" onClick={() => setCreating(true)}><Plus size={17} /> Crear contenido</button>} />
    {items.length ? <div className="marketing-card-grid">{items.map((item) => <article className="card marketing-item" key={item.id}><div className="marketing-item-top"><span className="marketing-icon"><NotebookPen /></span><div><span>{channelLabels[item.channel]} · {contentTypeLabels[item.content_type]}</span><h3>{item.title}</h3></div><button className="icon-btn" onClick={() => setEditing(item)} aria-label="Editar"><Pencil /></button></div><div className="marketing-item-meta"><span className="badge">{contentStatusLabels[item.status]}</span><span>{item.planned_for ? shortDate(item.planned_for) : "Sin fecha"}</span>{item.marketing_content_media.length ? <span className="media-pill">{item.marketing_content_media.some((m) => m.media_type === "video") ? <Video /> : <ImageIcon />} {item.marketing_content_media.length}</span> : null}</div>{item.body ? <p>{item.body}</p> : null}</article>)}</div> : <Empty icon={NotebookPen} title="Todavía no hay contenido" text="Guarda ideas rápidas o planifica una pieza completa con foto o vídeo." action={<button className="btn" onClick={() => setCreating(true)}><Plus size={17} /> Crear contenido</button>} />}
    {creating ? <ContentEditor db={db} item={null} close={() => setCreating(false)} saved={saved} /> : null}{editing ? <ContentEditor key={editing.id} db={db} item={editing} close={() => setEditing(null)} saved={saved} /> : null}
  </>;
}

function EventEditor({ db, item, close, saved }: { db: SupabaseClient; item: MarketingEvent | null; close: () => void; saved: (message: string) => Promise<void> }) {
  const [busy,setBusy] = useState(false), [error,setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const f=new FormData(event.currentTarget); setBusy(true); setError(""); const start=String(f.get("starts_at")||""); const end=String(f.get("ends_at")||"");
    const result=await db.rpc("save_marketing_event",{p_event_id:item?.id??null,p_title:String(f.get("title")||"").trim(),p_status:String(f.get("status")||"planned"),p_starts_at:start?new Date(start).toISOString():null,p_ends_at:end?new Date(end).toISOString():null,p_location:String(f.get("location")||"").trim()||null,p_description:String(f.get("description")||"").trim()||null,p_capacity:Number(f.get("capacity")||0)||null,p_price_cents:f.get("price")===""?null:Math.round(Number(f.get("price")||0)*100),p_registration_url:String(f.get("registration_url")||"").trim()||null});
    if(result.error){setError(result.error.message);setBusy(false);return;} await saved(item?"Evento actualizado.":"Evento creado.");setBusy(false);close(); }
  return <div className="backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&close()}><section className="modal" role="dialog" aria-modal="true"><header className="modal-head"><div><p className="eyebrow">Eventos</p><h2>{item?"Editar evento":"Nuevo evento"}</h2></div><button className="icon-btn" onClick={close}><X /></button></header><form className="modal-body" onSubmit={submit}><div className="fields-2"><label className="field field-wide"><span>Nombre *</span><input name="title" required defaultValue={item?.title??""}/></label><label className="field"><span>Estado</span><select name="status" defaultValue={item?.status??"planned"}>{Object.entries(eventStatusLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="field"><span>Precio (€)</span><input name="price" type="number" min="0" step="0.01" defaultValue={item?.price_cents!=null?item.price_cents/100:""}/></label><label className="field"><span>Empieza *</span><input name="starts_at" required type="datetime-local" defaultValue={localDateTime(item?.starts_at??null)}/></label><label className="field"><span>Termina</span><input name="ends_at" type="datetime-local" defaultValue={localDateTime(item?.ends_at??null)}/></label><label className="field"><span>Lugar</span><input name="location" defaultValue={item?.location??""}/></label><label className="field"><span>Aforo</span><input name="capacity" type="number" min="1" defaultValue={item?.capacity??""}/></label><label className="field field-wide"><span>Descripción</span><textarea name="description" rows={3} defaultValue={item?.description??""}/></label><label className="field field-wide"><span>Enlace de inscripción</span><input name="registration_url" type="url" defaultValue={item?.registration_url??""}/></label></div>{error?<p className="error">{error}</p>:null}<div className="actions"><button type="button" className="btn ghost" onClick={close}>Cancelar</button><button className="btn" disabled={busy}>{busy?"Guardando…":"Guardar"}</button></div></form></section></div>;
}

function EventsView({ db, items, refresh, notify }: { db: SupabaseClient; items: MarketingEvent[]; refresh: () => Promise<void>; notify: (message: string) => void }) {
  const [creating,setCreating]=useState(false),[editing,setEditing]=useState<MarketingEvent|null>(null); const saved=async(m:string)=>{await refresh();notify(m);};
  return <><Header title="Eventos" description="Organiza el evento y enlaza después sus campañas." action={<button className="btn" onClick={()=>setCreating(true)}><Plus size={17}/> Nuevo evento</button>}/>{items.length?<div className="marketing-card-grid">{items.map(item=><article className="card marketing-item event-item" key={item.id}><div className="marketing-item-top"><span className="marketing-icon"><CalendarDays/></span><div><span>{eventStatusLabels[item.status]}</span><h3>{item.title}</h3></div><button className="icon-btn" onClick={()=>setEditing(item)}><Pencil/></button></div><div className="marketing-item-meta"><span>{shortDate(item.starts_at)}</span>{item.location?<span>{item.location}</span>:null}{item.price_cents!=null?<span>{euros(item.price_cents)}</span>:null}</div>{item.description?<p>{item.description}</p>:null}</article>)}</div>:<Empty icon={CalendarDays} title="No hay eventos" text="Crea el próximo y luego podrás vincularle su promoción." action={<button className="btn" onClick={()=>setCreating(true)}><Plus size={17}/> Nuevo evento</button>}/>} {creating?<EventEditor db={db} item={null} close={()=>setCreating(false)} saved={saved}/>:null}{editing?<EventEditor key={editing.id} db={db} item={editing} close={()=>setEditing(null)} saved={saved}/>:null}</>;
}

function CampaignEditor({ db, item, events, close, saved }: { db: SupabaseClient; item: MarketingCampaign | null; events: MarketingEvent[]; close: () => void; saved: (message: string) => Promise<void> }) {
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); const f=new FormData(event.currentTarget); setBusy(true); setError(""); const scheduled=String(f.get("scheduled_at")||"");
    const result=await db.rpc("save_marketing_campaign_with_media",{p_campaign_id:item?.id??null,p_title:String(f.get("title")||"").trim(),p_channel:String(f.get("channel")||"whatsapp"),p_objective:String(f.get("objective")||"").trim()||null,p_audience_scope:String(f.get("audience_scope")||"potential"),p_status:String(f.get("status")||"draft"),p_message:String(f.get("message")||"").trim()||null,p_event_id:Number(f.get("event_id")||0)||null,p_budget_cents:f.get("budget")===""?null:Math.round(Number(f.get("budget")||0)*100),p_scheduled_at:scheduled?new Date(scheduled).toISOString():null,p_starts_at:null,p_ends_at:null,p_media:newDriveMedia(f)});
    if(result.error){setError(result.error.message);setBusy(false);return;}
    await saved(item?"Campaña actualizada.":"Campaña creada.");setBusy(false);close();
  }
  return <div className="backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&close()}><section className="modal campaign-modal" role="dialog" aria-modal="true"><header className="modal-head"><div><p className="eyebrow">Campañas</p><h2>{item?"Editar campaña":"Nueva campaña"}</h2></div><button className="icon-btn" onClick={close} aria-label="Cerrar"><X/></button></header><form className="modal-body" onSubmit={submit}><div className="fields-2">
    <label className="field field-wide"><span>Nombre *</span><input name="title" required defaultValue={item?.title??""}/></label>
    <label className="field"><span>Canal</span><select name="channel" defaultValue={item?.channel??"whatsapp"}>{campaignChannels.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    <label className="field"><span>Estado</span><select name="status" defaultValue={item?.status??"draft"}>{Object.entries(campaignStatusLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    <label className="field"><span>Audiencia</span><select name="audience_scope" defaultValue={item?.audience_scope??"potential"}><option value="potential">Potenciales</option><option value="students">Alumnos</option><option value="all">Todos</option><option value="custom">Personalizada</option></select></label>
    <label className="field"><span>Programada para</span><input name="scheduled_at" type="datetime-local" defaultValue={localDateTime(item?.scheduled_at??null)}/></label>
    <label className="field"><span>Evento</span><select name="event_id" defaultValue={item?.event_id??""}><option value="">Sin evento</option>{events.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
    <label className="field"><span>Presupuesto (€)</span><input name="budget" type="number" min="0" step="0.01" defaultValue={item?.budget_cents!=null?item.budget_cents/100:""}/></label>
    <label className="field field-wide"><span>Objetivo</span><input name="objective" defaultValue={item?.objective??""} placeholder="Reservas, evento, reactivación…"/></label>
    <label className="field field-wide"><span>Mensaje</span><textarea name="message" rows={5} defaultValue={item?.message??""} placeholder="Hola {nombre}…"/><small className="field-hint">Personaliza con {"{nombre}"}, {"{nombre_completo}"}, {"{evento}"} y {"{enlace}"}.</small></label>
  </div><DriveMediaFields existing={item?.marketing_campaign_media ?? []}/>{error?<p className="error">{error}</p>:null}<div className="actions"><button type="button" className="btn ghost" onClick={close}>Cancelar</button><button className="btn" disabled={busy}>{busy?"Guardando…":"Guardar"}</button></div></form></section></div>;
}

function MetricsEditor({ db, campaign, metrics, close, saved }: { db: SupabaseClient; campaign: MarketingCampaign; metrics: CampaignMetric[]; close: () => void; saved: (message: string) => Promise<void> }) {
  const today=new Date().toISOString().slice(0,10), current=metrics.find(m=>m.campaign_id===campaign.id&&m.metric_date===today); const[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const f=new FormData(event.currentTarget);setBusy(true);const result=await db.rpc("save_marketing_campaign_metrics",{p_campaign_id:campaign.id,p_metric_date:String(f.get("metric_date")||today),p_spend_cents:Math.round(Number(f.get("spend")||0)*100),p_impressions:Number(f.get("impressions")||0),p_reach:Number(f.get("reach")||0),p_clicks:Number(f.get("clicks")||0),p_inquiries:Number(f.get("inquiries")||0),p_bookings:Number(f.get("bookings")||0),p_revenue_cents:Math.round(Number(f.get("revenue")||0)*100)});if(result.error){setError(result.error.message);setBusy(false);return;}await saved("Resultados guardados.");setBusy(false);close();}
  return <div className="backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&close()}><section className="modal" role="dialog" aria-modal="true"><header className="modal-head"><div><p className="eyebrow">Resultados</p><h2>{campaign.title}</h2></div><button className="icon-btn" onClick={close}><X/></button></header><form className="modal-body" onSubmit={submit}><div className="fields-2"><label className="field"><span>Fecha</span><input name="metric_date" type="date" defaultValue={today}/></label><label className="field"><span>Gasto (€)</span><input name="spend" type="number" min="0" step="0.01" defaultValue={current?.spend_cents?current.spend_cents/100:0}/></label><label className="field"><span>Impresiones</span><input name="impressions" type="number" min="0" defaultValue={current?.impressions??0}/></label><label className="field"><span>Alcance</span><input name="reach" type="number" min="0" defaultValue={current?.reach??0}/></label><label className="field"><span>Clics</span><input name="clicks" type="number" min="0" defaultValue={current?.clicks??0}/></label><label className="field"><span>Consultas</span><input name="inquiries" type="number" min="0" defaultValue={current?.inquiries??0}/></label><label className="field"><span>Reservas</span><input name="bookings" type="number" min="0" defaultValue={current?.bookings??0}/></label><label className="field"><span>Ingresos (€)</span><input name="revenue" type="number" min="0" step="0.01" defaultValue={current?.revenue_cents?current.revenue_cents/100:0}/></label></div>{error?<p className="error">{error}</p>:null}<div className="actions"><button type="button" className="btn ghost" onClick={close}>Cancelar</button><button className="btn" disabled={busy}>{busy?"Guardando…":"Guardar resultados"}</button></div></form></section></div>;
}

function CampaignsView({ db, items, events, metrics, refresh, notify }: { db: SupabaseClient; items: MarketingCampaign[]; events: MarketingEvent[]; metrics: CampaignMetric[]; refresh: () => Promise<void>; notify: (message: string) => void }) {
  const[creating,setCreating]=useState(false),[editing,setEditing]=useState<MarketingCampaign|null>(null),[measuring,setMeasuring]=useState<MarketingCampaign|null>(null);const saved=async(m:string)=>{await refresh();notify(m);};
  return <><Header title="Campañas" description="Mensaje, audiencia, evento y archivos listos en el mismo sitio." action={<button className="btn" onClick={()=>setCreating(true)}><Plus size={17}/> Nueva campaña</button>}/>{items.length?<div className="marketing-card-grid">{items.map(item=>{const own=metrics.filter(m=>m.campaign_id===item.id);const bookings=own.reduce((s,m)=>s+m.bookings,0);return <article className="card marketing-item" key={item.id}><div className="marketing-item-top"><span className="marketing-icon"><Megaphone/></span><div><span>{channelLabels[item.channel]}</span><h3>{item.title}</h3></div><button className="icon-btn" onClick={()=>setEditing(item)}><Pencil/></button></div><div className="marketing-item-meta"><span className="badge">{campaignStatusLabels[item.status]}</span>{item.scheduled_at?<span>{shortDate(item.scheduled_at)}</span>:null}{item.marketing_campaign_media.length?<span className="media-pill">{item.marketing_campaign_media.some(m=>m.media_type==="video")?<Video/>:<ImageIcon/>} {item.marketing_campaign_media.length}</span>:null}</div>{item.message?<p>{item.message}</p>:null}<div className="campaign-foot"><span>{bookings?`${bookings} reservas registradas`:"Sin resultados aún"}</span><button className="text-button" onClick={()=>setMeasuring(item)}>Registrar resultados</button></div></article>;})}</div>:<Empty icon={Megaphone} title="No hay campañas" text="Prepara la primera con mensaje, audiencia y archivos de Drive." action={<button className="btn" onClick={()=>setCreating(true)}><Plus size={17}/> Nueva campaña</button>}/>} {creating?<CampaignEditor db={db} item={null} events={events} close={()=>setCreating(false)} saved={saved}/>:null}{editing?<CampaignEditor key={editing.id} db={db} item={editing} events={events} close={()=>setEditing(null)} saved={saved}/>:null}{measuring?<MetricsEditor key={measuring.id} db={db} campaign={measuring} metrics={metrics} close={()=>setMeasuring(null)} saved={saved}/>:null}</>;
}

function audienceContacts(campaign: MarketingCampaign, contacts: CrmContact[]) {
  if(campaign.audience_scope==="potential") return contacts.filter((contact)=>["new","contacted","interested","booked"].includes(contact.crm_stage));
  if(campaign.audience_scope==="students") return contacts.filter((contact)=>contact.crm_stage==="student");
  if(campaign.audience_scope==="all") return contacts.filter((contact)=>contact.crm_stage!=="lost");
  return contacts;
}

function communicationProblem(contact: CrmContact, channel: string) {
  const permission=contact.crm_profiles?.[0]?.contact_permission ?? "unknown";
  if(permission==="blocked") return "No contactar";
  if(permission!=="allowed") return "Permiso sin confirmar";
  if(channel==="whatsapp"&&!contact.phone) return "Sin teléfono";
  if(channel==="email"&&!contact.email) return "Sin email";
  return null;
}

function PrepareCampaignModal({db,campaign,contacts,close,saved}:{db:SupabaseClient;campaign:MarketingCampaign;contacts:CrmContact[];close:()=>void;saved:(message:string)=>Promise<void>}){
  const scoped=useMemo(()=>audienceContacts(campaign,contacts),[campaign,contacts]);
  const eligible=useMemo(()=>scoped.filter((contact)=>!communicationProblem(contact,campaign.channel)),[scoped,campaign.channel]);
  const [selected,setSelected]=useState<number[]>(()=>campaign.audience_scope==="custom"?eligible.map((contact)=>contact.id):[]);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function prepare(){
    if(campaign.audience_scope==="custom"&&!selected.length){setError("Selecciona al menos un destinatario listo para contactar.");return;}
    setBusy(true);setError("");
    const result=await db.rpc("prepare_campaign_recipients",{p_campaign_id:campaign.id,p_person_ids:campaign.audience_scope==="custom"?selected:null});
    if(result.error){setError(result.error.message);setBusy(false);return;}
    const row=(Array.isArray(result.data)?result.data[0]:result.data) as {ready_count?:number;skipped_count?:number;sent_count?:number}|null;
    await saved(`${Number(row?.ready_count||0)} listos · ${Number(row?.sent_count||0)} enviados · ${Number(row?.skipped_count||0)} para revisar.`);setBusy(false);close();
  }
  return <div className="backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&close()}><section className="modal communication-modal" role="dialog" aria-modal="true"><header className="modal-head"><div><p className="eyebrow">Comunicaciones</p><h2>Preparar destinatarios</h2></div><button className="icon-btn" onClick={close} aria-label="Cerrar"><X/></button></header><div className="modal-body">
    <div className="prepare-summary"><span className="marketing-icon">{campaign.channel==="whatsapp"?<MessageCircle/>:<Mail/>}</span><div><strong>{campaign.title}</strong><span>{channelLabels[campaign.channel]} · {scoped.length} en la audiencia</span></div></div>
    <div className="prepare-counts"><div><strong>{eligible.length}</strong><span>Listos</span></div><div><strong>{scoped.length-eligible.length}</strong><span>Revisar</span></div></div>
    {campaign.audience_scope==="custom"?<div className="recipient-picker">{scoped.map((contact)=>{const problem=communicationProblem(contact,campaign.channel),checked=selected.includes(contact.id);return <label className={problem?"disabled":""} key={contact.id}><input type="checkbox" disabled={Boolean(problem)} checked={checked} onChange={(event)=>setSelected((current)=>event.target.checked?[...current,contact.id]:current.filter((id)=>id!==contact.id))}/><span><strong>{contact.display_name}</strong><small>{problem || (campaign.channel==="whatsapp"?contact.phone:contact.email)}</small></span></label>;})}</div>:<div className="permission-note"><ShieldCheck/><p><strong>La lista se prepara, no se envía todavía.</strong><span>CYA excluye automáticamente “No contactar”, permisos sin confirmar y contactos sin el dato necesario.</span></p></div>}
    {error?<p className="error">{error}</p>:null}<div className="actions"><button type="button" className="btn ghost" onClick={close}>Cancelar</button><button type="button" className="btn" disabled={busy||!eligible.length} onClick={prepare}>{busy?"Preparando…":"Preparar lista"}</button></div>
  </div></section></div>;
}

function CommunicationsView({db,contacts,campaigns,recipients,refresh,notify}:{db:SupabaseClient;contacts:CrmContact[];campaigns:MarketingCampaign[];recipients:CommunicationRecipient[];refresh:()=>Promise<void>;notify:(message:string)=>void}){
  const [preparing,setPreparing]=useState<MarketingCampaign|null>(null),[busyId,setBusyId]=useState<number|null>(null);
  const direct=campaigns.filter((campaign)=>["whatsapp","email"].includes(campaign.channel)&&campaign.status!=="cancelled");
  const saved=async(message:string)=>{await refresh();notify(message);};
  async function openMessage(recipient:CommunicationRecipient){
    setBusyId(recipient.id);
    const result=await db.rpc("validate_communication_dispatch",{p_recipient_id:recipient.id});
    if(result.error){notify(result.error.message);setBusyId(null);return;}
    const dispatch=(Array.isArray(result.data)?result.data[0]:result.data) as DispatchValidation|null;
    if(!dispatch?.allowed){await refresh();notify(dispatch?.reason||"Revisa el permiso o los datos del contacto y prepara la lista de nuevo.");setBusyId(null);return;}
    const href=messageLink(dispatch);setBusyId(null);window.location.assign(href);
  }
  async function markSent(recipient:CommunicationRecipient){
    setBusyId(recipient.id);const result=await db.rpc("mark_communication_sent",{p_recipient_id:recipient.id});
    if(result.error) notify(result.error.message); else await saved(`${recipient.person?.display_name||"Contacto"}: mensaje registrado como enviado.`);
    setBusyId(null);
  }
  return <><Header title="Comunicaciones" description="Prepara mensajes personalizados y abre cada conversación desde CYA Hub." action={<a className="btn ghost" href={DRIVE_MARKETING_FOLDER_URL} target="_blank" rel="noreferrer"><FolderOpen/> Multimedia</a>}/>
    <div className="communication-info"><ShieldCheck/><div><strong>Sin envíos accidentales</strong><span>CYA prepara el texto y la audiencia; WhatsApp o tu correo hacen el envío final. Después lo confirmas aquí y queda registrado en el CRM.</span></div></div>
    {direct.length?<div className="communication-batches">{direct.map((campaign)=>{const own=recipients.filter((recipient)=>recipient.campaign_id===campaign.id),ready=own.filter((item)=>item.status==="ready").length,sent=own.filter((item)=>item.status==="sent").length,skipped=own.filter((item)=>item.status==="skipped").length;return <article className="card communication-batch" key={campaign.id}>
      <header className="communication-batch-head"><span className="marketing-icon">{campaign.channel==="whatsapp"?<MessageCircle/>:<Mail/>}</span><div><span>{channelLabels[campaign.channel]}</span><h3>{campaign.title}</h3></div><button className="btn ghost" onClick={()=>setPreparing(campaign)}><UsersRound/> {own.length?"Actualizar lista":"Preparar lista"}</button></header>
      <div className="communication-stats"><span><strong>{ready}</strong> listos</span><span><strong>{sent}</strong> enviados</span><span className={skipped?"attention":""}><strong>{skipped}</strong> revisar</span>{campaign.marketing_campaign_media.length?<span><strong>{campaign.marketing_campaign_media.length}</strong> adjuntos</span>:null}</div>
      {own.length?<div className="communication-recipient-list">{[...own].sort((a,b)=>({ready:0,failed:1,skipped:2,sent:3}[a.status]-{ready:0,failed:1,skipped:2,sent:3}[b.status])).map((recipient)=><div className={`communication-recipient status-${recipient.status}`} key={recipient.id}><span className="avatar"><CircleUserRound/></span><div className="communication-recipient-main"><div><strong>{recipient.person?.display_name||"Contacto"}</strong><span className={`badge communication-${recipient.status}`}>{communicationStatusLabels[recipient.status]}</span></div><span>{recipient.destination||recipient.blocked_reason||"Sin destino"}</span><details><summary>Ver mensaje</summary><p>{recipient.message_snapshot}</p>{recipient.media_snapshot.length?<div className="communication-media"><span>Adjuntos de Drive</span><div>{recipient.media_snapshot.map((media)=><a key={`${recipient.id}-${media.id}`} href={driveFileUrl(media.external_file_id)} target="_blank" rel="noreferrer">{media.media_type==="video"?<Video/>:<ImageIcon/>}{media.title||"Abrir archivo"}<ExternalLink/></a>)}</div></div>:null}</details></div>
        <div className="communication-recipient-actions">{recipient.status==="ready"?<><button className="btn" disabled={busyId===recipient.id} onClick={()=>openMessage(recipient)}>{recipient.channel==="whatsapp"?<MessageCircle/>:<Mail/>} {busyId===recipient.id?"Comprobando…":`Abrir ${channelLabels[recipient.channel]}`}</button><button className="btn ghost" disabled={busyId===recipient.id} onClick={()=>markSent(recipient)}><CheckCircle2/> {busyId===recipient.id?"Guardando…":"Ya enviado"}</button></>:recipient.status==="sent"?<span className="sent-stamp"><CheckCircle2/> {recipient.sent_at?shortDate(recipient.sent_at):"Enviado"}</span>:<span className="recipient-problem">{recipient.blocked_reason||"Revisa este contacto"}</span>}</div>
      </div>)}</div>:<div className="communication-empty"><MessageCircle/><span>Prepara la lista para ver aquí a cada destinatario.</span></div>}
    </article>;})}</div>:<Empty icon={MessageCircle} title="No hay campañas de mensajes" text="Crea una campaña por WhatsApp o email y aparecerá aquí para preparar su envío."/>}
    {preparing?<PrepareCampaignModal db={db} campaign={preparing} contacts={contacts} close={()=>setPreparing(null)} saved={saved}/>:null}
  </>;
}

function RateEditor({ db, item, close, saved }: { db: SupabaseClient; item: MarketingRate | null; close: () => void; saved: (message: string) => Promise<void> }) {
  const[busy,setBusy]=useState(false),[error,setError]=useState("");async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const f=new FormData(event.currentTarget);setBusy(true);const hours=Number(f.get("hours")||0),minutes=Number(f.get("minutes")||0),duration=hours*60+minutes;const r=await db.rpc("save_marketing_rate",{p_rate_id:item?.id??null,p_name:String(f.get("name")||"").trim(),p_rate_type:String(f.get("rate_type")||"individual"),p_duration_minutes:duration||null,p_price_cents:Math.round(Number(f.get("price")||0)*100),p_description:String(f.get("description")||"").trim()||null,p_active:String(f.get("active")||"yes")==="yes"});if(r.error){setError(r.error.message);setBusy(false);return;}await saved(item?"Tarifa actualizada.":"Tarifa creada.");setBusy(false);close();}
  const hours=Math.floor((item?.duration_minutes??0)/60),minutes=(item?.duration_minutes??0)%60;return <div className="backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&close()}><section className="modal" role="dialog" aria-modal="true"><header className="modal-head"><div><p className="eyebrow">Tarifas</p><h2>{item?"Editar tarifa":"Nueva tarifa"}</h2></div><button className="icon-btn" onClick={close}><X/></button></header><form className="modal-body" onSubmit={submit}><div className="fields-2"><label className="field field-wide"><span>Nombre *</span><input name="name" required defaultValue={item?.name??""} placeholder="Ej. Clase individual 1 h"/></label><label className="field"><span>Tipo</span><select name="rate_type" defaultValue={item?.rate_type??"individual"}>{Object.entries(rateTypeLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label className="field"><span>Precio (€)</span><input name="price" type="number" min="0" step="0.01" defaultValue={item?item.price_cents/100:0}/></label><label className="field"><span>Horas</span><input name="hours" type="number" min="0" defaultValue={hours}/></label><label className="field"><span>Minutos</span><input name="minutes" type="number" min="0" max="59" defaultValue={minutes}/></label><label className="field"><span>Estado</span><select name="active" defaultValue={item?.active===false?"no":"yes"}><option value="yes">Activa</option><option value="no">Oculta</option></select></label><label className="field field-wide"><span>Descripción</span><textarea name="description" rows={3} defaultValue={item?.description??""}/></label></div>{error?<p className="error">{error}</p>:null}<div className="actions"><button type="button" className="btn ghost" onClick={close}>Cancelar</button><button className="btn" disabled={busy}>{busy?"Guardando…":"Guardar"}</button></div></form></section></div>;
}

function RatesView({ db, items, refresh, notify }: { db: SupabaseClient; items: MarketingRate[]; refresh: () => Promise<void>; notify: (message: string) => void }) {
  const[creating,setCreating]=useState(false),[editing,setEditing]=useState<MarketingRate|null>(null);const saved=async(m:string)=>{await refresh();notify(m);};return <><Header title="Tarifas" description="Una tarifa se puede reutilizar desde el CRM sin volver a escribir importes." action={<button className="btn" onClick={()=>setCreating(true)}><Plus size={17}/> Nueva tarifa</button>}/>{items.length?<div className="rate-grid">{items.map(item=><article className={`card rate-card ${item.active?"":"muted-card"}`} key={item.id}><div><span>{rateTypeLabels[item.rate_type]}</span><h3>{item.name}</h3><strong>{euros(item.price_cents)}</strong>{item.duration_minutes?<small>{Math.floor(item.duration_minutes/60)?`${Math.floor(item.duration_minutes/60)} h `:""}{item.duration_minutes%60?`${item.duration_minutes%60} min`:""}</small>:null}</div><button className="icon-btn" onClick={()=>setEditing(item)}><Pencil/></button></article>)}</div>:<Empty icon={WalletCards} title="Aún no hay tarifas" text="Añade vuestro formato de precios y quedará disponible en cada contacto." action={<button className="btn" onClick={()=>setCreating(true)}><Plus size={17}/> Nueva tarifa</button>}/>} {creating?<RateEditor db={db} item={null} close={()=>setCreating(false)} saved={saved}/>:null}{editing?<RateEditor key={editing.id} db={db} item={editing} close={()=>setEditing(null)} saved={saved}/>:null}</>;
}

function StatsView({ contacts, campaigns, content, metrics }: { contacts: CrmContact[]; campaigns: MarketingCampaign[]; content: MarketingContent[]; metrics: CampaignMetric[] }) {
  const students=contacts.filter(c=>c.crm_stage==="student").length,booked=contacts.filter(c=>c.crm_stage==="student"||c.crm_profiles?.[0]?.reserved).length,activeLeads=contacts.filter(c=>!["student","lost"].includes(c.crm_stage)).length;
  const totalSpend=metrics.reduce((s,m)=>s+m.spend_cents,0),totalRevenue=metrics.reduce((s,m)=>s+m.revenue_cents,0),totalClicks=metrics.reduce((s,m)=>s+m.clicks,0),totalInquiries=metrics.reduce((s,m)=>s+m.inquiries,0),totalBookings=metrics.reduce((s,m)=>s+m.bookings,0);
  const conversion=contacts.length?Math.round((students/contacts.length)*100):0,roi=totalSpend?Math.round(((totalRevenue-totalSpend)/totalSpend)*100):null;
  const sources=Object.entries(contacts.reduce<Record<string,number>>((acc,c)=>{const key=c.source?.trim()||"Sin indicar";acc[key]=(acc[key]||0)+1;return acc;},{})).sort((a,b)=>b[1]-a[1]).slice(0,6);
  return <><Header title="Estadísticas" description="Conversión comercial y resultados de campañas, sin mezclar números estimados con datos reales."/><div className="stats-grid"><article className="stat-card"><UsersRound/><span>Potenciales activos</span><strong>{activeLeads}</strong></article><article className="stat-card"><CheckCircle2/><span>Reservaron</span><strong>{booked}</strong></article><article className="stat-card"><TrendingUp/><span>Conversión a alumno</span><strong>{conversion}%</strong></article><article className="stat-card"><NotebookPen/><span>Contenido publicado</span><strong>{content.filter(i=>i.status==="published").length}</strong></article></div><section className="grid-2 marketing-stats-sections"><article className="card pad"><div className="card-head"><h2>Campañas</h2><span>{campaigns.length}</span></div><div className="stat"><span>Gasto registrado</span><strong>{euros(totalSpend)}</strong></div><div className="stat"><span>Ingresos atribuidos</span><strong>{euros(totalRevenue)}</strong></div><div className="stat"><span>Clics</span><strong>{totalClicks}</strong></div><div className="stat"><span>Consultas → reservas</span><strong>{totalInquiries} → {totalBookings}</strong></div><div className="stat"><span>ROI registrado</span><strong>{roi===null?"—":`${roi}%`}</strong></div></article><article className="card pad"><div className="card-head"><h2>Cómo nos conocen</h2><span>Top</span></div>{sources.length?sources.map(([source,total])=><div className="source-row" key={source}><span>{source}</span><strong>{total}</strong><i style={{width:`${Math.max(8,Math.round((total/contacts.length)*100))}%`}}/></div>):<div className="compact-empty"><BarChart3/><span>Cuando haya contactos aparecerán aquí sus orígenes.</span></div>}</article></section></>;
}

export function MarketingView({ db, contacts, rates, content, events, campaigns, metrics, recipients, refresh, notify }: { db: SupabaseClient; contacts: CrmContact[]; rates: MarketingRate[]; content: MarketingContent[]; events: MarketingEvent[]; campaigns: MarketingCampaign[]; metrics: CampaignMetric[]; recipients: CommunicationRecipient[]; refresh: () => Promise<void>; notify: (message: string) => void }) {
  const [tab,setTab]=useState<Tab>("crm");
  const tabs: Array<[Tab,string,typeof UsersRound]> = [["crm","CRM",UsersRound],["content","Contenido",NotebookPen],["campaigns","Campañas",Megaphone],["messages","Mensajes",MessageCircle],["events","Eventos",CalendarDays],["rates","Tarifas",WalletCards],["stats","Datos",BarChart3]];
  return <><header className="page-head"><div><p className="eyebrow">Marketing</p><h1>Marketing + CRM</h1><p>De la primera consulta a la promoción, todo conectado con la misma persona.</p></div></header><nav className="marketing-tabs" aria-label="Áreas de marketing">{tabs.map(([value,label,Icon])=><button key={value} className={tab===value?"active":""} onClick={()=>setTab(value)}><Icon/><span>{label}</span></button>)}</nav><section className="marketing-workspace">
    {tab==="crm"?<CrmView db={db} contacts={contacts} rates={rates} refresh={refresh} notify={notify}/>:null}
    {tab==="content"?<ContentView db={db} items={content} refresh={refresh} notify={notify}/>:null}
    {tab==="campaigns"?<CampaignsView db={db} items={campaigns} events={events} metrics={metrics} refresh={refresh} notify={notify}/>:null}
    {tab==="messages"?<CommunicationsView db={db} contacts={contacts} campaigns={campaigns} recipients={recipients} refresh={refresh} notify={notify}/>:null}
    {tab==="events"?<EventsView db={db} items={events} refresh={refresh} notify={notify}/>:null}
    {tab==="rates"?<RatesView db={db} items={rates} refresh={refresh} notify={notify}/>:null}
    {tab==="stats"?<StatsView contacts={contacts} campaigns={campaigns} content={content} metrics={metrics}/>:null}
  </section></>;
}
